// 出題の元になる自作のドット絵。公開済みの日付の問題を再現できるよう、生成規則とともに固定する。
const dailyImages = [
    // 傘
    ['0011100', '0111110', '1111111', '0001000', '0001000', '0001010', '0001110'],
    // ろうそく
    ['0001000', '0011100', '0001000', '0011100', '0011100', '0011100', '0111110'],
    // 山
    ['0001000', '0011100', '0011100', '0111110', '0111110', '1111111', '1111111'],
    // 花
    ['0011100', '0111110', '0110110', '0111110', '0011100', '0001000', '0011100'],
    // 家
    ['0001000', '0011100', '0111110', '1111111', '0111110', '0110110', '0110110'],
    // 砂時計
    ['1111111', '0111110', '0011100', '0001000', '0011100', '0111110', '1111111'],
    // カップ
    ['0000000', '1111100', '1000110', '1000101', '1000110', '0111100', '1111110'],
    // 鍵
    ['0111000', '1101100', '1101100', '0111111', '0000011', '0000010', '0000011'],
];
const dailyDateFormat = new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', timeZone: 'UTC' });

function dailyDay(date = new Date()) {
    // 世界で同じタイミングに切り替える。日本標準時は UTC+9。
    const index = Math.floor((date.getTime() + 9 * 3_600_000) / 86_400_000);
    const calendarDate = new Date(index * 86_400_000);
    return {
        key: calendarDate.toISOString().slice(0, 10),
        index,
        label: dailyDateFormat.format(calendarDate),
    };
}

function dailyPalette() {
    return [[255, 255, 255], [173, 48, 36]];
}

function dailyPuzzle(day) {
    let seed = Math.imul(day.index, 0x9e3779b1) || 1;
    function pick(limit) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        return (seed >>> 0) % limit;
    }

    let image = dailyImages[pick(dailyImages.length)].map(row => Array.from(row, Number));
    if (pick(2)) image.reverse();
    if (pick(2)) for (const row of image) row.reverse();
    if (pick(2)) image = transpose(image);

    const blank = 0;
    let matrix = image;
    for (let attempt = 0; attempt < 12; attempt++) {
        const candidate = image.map(row => row.slice());
        const side = candidate.length;
        const first = pick(side * side);
        const second = (first + 1 + pick(side * side - 1)) % (side * side);
        for (const cell of [first, second]) {
            candidate[Math.floor(cell / side)][cell % side] ^= 1;
        }
        const { rows: [rows], columns: [columns] } = makePuzzleClues(candidate, blank);
        if (inspectLineSolvability(rows, columns, blank, [], 196) === 'complete') {
            matrix = candidate;
            break;
        }
    }

    return { matrix, palette: dailyPalette(), blank };
}

function updateDailyPuzzleButton() {
    const day = dailyDay();
    const saved = readDailyProgress(day.key);
    const button = document.getElementById('open-daily-puzzle');
    const date = document.getElementById('daily-date');
    const label = saved?.board?.finished ? '今日の完成盤面を見る'
        : saved ? '今日の問題の続きから' : '今日の問題を遊ぶ';
    if (button.textContent !== label) button.textContent = label;
    if (date.dateTime !== day.key) {
        date.dateTime = day.key;
        date.textContent = day.label;
    }
}

function setupDailyPuzzle() {
    const button = document.getElementById('open-daily-puzzle');
    const status = document.getElementById('daily-status');
    updateDailyPuzzleButton();
    window.addEventListener('focus', updateDailyPuzzleButton);
    window.addEventListener('pageshow', updateDailyPuzzleButton);
    window.addEventListener('storage', event => {
        if (!event.key || event.key === DAILY_PROGRESS_KEY) updateDailyPuzzleButton();
    });
    window.setInterval(updateDailyPuzzleButton, 30_000);

    button.onclick = async () => {
        const day = dailyDay();
        const saved = readDailyProgress(day.key);
        button.disabled = true;
        status.hidden = true;
        try {
            const puzzle = saved ? { ...saved.puzzle, palette: dailyPalette() } : dailyPuzzle(day);
            await startPuzzle(puzzle, {
                daily: day,
                board: saved?.board ?? { quality: 'unique' },
                clock: saved ? createPlayClock(undefined, saved.clock) : undefined,
                progressId: saved?.id,
                fitOnStart: true,
            });
            document.getElementById(saved?.board.paused ? 'pause-play' : 'canvas').focus({ preventScroll: true });
        } catch {
            status.textContent = '今日の問題を開けませんでした。もう一度お試しください。';
            status.hidden = false;
        } finally {
            button.disabled = false;
        }
    };
}
