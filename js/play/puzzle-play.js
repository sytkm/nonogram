// 問題を開き、盤面の準備・進行・クリアをつなぐ。

let activeBoard;
let playClock;

function finishStroke() {
    return activeBoard?.stopStroke();
}

function setupPlayDisplay() {
    window.addEventListener('resize', () => activeBoard?.redraw());
    const viewport = document.getElementById('pixelcanvas');
    new ResizeObserver(() => {
        if (!viewport.hidden) activeBoard?.redraw();
    }).observe(viewport);
    window.setInterval(() => {
        if (!document.getElementById('play-panel').hidden) updatePlayTime();
    }, 250);
}

function suspendCurrentPuzzle() {
    finishStroke();
    playClock?.suspend();
}

function showPuzzleScreen(clock) {
    playClock = clock;
    showPlayScreen('board');
    updatePlayTime();
}

/**
 * 入力を確定してから時計を止め、その時点の進行を保存する。
 * @param {'home'|'mosaic'} [destination] - プレイを離れた後に表示する画面
 */
function leavePuzzleScreen(destination = 'home') {
    suspendCurrentPuzzle();
    activeBoard?.closeMinimap();
    flushProgress();
    showPlayScreen(destination);
}

/** @param {'home'|'mosaic'|'board'} screen */
function showPlayScreen(screen) {
    const playing = screen === 'board';
    document.getElementById('start-panel').hidden = screen !== 'home';
    document.getElementById('mosaic-panel').hidden = screen !== 'mosaic';
    document.getElementById('play-panel').hidden = !playing;
    const menu = document.getElementById('open-play-menu');
    if (playing) document.querySelector('.mosaic-tile-navigation').before(menu);
    else document.getElementById('site-heading').append(menu);
    document.getElementById('pause-message').hidden = true;
    setPlayAreaVisible(playing);
}

function setPlayAreaVisible(visible) {
    for (const id of ['play-actions', 'pixelcanvas', 'board-side-controls', 'fix-phone-under-menu']) {
        document.getElementById(id).hidden = !visible;
    }
}

function updatePlayTime() {
    const display = document.getElementById('play-time');
    const value = formatPlayTime(playClock?.elapsed() ?? 0);
    if (display.textContent !== value) display.textContent = value;
}

