// 自作のドット絵。日付と絵の対応を保つため、この一覧は固定する。
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
    // 地域の暦を使い、夏時間で1日が23時間・25時間でも日番号を飛ばさない。
    const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const calendarDate = new Date(utc);
    return {
        key: calendarDate.toISOString().slice(0, 10),
        index: Math.floor(utc / 86_400_000),
        label: dailyDateFormat.format(calendarDate),
    };
}

function dailyPuzzle(day) {
    const index = ((day.index % dailyImages.length) + dailyImages.length) % dailyImages.length;
    return {
        matrix: dailyImages[index].map(row => Array.from(row, Number)),
        palette: [[255, 255, 255], [48, 91, 163]],
        blank: 0,
    };
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
            await startPuzzle(saved?.puzzle ?? dailyPuzzle(day), {
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