/** @param {((onClose: () => void) => boolean)} [openFirstGuide] - 初回案内を開いた場合は true。 */
async function startPuzzle({ matrix, palette, blank }, options = {}, openFirstGuide) {
    suspendCurrentPuzzle();
    const board = options.board ?? {};
    const hasSavedCells = Boolean(board.cells);
    const { rows: rowClues, columns: columnClues } = makePuzzleClues(matrix, blank);
    if (options.initialCheck) {
        board.quality = options.initialCheck.preparation.quality;
        board.fixedSlashes = options.initialCheck.preparation.fixedSlashes;
    }
    if (!board.quality && !hasSavedCells) {
        const preparation = document.getElementById('prepare-puzzle');
        preparation.oncancel = event => event.preventDefault();
        preparation.showModal();
        try {
            const { result } = requestPuzzleQuality({
                rows: rowClues[0], columns: columnClues[0], blank, answer: matrix,
            });
            const checked = await result;
            board.quality = checked?.quality ?? 'inconclusive';
            board.fixedSlashes = checked?.fixedSlashes ?? [];
        } finally {
            preparation.close();
        }
    }

    const clock = options.clock ?? createPlayClock();
    const playPanel = document.getElementById('play-panel');
    playPanel.classList.remove('is-viewing-tile');
    const result = document.getElementById('board-result');
    const restart = document.getElementById('restart-board');
    const restartDialog = document.getElementById('restart-dialog');
    restart.hidden = false;
    restart.textContent = '最初からやり直す';
    result.textContent = '';
    result.classList.remove('is-complete');
    const fixedSlashes = new Set(board.fixedSlashes);
    const cells = board.cells ??= matrix.map((row, y) => row.map((_, x) =>
        fixedSlashes.has(y * row.length + x) ? -1 : blank));
    board.marks ??= {};
    const usedColors = options.generated && !options.shared
        ? new Set([...palette.slice(1).map((_, i) => i + 1), blank])
        : new Set(matrix.flat());
    const paintColors = [...usedColors].filter(color => color !== blank);

    const widthInCells = matrix[0].length + rowClues[1];
    const heightInCells = matrix.length + columnClues[1];
    const initialCellSize = options.generated
        ? Math.max(10, Math.min(40, Math.floor(500 / Math.max(widthInCells, heightInCells))))
        : options.sample ? 40 : Math.max(Math.round(500 / heightInCells), 10);

    showBoardMenu();
    for (const id of ['line-hint', 'logic-hint']) {
        document.getElementById(id).hidden = options.shared === true;
    }
    showPuzzleScreen(clock);
    let controls;
    try {
        const paletteControls = drawUnderPalette(palette, usedColors, blank, paintColors[0] ?? blank);
        controls = setupBoard({
            answer: matrix, palette, blank, rowClues, columnClues, initialCellSize, clock, board,
            multiColor: paintColors.length > 1, onEdit, fixedSlashes, paletteControls,
        });
        activeBoard = controls;
    } catch (error) {
        leavePuzzleScreen();
        throw error;
    }
    const dailyLabel = document.getElementById('daily-play-label');
    dailyLabel.textContent = options.daily ? '日替わり問題 · ' + options.daily.label : '';
    dailyLabel.hidden = !options.daily;
    const tileLabel = document.getElementById('mosaic-tile-label');
    tileLabel.hidden = !options.tileLabel;
    tileLabel.textContent = options.tileLabel ?? '';
    const returnToMosaic = document.getElementById('return-mosaic');
    returnToMosaic.hidden = !options.onReturn;
    returnToMosaic.onclick = options.onReturn ?? null;
    document.getElementById('board-share').onclick = () =>
        openPlayShare(options.sharePuzzle ?? { matrix, palette, blank }, options.shareSource);

    const download = document.getElementById('downl');
    const clearResult = document.getElementById('board-clear-result');
    clearResult.hidden = true;
    clearResult.onclick = null;
    document.getElementById('answer-tool').hidden = options.shared === true;
    document.getElementById('hint-tools-toggle').textContent = options.shared ? '矛盾チェック' : 'ヒント・答え';
    download.onclick = () => {
        const link = document.createElement('a');
        link.href = document.getElementById('canvas').toDataURL('image/png');
        link.download = 'nonogram.png';
        link.click();
    };
    function showClear(note = '', openResult = false) {
        controls.finish();
        result.classList.add('is-complete');
        if (options.tileLabel) {
            playPanel.classList.add('is-viewing-tile');
            restart.hidden = true;
            document.getElementById('fix-phone-under-menu').hidden = true;
            result.textContent = options.review ? '完成済みの区画を表示しています。' : '区画クリア！' + note;
            returnToMosaic.focus({ preventScroll: true });
        } else {
            clearResult.hidden = false;
            clearResult.onclick = () => showClearResult(clearResult, {
                note,
                download: options.shared !== true,
                restart: !options.daily,
            });
            restart.textContent = 'もう一度遊ぶ';
            restart.hidden = Boolean(options.daily);
            if (openResult) clearResult.click();
        }
    }

    function checkCompletion(save = true, note = '', openResult = false) {
        if (board.finished) return;
        const solved = board.quality === 'unique'
            ? matchesIntendedImage(matrix, cells, blank)
            : checkNumber(rowClues, cells, blank) && checkNumber(columnClues, transpose(cells), blank);
        if (!solved) return;
        clock.finish();
        updatePlayTime();
        showClear(note, openResult);
        if (save) queueProgressSave();
        options.onSolved?.();
    }

    function onEdit(note = '') {
        result.textContent = '';
        checkCompletion(true, note, true);
    }

    restart.onclick = () => {
        document.getElementById('restart-message').textContent = options.tileLabel
            ? 'この区画の塗り・斜線・数字のチェックとプレイ時間をリセットします。他の区画の進み具合と、最初からある青い斜線は残ります。'
            : '塗り・斜線・数字のチェックとプレイ時間をリセットします。最初からある青い斜線は残ります。';
        restartDialog.returnValue = '';
        restartDialog.showModal();
    };
    restartDialog.onclose = async () => {
        if (restartDialog.returnValue !== 'restart') return;
        document.getElementById('play-menu-dialog').close();
        document.getElementById('clear-result-dialog').close();
        finishStroke();
        // Keep the same board object so a mosaic retains the fresh state for this tile.
        delete board.cells;
        delete board.marks;
        delete board.past;
        delete board.future;
        delete board.finished;
        delete board.paused;
        clock.reset();
        await startPuzzle({ matrix, palette, blank }, { ...options, board, clock, fitOnStart: true });
        queueProgressSave();
        document.getElementById('canvas').focus({ preventScroll: true });
    };
    if (!options.onReturn) {
        const { sample, shared, generated, shareSource } = options;
        // Retain short legacy links for resume without storing large source PNGs.
        const savedShareSource = shareSource?.length <= maxPuzzleShareLength ? shareSource : undefined;
        setProgressSource(() => ({
            kind: 'board',
            puzzle: { matrix, palette, blank },
            options: { sample, shared, generated, shareSource: savedShareSource },
            board,
            clock: clock.snapshot(),
        }), options.progressId, shared === true, options.daily?.key);
    }
    if (board.finished) {
        clock.finish();
        showClear();
    } else if (!board.paused) checkCompletion(hasSavedCells);
    if (options.tileLabel || options.fitOnStart) controls.fitInitially();
    if (options.tileLabel) returnToMosaic.focus();
    const startTime = () => {
        if (activeBoard === controls && !playPanel.hidden && !board.paused && !board.finished) clock.start();
    };
    if (!openFirstGuide?.(startTime)) startTime();
}
