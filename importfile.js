// Nonogramの生成ファイル

// 選択色
let g_selectcolor = 0;

// 表示中の盤面だけ、画面の解像度が変わったときに描き直す。
let refreshBoard;
let refreshBoardSettings;
let boardForSettings;
const boardSettingDefaults = { stickClues: true, showSymbols: false, autoSlash: false, pickClueColor: false, tracePaint: true };
const boardSettings = {};
const boardSettingsKey = 'nonogram.settings';
let finishStroke;
let playClock;
let updatePaletteNavigation;

// 5×5の十字を描いたパレット形式のサンプルPNG。
const samplePNG = 'iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAMAAAC6sdbXAAAABlBMVEX///8wW6NnOUAjAAAAFUlEQVR4nGNgYGBkAAEQyQgCDEgiAAClAAqu0sLdAAAAAElFTkSuQmCC';

window.onload = async function () {
    setupImagePicker();
    setupProgressRestore();
    setupDailyPuzzle();
    setupBoardMenus();
    // Safari のネイティブなピンチも、プレイ面で始まった場合だけ抑える。
    for (const type of ['gesturestart', 'gesturechange']) {
        document.addEventListener(type, event => {
            if (!document.querySelector('dialog[open]') &&
                !document.getElementById('play-panel').hidden &&
                event.target.closest?.('header, .play-workspace, #pause-message')) event.preventDefault();
        }, { passive: false });
    }
    setupSettings();
    document.getElementById('open-play-menu').onclick = () => {
        showBoardMenu();
        document.getElementById('play-menu-dialog').showModal();
    };
    const showFirstSharedGuide = setupPlayGuide();
    updatePaletteNavigation = setupPaletteNavigation();
    window.addEventListener('resize', () => refreshBoard?.());
    const viewport = document.getElementById('pixelcanvas');
    new ResizeObserver(() => {
        if (!viewport.hidden) refreshBoard?.();
    }).observe(viewport);
    window.setInterval(() => {
        if (!document.getElementById('play-panel').hidden) updatePlayTime();
    }, 250);

    const isPuzzleShareHash = hash => hash.startsWith(normalSharePrefix) || hash.startsWith(mosaicSharePrefix);
    // A pasted fragment can navigate within the current page without reloading it.
    window.addEventListener('hashchange', event => {
        if ([event.oldURL, event.newURL].some(url => isPuzzleShareHash(new URL(url).hash))) {
            window.location.reload();
        }
    });

    const { search: query, hash } = window.location;
    if (isPuzzleShareHash(hash)) {
        try {
            const mosaic = hash.startsWith(mosaicSharePrefix);
            if (mosaic) openMosaic(await readMosaicShare(hash), { fromShare: true });
            else await startPuzzle(await readPuzzleShare(hash), { shared: true, generated: true });
            showFirstSharedGuide(mosaic);
        } catch {
            showInvalidSharedPuzzle();
        }
        return;
    }
    if (!query) return;

    try {
        if (query === '?sample') {
            await startPuzzle(decodeLegacyPng(samplePNG), { sample: true, shareSource: samplePNG });
        } else {
            const shareSource = decodeURIComponent(query.slice(1));
            await startPuzzle(decodeLegacyPng(shareSource), { shared: true, shareSource });
            showFirstSharedGuide(false);
        }
    } catch {
        showInvalidSharedPuzzle();
    }
};

function showInvalidSharedPuzzle() {
    document.getElementById('shared-link-status').textContent =
        '共有リンクを開けませんでした。リンクが途中で切れていないか確認してください。';
}

function showBoardMenu(selected) {
    for (const button of document.querySelectorAll('.board-menu-button')) {
        const open = button === selected;
        button.setAttribute('aria-expanded', String(open));
        document.getElementById(button.getAttribute('aria-controls')).hidden = !open;
    }
}

function setupBoardMenus() {
    const tools = document.getElementById('board-side-controls');
    for (const button of tools.querySelectorAll('.board-menu-button')) {
        button.onclick = () => {
            const open = button.getAttribute('aria-expanded') === 'false';
            showBoardMenu(open ? button : undefined);
        };
    }

    function closeActiveMenu() {
        const trigger = tools.querySelector('.board-menu-button[aria-expanded="true"]');
        if (!trigger) return false;
        showBoardMenu();
        trigger.focus({ preventScroll: true });
        return true;
    }

    tools.addEventListener('click', event => {
        if (event.target.closest('button[data-close-board-menu]')) closeActiveMenu();
    }, { capture: true });
    document.addEventListener('click', event => {
        if (!event.target.closest('.board-menu, .board-menu-button') &&
            tools.querySelector('.board-menu-button[aria-expanded="true"]')) showBoardMenu();
    });
    tools.addEventListener('keydown', event => {
        if (event.key === 'Escape' && closeActiveMenu()) event.preventDefault();
    });
}

function boardSetting(name, board) {
    return boardSettings[name] ?? board?.[name] ?? boardSettingDefaults[name];
}

function saveBoardSetting(name, value) {
    boardSettings[name] = value;
    try {
        localStorage.setItem(boardSettingsKey, JSON.stringify(boardSettings));
    } catch {
        // Keep the setting in memory for this page.
    }
}

function setupPlayGuide() {
    const playGuide = document.getElementById('play-guide-dialog');
    const resetGuideTabs = setupGuideTabs(playGuide);
    const sample = document.getElementById('play-guide-sample');
    const sharedIntro = document.getElementById('play-guide-shared-intro');
    const playPanel = document.getElementById('play-panel');

    function openGuide(returnTarget) {
        sample.hidden = Boolean(returnTarget);
        sharedIntro.hidden = !returnTarget;
        const visible = boardSetting('showSymbols', playPanel.hidden ? undefined : boardForSettings);
        for (const symbol of playGuide.querySelectorAll('[data-guide-symbol]')) {
            symbol.hidden = !visible;
        }
        resetGuideTabs();
        playGuide.showModal();
        if (returnTarget) {
            playGuide.addEventListener('close', () => returnTarget.focus({ preventScroll: true }), { once: true });
        }
    }

    for (const button of document.querySelectorAll('[data-open-play-guide]')) {
        button.onclick = () => openGuide();
    }

    return split => {
        if (document.querySelector('dialog[open]')) return;
        const key = 'nonogram:shared-play-guide:v1';
        // Use tab storage when browser-wide storage is blocked. If neither is
        // available, leave the guide available through the play menu.
        for (const storageName of ['localStorage', 'sessionStorage']) {
            try {
                const storage = window[storageName];
                if (storage.getItem(key)) return;
                storage.setItem(key, '1');
            } catch {
                continue;
            }
            sharedIntro.textContent = split
                ? '閉じると、受け取った分割問題の全体図に進みます。'
                : '閉じると、受け取った問題で遊べます。';
            openGuide(document.getElementById(split ? 'mosaic-title' : 'canvas'));
            return;
        }
    };
}

function setupSettings() {
    const dialog = document.getElementById('settings-dialog');
    const playPanel = document.getElementById('play-panel');
    const clueAction = document.getElementById('clue-action');
    const settingsInputs = {
        stickClues: document.getElementById('stick-clues'),
        showSymbols: document.getElementById('color-symbols'),
        autoSlash: document.getElementById('auto-slash'),
        tracePaint: document.getElementById('trace-paint'),
    };
    try {
        const saved = JSON.parse(localStorage.getItem(boardSettingsKey));
        for (const name of Object.keys(boardSettingDefaults)) {
            if (typeof saved?.[name] === 'boolean') boardSettings[name] = saved[name];
        }
    } catch {
        // Play with defaults when browser storage is unavailable.
    }
    for (const [name, input] of Object.entries(settingsInputs)) {
        input.onchange = () => {
            saveBoardSetting(name, input.checked);
            if (!playPanel.hidden) refreshBoardSettings?.();
        };
    }
    clueAction.onchange = () => saveBoardSetting('pickClueColor', clueAction.value === 'color');
    for (const button of document.querySelectorAll('[data-open-settings]')) {
        button.onclick = () => {
            showBoardMenu();
            for (const [name, input] of Object.entries(settingsInputs)) {
                input.checked = boardSetting(name, playPanel.hidden ? undefined : boardForSettings);
            }
            clueAction.value = boardSetting('pickClueColor', playPanel.hidden ? undefined : boardForSettings) ? 'color' : 'mark';
            dialog.showModal();
        };
    }
}

function showClearResult(opener, { title = 'クリア！', note = '', download = false, restart = false, mosaic = false } = {}) {
    const dialog = document.getElementById('clear-result-dialog');
    if (dialog.open) return;
    document.getElementById('clear-result-title').textContent = title;
    const message = document.getElementById('clear-result-note');
    message.textContent = note.trim();
    message.hidden = !message.textContent;
    document.getElementById('downl').hidden = !download;
    document.getElementById('clear-mosaic-downloads').hidden = !mosaic;
    const restartButton = document.getElementById('clear-result-restart');
    restartButton.hidden = !restart;
    restartButton.onclick = restart ? () => document.getElementById('restart-board').click() : null;
    dialog.addEventListener('close', () => {
        if (!dialog.open && opener.getClientRects().length) opener.focus({ preventScroll: true });
    }, { once: true });
    dialog.showModal();
}

function setPlaying(playing) {
    if (playing) playClock?.resume();
    else {
        finishStroke?.();
        playClock?.suspend();
        flushProgress();
    }
    document.getElementById('start-panel').hidden = playing;
    document.getElementById('mosaic-panel').hidden = true;
    document.getElementById('play-panel').hidden = !playing;
    const menu = document.getElementById('open-play-menu');
    if (playing) document.querySelector('.mosaic-tile-navigation').before(menu);
    else document.getElementById('site-heading').append(menu);
    document.getElementById('pause-message').hidden = true;
    setPlayAreaVisible(playing);
    if (playing) updatePlayTime();
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

async function startPuzzle({ matrix, palette, blank }, options = {}) {
    finishStroke?.();
    playClock?.suspend();
    const board = options.board ?? {};
    const hasSavedCells = Boolean(board.cells);
    const rowClues = makeNumber(matrix, blank);
    const columnClues = makeNumber(transpose(matrix), blank);
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
    playClock = clock;
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
    g_selectcolor = paintColors[0] ?? blank;

    const widthInCells = matrix[0].length + rowClues[1];
    const heightInCells = matrix.length + columnClues[1];
    const initialCellSize = options.generated
        ? Math.max(10, Math.min(40, Math.floor(500 / Math.max(widthInCells, heightInCells))))
        : options.sample ? 40 : Math.max(Math.round(500 / heightInCells), 10);

    showBoardMenu();
    for (const id of ['line-hint', 'logic-hint']) {
        document.getElementById(id).hidden = options.shared === true;
    }
    setPlaying(true);
    let controls;
    try {
        const selectColor = drawUnderPalette(palette, usedColors, blank);
        controls = setupBoard(matrix, palette, blank, rowClues, columnClues, initialCellSize, clock, board,
            paintColors.length > 1, onEdit, fixedSlashes, selectColor);
    } catch (error) {
        setPlaying(false);
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
    if (board.finished) showClear();
    else if (!board.paused) checkCompletion(hasSavedCells);
    if (options.tileLabel || options.fitOnStart) controls.fitInitially();
    if (options.tileLabel) returnToMosaic.focus();
}

function boardResolution(width, height, pixelRatio) {
    // 大きな盤面を拡大しても、描画用のメモリを使いすぎないようにする。
    const scale = Math.min(pixelRatio, 4096 / width, 4096 / height, Math.sqrt(8_388_608 / (width * height)));
    return {
        width: Math.max(1, Math.floor(width * scale)),
        height: Math.max(1, Math.floor(height * scale)),
    };
}

function setupBoard(answer, palette, blank, rowClues, columnClues, initialCellSize, clock, board, multiColor, onEdit, fixedSlashes, selectColor) {
    const { cells } = board;
    const viewport = document.getElementById('pixelcanvas');
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('2d');
    const keyboardMarker = document.getElementById('keyboard-cell-marker');
    const clueOverlay = document.getElementById('fixed-clues');
    const clueContext = clueOverlay.getContext('2d');
    const sheetColors = getComputedStyle(canvas);
    const cluePaper = sheetColors.getPropertyValue('--puzzle-paper').trim();
    const clueInk = sheetColors.getPropertyValue('--puzzle-ink').trim();
    const majorRule = sheetColors.getPropertyValue('--puzzle-major-rule').trim();
    const minorRule = sheetColors.getPropertyValue('--puzzle-rule').trim();
    const undo = document.getElementById('board-undo');
    const redo = document.getElementById('board-redo');
    const history = createBoardHistory(board);
    let keyboardCell;
    keyboardMarker.hidden = true;
    let showSymbols = multiColor && boardSetting('showSymbols', board);
    const palettePanel = document.getElementById('color-palette');
    palettePanel.classList.toggle('show-symbols', showSymbols);
    const zoomIn = document.getElementById('zoom-in');
    const zoomOut = document.getElementById('zoom-out');
    const pickPaintedColor = document.getElementById('pick-painted-color');
    const instructions = document.getElementById('paint-instructions');
    const pauseButton = document.getElementById('pause-play');
    const pauseLabel = document.getElementById('pause-play-label');
    const pauseMessage = document.getElementById('pause-message');
    const hint = document.getElementById('line-hint');
    const logicHint = document.getElementById('logic-hint');
    const hintMessage = document.getElementById('hint-message');
    const checkConflicts = document.getElementById('check-conflicts');
    const conflictMessage = document.getElementById('conflict-message');
    const hintMarker = document.getElementById('hint-line-marker');
    const columns = answer[0].length;
    const rows = answer.length;
    const [rowsOfClues, leftClueCount] = rowClues;
    const [columnsOfClues, topClueCount] = columnClues;
    const widthInCells = columns + leftClueCount;
    const heightInCells = rows + topClueCount;
    const standardCellSize = 44;
    const maxCellSize = 64;
    const fit = () => Math.max(1, Math.min(maxCellSize, Math.floor(Math.min(
        viewport.clientWidth / widthInCells, viewport.clientHeight / heightInCells
    ))));
    let cellSize;
    let inputMode;
    let stroke;
    let pressedClue;
    let pausedPosition;
    let initialFitPending = false;
    let highlightedHint;
    let logicalHintShown = false;
    let conflicts;

    function updateHistoryButtons() {
        undo.disabled = board.finished || !history.canUndo();
        redo.disabled = board.finished || !history.canRedo();
    }

    function clearConflicts() {
        const redraw = conflicts?.rows.size || conflicts?.columns.size;
        conflicts = undefined;
        conflictMessage.textContent = '';
        return redraw;
    }

    function record(changes, assist = false) {
        if (assist && boardSetting('autoSlash', board)) {
            const remaining = findCompletedLineBlanks(cells, rowsOfClues, columnsOfClues, blank, changes);
            for (const cell of remaining) applyColor(cell, -1, changes);
        }
        history.record(changes);
        const cellsChanged = changes.some(change => 'row' in change);
        if (cellsChanged) {
            const hadConflicts = conflicts && clearConflicts();
            const hadLogicalMarker = logicalHintShown && highlightedHint?.cell;
            if (logicalHintShown) {
                highlightedHint = undefined;
                logicalHintShown = false;
                hintMessage.textContent = '';
                positionHintMarker();
            }
            if (hadConflicts || hadLogicalMarker) renderBoard(true);
        }
        updateHistoryButtons();
        queueProgressSave();
        return cellsChanged;
    }

    function moveHistory(action) {
        stopStroke();
        if (board.finished || !history[action]()) return;
        highlightedHint = undefined;
        logicalHintShown = false;
        hintMessage.textContent = '';
        clearConflicts();
        positionHintMarker();
        renderBoard(true);
        updateHistoryButtons();
        queueProgressSave();
        onEdit();
    }

    function clueGutters() {
        return boardSetting('stickClues', board)
            ? fixedClueGutters(viewport.scrollLeft, viewport.scrollTop, viewport.clientWidth,
                viewport.clientHeight, leftClueCount * cellSize, topClueCount * cellSize)
            : { left: 0, top: 0 };
    }

    function renderFixedClues() {
        const { left, top } = clueGutters();
        const x = viewport.scrollLeft;
        const y = viewport.scrollTop;
        const boardWidth = widthInCells * cellSize;
        const boardHeight = heightInCells * cellSize;
        const width = Math.min(viewport.clientWidth, boardWidth - x);
        const height = Math.min(viewport.clientHeight, boardHeight - y);
        clueOverlay.hidden = (!left && !top) || width <= 0 || height <= 0;
        if (clueOverlay.hidden) return;

        // Copy the already rendered numbers, including color symbols and checkmarks.
        const scaleX = canvas.width / boardWidth;
        const scaleY = canvas.height / boardHeight;
        const pixelWidth = Math.max(1, Math.round(width * scaleX));
        const pixelHeight = Math.max(1, Math.round(height * scaleY));
        if (clueOverlay.width !== pixelWidth) clueOverlay.width = pixelWidth;
        if (clueOverlay.height !== pixelHeight) clueOverlay.height = pixelHeight;
        clueOverlay.style.width = width + 'px';
        clueOverlay.style.height = height + 'px';
        clueContext.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
        clueContext.clearRect(0, 0, width, height);

        if (top) {
            clueContext.drawImage(canvas, x * scaleX, 0, width * scaleX, top * scaleY, 0, 0, width, top);
        }
        if (left) {
            clueContext.drawImage(canvas, 0, y * scaleY, left * scaleX, height * scaleY, 0, 0, left, height);
        }
        if (left && top) {
            clueContext.fillStyle = cluePaper;
            clueContext.fillRect(0, 0, left, top);
        }
    }

    function positionKeyboardCell(scroll = false) {
        if (!keyboardCell) return;
        const x = (leftClueCount + keyboardCell.column) * cellSize;
        const y = (topClueCount + keyboardCell.row) * cellSize;
        Object.assign(keyboardMarker.style, {
            left: x + 'px', top: y + 'px', width: cellSize + 'px', height: cellSize + 'px',
        });
        keyboardMarker.hidden = false;
        if (scroll) scrollCellIntoView(keyboardCell.row, keyboardCell.column);
    }

    function scrollCellIntoView(row, column) {
        const x = (leftClueCount + column) * cellSize;
        const y = (topClueCount + row) * cellSize;
        const { left, top } = clueGutters();
        viewport.scrollLeft = Math.min(x - left, Math.max(viewport.scrollLeft, x + cellSize - viewport.clientWidth));
        viewport.scrollTop = Math.min(y - top, Math.max(viewport.scrollTop, y + cellSize - viewport.clientHeight));
    }

    function positionHintMarker() {
        hintMarker.hidden = !highlightedHint;
        if (!highlightedHint) return;
        const { axis, index, cell } = highlightedHint;
        const row = axis === 'row';
        hintMarker.classList.toggle('is-logical', Boolean(cell));
        hintMarker.style.left = ((leftClueCount + (cell?.column ?? (row ? 0 : index))) * cellSize) + 'px';
        hintMarker.style.top = ((topClueCount + (cell?.row ?? (row ? index : 0))) * cellSize) + 'px';
        hintMarker.style.width = ((!cell && row ? columns : 1) * cellSize) + 'px';
        hintMarker.style.height = ((!cell && !row ? rows : 1) * cellSize) + 'px';
        hintMarker.style.borderWidth = Math.max(1, Math.min(2, Math.floor(cellSize / 2))) + 'px';
    }

    function renderBoard(force = false) {
        const size = boardResolution(widthInCells * cellSize, heightInCells * cellSize,
            window.devicePixelRatio || 1);
        if (!force && canvas.width === size.width && canvas.height === size.height) {
            renderFixedClues();
            return;
        }
        if (canvas.width !== size.width || canvas.height !== size.height) {
            canvas.width = size.width;
            canvas.height = size.height;
        }

        context.fillStyle = cluePaper;
        context.fillRect(0, 0, canvas.width, canvas.height);
        const fontSize = Math.max(1, Math.floor(Math.min(
            canvas.width / widthInCells, canvas.height / heightInCells
        ) * 0.68));
        context.font = '600 ' + fontSize + 'px system-ui, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        cells.forEach((row, y) => row.forEach((color, x) => paintCell(y, x, color)));

        // ヒントを盤面側に揃え、どの行・列の数字か追いやすくする。
        rowsOfClues.forEach((clues, y) => clues.forEach((clue, x) =>
            paintClue(leftClueCount - clues.length + x, topClueCount + y, clue,
                boardClueKey('row', y, x), conflicts?.rows.has(y),
                highlightedHint?.cell && highlightedHint.axis === 'row' && highlightedHint.index === y)
        ));
        columnsOfClues.forEach((clues, x) => clues.forEach((clue, y) =>
            paintClue(leftClueCount + x, topClueCount - clues.length + y, clue,
                boardClueKey('column', x, y), conflicts?.columns.has(x),
                highlightedHint?.cell && highlightedHint.axis === 'column' && highlightedHint.index === x)
        ));
        renderFixedClues();
    }

    function rectangle(column, row) {
        // 端を描画面の整数座標に揃え、罫線のにじみを防ぐ。
        const left = Math.round(column * canvas.width / widthInCells);
        const top = Math.round(row * canvas.height / heightInCells);
        return {
            left,
            top,
            width: Math.round((column + 1) * canvas.width / widthInCells) - left,
            height: Math.round((row + 1) * canvas.height / heightInCells) - top,
        };
    }

    function paintClue(column, row, [color, count], key, hasConflict, explainsHint) {
        const { left, top, width, height } = rectangle(column, row);
        if (!width || !height) return;
        if (color >= 0) {
            context.fillStyle = 'rgb(' + palette[color].join(',') + ')';
            context.fillRect(left, top, width, height);
            context.fillStyle = chooseTextColor(...palette[color]);
        } else {
            context.fillStyle = clueInk;
        }
        if (cellSize >= 6 && width >= 4 && height >= 4) {
            const text = showSymbols && color >= 0 ? count + '·' + paletteSymbol(color, blank) : String(count);
            context.fillText(text, left + width / 2, top + height / 2, width * 0.9);
        }
        if (board.marks[key]) {
            // Keep the number legible by striking through its lower half.
            const thickness = Math.max(1, Math.floor(height / 12));
            context.fillRect(left + width * 0.1, top + height * 0.60, width * 0.8, thickness);
        }
        if (hasConflict) {
            const border = Math.max(1, Math.floor(Math.min(width, height) / 10));
            context.fillStyle = '#a00020';
            context.fillRect(left, top, width, border);
            context.fillStyle = '#fff';
            if (height >= 8) context.fillRect(left, top + border, width, 1);
        }
        if (explainsHint) {
            const border = Math.max(1, Math.floor(Math.min(width, height) / 10));
            context.fillStyle = '#6c29a6';
            context.fillRect(left, top + height - border, width, border);
            context.fillStyle = '#fff';
            if (height >= 8) context.fillRect(left, top + height - border - 1, width, 1);
        }
    }

    function paintCell(row, column, color) {
        const { left, top, width, height } = rectangle(leftClueCount + column, topClueCount + row);
        if (!width || !height) return;
        const fixed = fixedSlashes.has(row * columns + column);
        context.fillStyle = fixed ? '#e4efff' : color === blank || color < 0
            ? '#fff' : 'rgb(' + palette[color].join(',') + ')';
        context.fillRect(left, top, width, height);

        const shorterSide = Math.min(width, height);
        const border = shorterSide >= 12 ? 2 : 1;
        if (shorterSide >= 3) {
            context.fillStyle = row % 5 === 0 ? majorRule : minorRule;
            context.fillRect(left, top, width, row % 5 === 0 ? border : 1);
            context.fillStyle = column % 5 === 0 ? majorRule : minorRule;
            context.fillRect(left, top, column % 5 === 0 ? border : 1, height);
            context.fillStyle = majorRule;
            if (row === rows - 1) context.fillRect(left, top + height - border, width, border);
            if (column === columns - 1) context.fillRect(left + width - border, top, border, height);
        }
        if (showSymbols && color >= 0 && color !== blank && cellSize >= 6 && width >= 4 && height >= 4) {
            context.fillStyle = chooseTextColor(...palette[color]);
            context.fillText(paletteSymbol(color, blank), left + width / 2, top + height / 2, width * 0.85);
        }
        if (color < 0 && Math.min(width, height) >= 4) {
            context.strokeStyle = fixed ? '#225494' : '#222';
            context.lineWidth = fixed ? border + 1 : border;
            context.beginPath();
            context.moveTo(left + width - border, top + border);
            context.lineTo(left + border, top + height - border);
            context.stroke();
        }
    }

    function resizeBoard(nextSize, center, anchor) {
        stopStroke();
        const previousSize = cellSize;
        const oldX = viewport.scrollLeft + (anchor?.from.x ?? Math.min(viewport.clientWidth, canvas.clientWidth) / 2);
        const oldY = viewport.scrollTop + (anchor?.from.y ?? Math.min(viewport.clientHeight, canvas.clientHeight) / 2);
        cellSize = nextSize;
        canvas.style.width = (widthInCells * cellSize) + 'px';
        canvas.style.height = (heightInCells * cellSize) + 'px';
        renderBoard(true);
        positionHintMarker();
        positionKeyboardCell();
        if (center && previousSize) {
            const ratio = cellSize / previousSize;
            viewport.scrollLeft = oldX * ratio - (anchor?.to.x ?? Math.min(viewport.clientWidth, canvas.clientWidth) / 2);
            viewport.scrollTop = oldY * ratio - (anchor?.to.y ?? Math.min(viewport.clientHeight, canvas.clientHeight) / 2);
        } else {
            viewport.scrollLeft = 0;
            viewport.scrollTop = 0;
        }
        renderFixedClues();
        zoomIn.disabled = cellSize >= maxCellSize;
        zoomOut.disabled = cellSize <= 1;
    }

    function fitBoard() {
        resizeBoard(fit(), false);
        // Scrollbars can disappear after shrinking the board and free more space.
        const adjustedSize = fit();
        if (adjustedSize !== cellSize) resizeBoard(adjustedSize, false);
    }

    const onSmallScreen = window.matchMedia('(max-width: 600px), (pointer: coarse)').matches;
    resizeBoard(onSmallScreen ? Math.max(28, Math.min(standardCellSize, fit())) : Math.min(initialCellSize, maxCellSize), false);
    zoomIn.onclick = () => resizeBoard(Math.min(maxCellSize, Math.ceil(cellSize * 1.25)), true);
    zoomOut.onclick = () => resizeBoard(Math.max(1, Math.floor(cellSize / 1.25)), true);
    document.getElementById('zoom-fit').onclick = fitBoard;
    document.getElementById('zoom-standard').onclick = () => {
        if (cellSize !== standardCellSize) resizeBoard(standardCellSize, true);
    };
    const solve = document.getElementById('solve');
    const rowPenalty = columns * secondsPerPuzzleCell;
    const columnPenalty = rows * secondsPerPuzzleCell;
    const answerPenalty = rows * rowPenalty;
    logicHint.querySelector('.penalty').textContent = '+' + formatPenaltyTime(logicHintPenalty);
    checkConflicts.querySelector('.penalty').textContent = '+' + formatPenaltyTime(conflictCheckPenalty);
    const linePenalties = rowPenalty === columnPenalty
        ? [formatPenaltyTime(rowPenalty)]
        : [formatPenaltyTime(Math.min(rowPenalty, columnPenalty)) + '〜',
            formatPenaltyTime(Math.max(rowPenalty, columnPenalty))];
    setPenaltyLabel(hint, linePenalties);
    setPenaltyLabel(solve, penaltyTimeParts(answerPenalty));

    function setPenaltyLabel(button, parts) {
        const label = button.querySelector('.penalty');
        label.replaceChildren();
        for (const [index, part] of parts.entries()) {
            const unit = document.createElement('span');
            unit.textContent = index === 0 ? '+' + part : part;
            if (index > 0) label.append(document.createElement('wbr'));
            label.append(unit);
        }
    }

    function addHintPenalty(seconds) {
        clock.addPenalty(seconds);
        updatePlayTime();
        queueProgressSave();
        return '（' + formatPenaltyTime(seconds) + '加算）';
    }

    hintMessage.textContent = '';
    conflictMessage.textContent = '';
    checkConflicts.disabled = false;
    checkConflicts.onclick = () => {
        if (board.finished || board.paused) return;
        stopStroke();
        if (conflicts) return;
        conflicts = findBoardConflicts(cells, rowsOfClues, columnsOfClues, blank);
        const rowCount = conflicts.rows.size;
        const columnCount = conflicts.columns.size;
        if (rowCount || columnCount) {
            const first = [];
            if (rowCount) first.push('上から' + (conflicts.rows.values().next().value + 1) + '行目');
            if (columnCount) first.push('左から' + (conflicts.columns.values().next().value + 1) + '列目');
            conflictMessage.textContent = '矛盾があります（' + rowCount + '行・' + columnCount + '列）。' +
                '最初の印は' + first.join('と') + 'です。';
        } else {
            conflictMessage.textContent = '今のところ、ヒント数字と矛盾する行・列はありません。';
        }
        conflictMessage.textContent += addHintPenalty(conflictCheckPenalty);
        renderBoard(true);
    };
    logicHint.disabled = false;
    logicHint.onclick = () => {
        if (board.finished || board.paused) return;
        stopStroke();
        if (logicalHintShown) return;
        highlightedHint = undefined;
        logicalHintShown = true;
        const current = findBoardConflicts(cells, rowsOfClues, columnsOfClues, blank);
        if (current.rows.size || current.columns.size) {
            hintMessage.textContent = '今の入力とヒント数字に矛盾があります。「矛盾チェック」で場所を確認できます。';
        } else {
            const deduction = findLogicalHint(cells, rowsOfClues, columnsOfClues, blank);
            if (deduction) {
                showLogicalHint(deduction);
                hintMessage.append(addHintPenalty(logicHintPenalty));
            } else {
                hintMessage.textContent = '今の状態から、行・列を個別に見て確定できるマスは見つかりませんでした。';
            }
        }
        positionHintMarker();
        renderBoard(true);
        if (highlightedHint?.cell) scrollCellIntoView(highlightedHint.cell.row, highlightedHint.cell.column);
    };

    function showLogicalHint({ axis, index, row, column, color }) {
        highlightedHint = { axis, index, cell: { row, column } };
        const isRow = axis === 'row';
        const line = (isRow ? rowsOfClues : columnsOfClues)[index];
        const numbers = line.map(([, count]) => count).join('、');
        const lineLabel = (isRow ? '上から' : '左から') + (index + 1) + (isRow ? '行目' : '列目');
        const position = '上から' + (row + 1) + '行・左から' + (column + 1) + '列のマス';
        const lineLength = isRow ? columns : rows;
        const count = line[0][1];
        let reason = lineLabel + 'の「' + numbers + '」と今の入力を満たす置き方では、';
        if (line.length === 1 && count === 0) {
            reason = lineLabel + 'の「0」はすべて空白なので、';
        } else if (line.length === 1 && count === lineLength) {
            reason = lineLabel + 'の「' + count + '」は端から端まで同じ色で埋まるので、';
        }
        const prefix = reason + position + 'は必ず';
        if (color === blank) {
            hintMessage.textContent = prefix + '空白です。斜線を付けられます。';
        } else {
            const swatch = document.createElement('span');
            swatch.className = 'hint-color';
            swatch.textContent = '色 ' + paletteSymbol(color, blank);
            swatch.style.backgroundColor = 'rgb(' + palette[color].join(',') + ')';
            swatch.style.color = chooseTextColor(...palette[color]);
            hintMessage.replaceChildren(prefix, swatch, 'で塗れます。');
        }
    }

    hint.disabled = false;
    hint.onclick = () => {
        if (board.finished || board.paused) return;
        stopStroke();
        const result = pickLineHint(answer, cells, blank);
        if (!result) {
            onEdit();
            return;
        }
        const { axis, index, changes } = result;
        const note = addHintPenalty(axis === 'row' ? rowPenalty : columnPenalty);
        const action = [];
        for (const { row, column, color } of changes) applyColor({ row, column }, color, action);
        record(action, true);
        highlightedHint = { axis, index };
        const lineLabel = axis === 'row' ? '上から' + (index + 1) + '行目' : '左から' + (index + 1) + '列目';
        hintMessage.textContent = lineLabel + 'をヒントで埋めました。' + note;
        positionHintMarker();
        const gutters = clueGutters();
        if (axis === 'row') {
            const top = (topClueCount + index) * cellSize;
            if (top < viewport.scrollTop + gutters.top || top + cellSize > viewport.scrollTop + viewport.clientHeight) {
                viewport.scrollTop = top - Math.max(0, (viewport.clientHeight - cellSize) / 2);
            }
        } else {
            const left = (leftClueCount + index) * cellSize;
            if (left < viewport.scrollLeft + gutters.left || left + cellSize > viewport.scrollLeft + viewport.clientWidth) {
                viewport.scrollLeft = left - Math.max(0, (viewport.clientWidth - cellSize) / 2);
            }
        }
        onEdit(note);
    };
    solve.disabled = false;
    solve.onclick = () => {
        if (board.finished || board.paused) return;
        stopStroke();
        const note = addHintPenalty(answerPenalty);
        const action = [];
        answer.forEach((line, row) => line.forEach((color, column) => applyColor({ row, column }, color, action)));
        record(action);
        highlightedHint = undefined;
        hintMessage.textContent = '';
        positionHintMarker();
        renderBoard(true);
        onEdit(note);
    };
    pauseButton.disabled = false;
    setPauseControl(false);

    function setPauseControl(paused) {
        pauseButton.toggleAttribute('data-paused', paused);
        pauseLabel.textContent = paused ? '再開' : '一時停止';
    }

    function togglePause() {
        if (pausedPosition) {
            setPlayAreaVisible(true);
            viewport.scrollLeft = pausedPosition.left;
            viewport.scrollTop = pausedPosition.top;
            pausedPosition = undefined;
            if (initialFitPending) {
                initialFitPending = false;
                fitBoard();
            }
            clock.resume();
        } else {
            stopStroke();
            pausedPosition = { left: viewport.scrollLeft, top: viewport.scrollTop };
            clock.suspend();
            showBoardMenu();
            setPlayAreaVisible(false);
        }
        board.paused = Boolean(pausedPosition);
        pauseMessage.hidden = !board.paused;
        setPauseControl(board.paused);
        updatePlayTime();
    }
    pauseButton.onclick = () => {
        togglePause();
        queueProgressSave();
        if (!board.paused) onEdit();
    };
    if (board.paused && !board.finished) togglePause();

    function setInputMode(mode) {
        stopStroke();
        touchPan.reset();
        inputMode = mode;
        pickPaintedColor.setAttribute('aria-pressed', String(mode === 'pick'));
        canvas.classList.toggle('is-painting', mode === 'trace');

        const messages = {
            paint: 'マスを押して塗り、1本指または2本指で盤面を動かせます。',
            trace: '1本指でなぞると塗れます。2本指で盤面を動かせます。マウスでもなぞって塗れます。',
            pick: 'マスの色・空白・斜線や、ヒントの数字の色を拾えます。キーボードでマスから拾うには Space または Enter を押します。',
        };
        instructions.textContent = messages[mode];
        // 読み上げ用の説明だけを更新し、入力モードで盤面の表示領域を変えない。
    }

    const configuredPaintMode = () => boardSetting('tracePaint', board) ? 'trace' : 'paint';

    function pickColor(color) {
        if (selectColor(color)) setInputMode(configuredPaintMode());
    }

    function pointFor(event, painting = false) {
        const viewRect = viewport.getBoundingClientRect();
        const { left, top } = fixedClueHit(event.clientX - viewRect.left,
            event.clientY - viewRect.top, clueGutters());
        if (painting && (left || top)) return null;
        return boardPointAt(event.clientX - (left ? viewport.scrollLeft : 0),
            event.clientY - (top ? viewport.scrollTop : 0), canvas.getBoundingClientRect(),
            widthInCells, heightInCells, [leftClueCount, topClueCount]);
    }

    function applyColor({ row, column }, color, action) {
        if (fixedSlashes.has(row * columns + column)) return;
        clock.start();
        const before = cells[row][column];
        if (before === color) return;
        action.push({ row, column, before, after: color });
        cells[row][column] = color;
        paintCell(row, column, color);
    }

    function continueStroke(event) {
        if (!stroke || event.pointerId !== stroke.id) return;
        const point = pointFor(event, true);
        if (point && !stroke.point) {
            const cell = boardCellAt(point, columns, rows);
            if (cell) applyColor(cell, stroke.color, stroke.changes);
        } else if (point) {
            for (const cell of traceBoardCells(stroke.point, point, columns, rows)) {
                applyColor(cell, stroke.color, stroke.changes);
            }
        }
        stroke.point = point;
    }

    function stopStroke() {
        if (!stroke) return;
        const { id, changes } = stroke;
        stroke = undefined;
        if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
        return record(changes, true);
    }

    const touchPan = createTouchPan(viewport, () => {
        // 2本目の指を置くまでの未確定な塗りを戻し、移動を履歴に残さない。
        if (stroke) {
            const changes = stroke.changes;
            stroke = undefined;
            for (const change of changes.slice().reverse()) {
                cells[change.row][change.column] = change.before;
            }
            renderBoard(true);
            queueProgressSave();
        }
        pressedClue = undefined;
    }, {
        size: () => cellSize,
        schedule: callback => requestAnimationFrame(callback),
        apply(size, previous, next) {
            const nextSize = Math.max(1, Math.min(maxCellSize, Math.round(size)));
            if (nextSize === cellSize) {
                viewport.scrollLeft += previous.x - next.x;
                viewport.scrollTop += previous.y - next.y;
                return;
            }
            const rect = viewport.getBoundingClientRect();
            const relative = point => ({ x: point.x - rect.left, y: point.y - rect.top });
            resizeBoard(nextSize, true, { from: relative(previous), to: relative(next) });
        },
    });

    setInputMode(configuredPaintMode());
    pickPaintedColor.disabled = false;
    pickPaintedColor.onclick = () => setInputMode(inputMode === 'pick' ? configuredPaintMode() : 'pick');
    function editCell(cell, color) {
        if (board.finished) return;
        stopStroke();
        const action = [];
        applyColor(cell, color, action);
        if (record(action, true)) onEdit();
    }

    function toggleSlash(cell) {
        editCell(cell, cells[cell.row][cell.column] === -1 ? blank : -1);
    }

    undo.onclick = () => moveHistory('undo');
    redo.onclick = () => moveHistory('redo');
    updateHistoryButtons();
    canvas.onclick = event => {
        if (board.finished || !event.detail || touchPan.suppressesClick()) return;
        const point = pointFor(event);
        const clue = boardClueAt(point, rowsOfClues, columnsOfClues);
        if (clue && clue.key === pressedClue) {
            if (inputMode === 'pick') {
                if (clue.color >= 0) pickColor(clue.color);
                return;
            }
            if (boardSetting('pickClueColor', board)) {
                if (clue.color >= 0) selectColor(clue.color);
                return;
            }
            const { key } = clue;
            const before = Boolean(board.marks[key]);
            if (before) delete board.marks[key];
            else board.marks[key] = true;
            record([{ key, before, after: !before }]);
            renderBoard(true);
            return;
        }
        const cell = boardCellAt(point, columns, rows);
        if (!cell) return;
        keyboardCell = cell;
        positionKeyboardCell();
        if (inputMode === 'pick') pickColor(cells[cell.row][cell.column]);
        else if (inputMode === 'paint') editCell(cell, g_selectcolor);
    };
    canvas.oncontextmenu = event => {
        if (event.pointerType === 'touch') return;
        const cell = boardCellAt(pointFor(event), columns, rows);
        if (!cell || board.finished) return;
        event.preventDefault();
        if (inputMode !== 'pick') toggleSlash(cell);
    };
    canvas.onfocus = () => {
        keyboardCell ??= { row: 0, column: 0 };
        positionKeyboardCell();
    };
    canvas.onkeydown = event => {
        if (event.altKey) return;
        const key = event.key.toLowerCase();
        if (event.metaKey || event.ctrlKey) {
            if (key !== 'z' && key !== 'y') return;
            event.preventDefault();
            moveHistory(key === 'y' || event.shiftKey ? 'redo' : 'undo');
            return;
        }
        const offsets = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] };
        const offset = offsets[key];
        if (offset) {
            event.preventDefault();
            keyboardCell = {
                row: Math.max(0, Math.min(rows - 1, keyboardCell.row + offset[0])),
                column: Math.max(0, Math.min(columns - 1, keyboardCell.column + offset[1])),
            };
            positionKeyboardCell(true);
        } else if ([' ', 'enter', 'x', 'delete', 'backspace'].includes(key)) {
            event.preventDefault();
            if (inputMode === 'pick') {
                if (!event.repeat && (key === ' ' || key === 'enter')) pickColor(cells[keyboardCell.row][keyboardCell.column]);
            } else if (key === 'x') {
                if (!event.repeat) toggleSlash(keyboardCell);
            } else {
                editCell(keyboardCell, key === 'delete' || key === 'backspace' ? blank : g_selectcolor);
            }
            positionKeyboardCell(true);
        }
    };
    canvas.onpointerdown = event => {
        if (event.pointerType === 'touch') {
            canvas.setPointerCapture(event.pointerId);
            if (touchPan.down(event, inputMode !== 'trace' || board.finished)) return;
        } else touchPan.reset();
        if (board.finished || stroke || !event.isPrimary || event.button !== 0) return;
        const point = pointFor(event);
        pressedClue = boardClueAt(point, rowsOfClues, columnsOfClues)?.key;
        if (inputMode !== 'trace') return;
        const cell = boardCellAt(point, columns, rows);
        if (!cell) return;
        canvas.setPointerCapture(event.pointerId);
        stroke = { id: event.pointerId, point, color: g_selectcolor, changes: [] };
        applyColor(cell, stroke.color, stroke.changes);
    };
    canvas.onpointermove = event => {
        if (touchPan.move(event)) return;
        if (!stroke || event.pointerId !== stroke.id) return;
        for (const move of event.getCoalescedEvents?.() ?? []) continueStroke(move);
        continueStroke(event);
    };
    canvas.onpointerup = event => {
        if (touchPan.end(event)) return;
        if (!stroke || event.pointerId !== stroke.id) return;
        continueStroke(event);
        if (stopStroke()) onEdit();
    };
    canvas.onpointercancel = canvas.onlostpointercapture = event => {
        if (touchPan.end(event)) return;
        if (event.pointerId === stroke?.id && stopStroke()) onEdit();
    };
    viewport.onscroll = renderFixedClues;
    boardForSettings = board;
    refreshBoardSettings = () => {
        const mode = configuredPaintMode();
        if (inputMode !== 'pick' && inputMode !== mode) setInputMode(mode);
        showSymbols = multiColor && boardSetting('showSymbols', board);
        palettePanel.classList.toggle('show-symbols', showSymbols);
        renderBoard(true);
    };
    refreshBoard = () => renderBoard();
    finishStroke = stopStroke;
    return {
        fitInitially() {
            if (viewport.hidden) initialFitPending = true;
            else fitBoard();
        },
        finish() {
            board.finished = true;
            if (inputMode === 'pick') setInputMode(configuredPaintMode());
            pickPaintedColor.disabled = true;
            checkConflicts.disabled = true;
            if (clearConflicts()) renderBoard(true);
            pauseButton.disabled = true;
            hint.disabled = true;
            logicHint.disabled = true;
            solve.disabled = true;
            updateHistoryButtons();
        },
    };
}

function matchesIntendedImage(answer, board, blank) {
    return answer.every((line, row) => line.every((color, column) => {
        const painted = board[row][column];
        return painted === color || (color === blank && painted === -1);
    }));
}

function pickLineHint(answer, board, blank, random = Math.random) {
    const unfinishedRows = Array(answer.length).fill(false);
    const unfinishedColumns = Array(answer[0].length).fill(false);
    answer.forEach((colors, row) => colors.forEach((color, column) => {
        const current = board[row][column];
        // Unmarked blanks already count as correct when selecting a line.
        if (current === color || (current === -1 && color === blank)) return;
        unfinishedRows[row] = true;
        unfinishedColumns[column] = true;
    }));
    const candidates = [];
    for (const [axis, lines] of [['row', unfinishedRows], ['column', unfinishedColumns]]) {
        lines.forEach((unfinished, index) => {
            if (unfinished) candidates.push({ axis, index });
        });
    }
    if (!candidates.length) return null;

    const { axis, index } = candidates[Math.floor(random() * candidates.length)];
    const line = axis === 'row' ? answer[index] : answer.map(row => row[index]);
    const changes = [];
    line.forEach((value, offset) => {
        const row = axis === 'row' ? index : offset;
        const column = axis === 'row' ? offset : index;
        const color = value === blank ? -1 : value;
        if (board[row][column] !== color) changes.push({ row, column, color });
    });
    return { axis, index, changes };
}

function boardPointAt(x, y, rect, widthInCells, heightInCells, offset) {
    if (!rect.width || !rect.height) return null;
    return {
        x: (x - rect.left) * widthInCells / rect.width - offset[0],
        y: (y - rect.top) * heightInCells / rect.height - offset[1],
    };
}

function boardCellAt(point, columns, rows) {
    if (!point) return null;
    const column = Math.floor(point.x);
    const row = Math.floor(point.y);
    if (row < 0 || row >= rows || column < 0 || column >= columns) return null;
    return { row, column };
}

function traceBoardCells(from, to, columns, rows) {
    const cells = [];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    let column = Math.floor(from.x);
    let row = Math.floor(from.y);
    const endColumn = Math.floor(to.x);
    const endRow = Math.floor(to.y);
    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);

    // 次に横切る罫線を順にたどる。移動イベントの間に飛び越えたマスも塗る。
    while (true) {
        if (column >= 0 && column < columns && row >= 0 && row < rows) cells.push({ row, column });
        if (column === endColumn && row === endRow) return cells;
        const crossX = column === endColumn ? Infinity : (column + (stepX > 0 ? 1 : 0) - from.x) / dx;
        const crossY = row === endRow ? Infinity : (row + (stepY > 0 ? 1 : 0) - from.y) / dy;
        if (crossX < crossY || Math.abs(crossX - crossY) < 1e-9) column += stepX;
        if (crossY < crossX || Math.abs(crossX - crossY) < 1e-9) row += stepY;
    }
}

/**
 * Nonogram数字計算関数
 * @param  {Number[]} arr - 数字 データ
 * @return {Number[][]} 連続する数字のデータ
 */
function calcNumber(arr) {
    const calculated = [[arr[0], 1]];
    for (let i = 1; i < arr.length; i++) {
        const last = calculated[calculated.length - 1];
        if (last[0] === arr[i]) {
            last[1]++;
        } else {
            calculated.push([arr[i], 1]);
        }
    }
    return calculated;
}

/**
 * Nonogramマトリクスチェック関数
 * @param  {Number[][],Number} checkarr - チェック用の数字配列
 * @param  {Number[][]} targetmatrix - チェックする配列
 * @param  {Number} alpha - 透過色
 * @return {Boolean} - 合っているか間違っているか
 */
function checkNumber(checkarr, targetmatrix, alpha) {
    const [lines] = checkarr;
    return lines.length === targetmatrix.length && lines.every((expected, index) =>
        lineMatchesClues(targetmatrix[index], expected, alpha));
}

function lineMatchesClues(line, clues, blank) {
    return String(clues) === String(lineClues(line, blank));
}

function findCompletedLineBlanks(cells, rowsOfClues, columnsOfClues, blank, changes) {
    const rows = new Set();
    const columns = new Set();
    for (const { row, column, after } of changes) {
        if (after !== blank && after >= 0) {
            rows.add(row);
            columns.add(column);
        }
    }

    const remaining = new Map();
    const width = cells[0].length;
    for (const row of rows) {
        const line = cells[row];
        if (!line.includes(blank) || !lineMatchesClues(line, rowsOfClues[row], blank)) continue;
        line.forEach((color, column) => {
            if (color === blank) remaining.set(row * width + column, { row, column });
        });
    }
    for (const column of columns) {
        const line = cells.map(row => row[column]);
        if (!line.includes(blank) || !lineMatchesClues(line, columnsOfClues[column], blank)) continue;
        line.forEach((color, row) => {
            if (color === blank) remaining.set(row * width + column, { row, column });
        });
    }
    return remaining.values();
}

function lineClues(line, blank) {
    const clues = calcNumber(line).filter(([color]) => color !== blank && color !== -1);
    return clues.length ? clues : [[-1, 0]];
}

/**
 * Nonogram数字マトリクス生成関数
 * @param  {Number[][]} arr - pngマトリクス
 * @param  {Number} alpha - 透過色
 * @return {Number[][],Number}- 計算した数字集合、最大値
 */
function makeNumber(arr, alpha) {
    const numberrowarray = [];
    let maxnumber = 0;
    for (let i = 0; i < arr.length; i++) {
        const calcnum = lineClues(arr[i], alpha);
        numberrowarray.push(calcnum);
        maxnumber = Math.max(maxnumber, calcnum.length);
    }
    return [numberrowarray, maxnumber];
}

// パレットを通常のボタンで表示し、指でもキーボードでも色を選べるようにする。
function setupPaletteNavigation() {
    const strip = document.getElementById('palette-strip');
    const palette = document.getElementById('color-palette');
    const previous = document.getElementById('palette-prev');
    const next = document.getElementById('palette-next');
    const note = document.getElementById('palette-scroll-note');

    function update() {
        const vertical = getComputedStyle(palette).display === 'grid';
        const scrollable = !vertical && palette.scrollWidth > strip.clientWidth + 1;
        strip.toggleAttribute('data-scrollable', scrollable);
        previous.hidden = next.hidden = !scrollable;
        previous.setAttribute('aria-disabled', String(palette.scrollLeft <= 1));
        next.setAttribute('aria-disabled',
            String(palette.scrollLeft + palette.clientWidth >= palette.scrollWidth - 1));
        note.hidden = !vertical || palette.scrollHeight <= palette.clientHeight + 1;
    }

    for (const [button, direction] of [[previous, -1], [next, 1]]) {
        button.onclick = () => {
            if (button.getAttribute('aria-disabled') === 'true') return;
            const distance = Math.max(50, palette.clientWidth - 50);
            palette.scrollBy({ left: direction * distance });
        };
    }
    palette.addEventListener('scroll', update);
    const observer = new ResizeObserver(update);
    observer.observe(strip);
    observer.observe(palette);
    return update;
}

function drawUnderPalette(palette, usedColors, blank) {
    const container = document.getElementById('color-palette');
    container.replaceChildren();
    const buttons = new Map([
        [blank, document.getElementById('palette-blank')],
        [-1, document.getElementById('palette-slash')],
    ]);

    function selectColor(color) {
        const button = buttons.get(color);
        if (!button) return;
        buttons.get(g_selectcolor)?.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-pressed', 'true');
        g_selectcolor = color;
        if (container.contains(button)) {
            // Move only the palette to reveal a color selected with a clue or the eyedropper.
            const viewport = container.getBoundingClientRect();
            const tile = button.getBoundingClientRect();
            const left = tile.left < viewport.left ? tile.left - viewport.left - 4
                : tile.right > viewport.left + container.clientWidth
                    ? tile.right - viewport.left - container.clientWidth + 4 : 0;
            const top = tile.top < viewport.top ? tile.top - viewport.top - 4
                : tile.bottom > viewport.top + container.clientHeight
                    ? tile.bottom - viewport.top - container.clientHeight + 4 : 0;
            if (left || top) container.scrollBy({ left, top });
        }
        return button;
    }

    for (const color of usedColors) {
        if (color === blank) continue;
        const button = document.createElement('button');
        const swatch = document.createElement('span');
        const symbol = document.createElement('span');
        const hexColor = '#' + palette[color].map(channel => channel.toString(16).padStart(2, '0')).join('');
        const colorSymbol = paletteSymbol(color, blank);
        const label = '色 ' + colorSymbol + ' ' + hexColor;

        button.type = 'button';
        button.className = 'palette-color';
        button.title = label;
        button.setAttribute('aria-label', label);
        symbol.className = 'palette-symbol';
        symbol.textContent = colorSymbol;
        swatch.className = 'palette-swatch';
        swatch.style.backgroundColor = hexColor;
        swatch.style.color = chooseTextColor(...palette[color]);
        swatch.append(symbol);
        button.append(swatch);
        buttons.set(color, button);
        container.append(button);
    }

    for (const [color, button] of buttons) {
        button.setAttribute('aria-pressed', String(g_selectcolor === color));
        button.onclick = () => selectColor(color);
    }
    container.scrollLeft = 0;
    container.scrollTop = 0;
    updatePaletteNavigation();
    return selectColor;
}

/**
 * 背景色から文字色を決める関数
 * https://katashin.info/2018/12/18/247
 * @param  {Number} red 
 * @param  {Number} green
 * @param  {Number} blue
 * @return {String} 'white'か'blackを返す
 */
function chooseTextColor(red, green, blue) {
    // sRGB を RGB に変換し、背景色の相対輝度を求める
    const toRgbItem = item => {
        const i = item / 255
        return i <= 0.03928 ? i / 12.92 : Math.pow((i + 0.055) / 1.055, 2.4)
    }
    const R = toRgbItem(red)
    const G = toRgbItem(green)
    const B = toRgbItem(blue)
    const Lbg = 0.2126 * R + 0.7152 * G + 0.0722 * B

    // 白と黒の相対輝度。定義からそれぞれ 1 と 0 になる。
    const Lw = 1
    const Lb = 0

    // 白と背景色のコントラスト比、黒と背景色のコントラスト比を
    // それぞれ求める。
    const Cw = (Lw + 0.05) / (Lbg + 0.05)
    const Cb = (Lbg + 0.05) / (Lb + 0.05)

    // コントラスト比が大きい方を文字色として返す。
    return Cw < Cb ? 'black' : 'white'
}

/**
 * 行列転置関数
 * https://qiita.com/kznr_luk/items/790f1b154d1b6d4de398
 * @param  {Number[][]} arr - 入力マトリクス
 * @return {Number[][]} - 転置したマトリクス
 */
function transpose(arr) {
    return arr[0].map((_, c) => arr.map(r => r[c]))
}

/**
 * ASCII文字hex変換関数
 * @param  {String} s - ASCII文字
 * @return {String} - hex
 */
function hex(s) {
    const result = "";
    for (let i = 0; i < s.length; ++i) {
        const h = ("0" + s.charCodeAt(i).toString(16)).slice(-2);
        result += h;
    }
    return result;
}

/**
 * タッチを追跡し、2本以上なら重心の移動量でスクロールする。
 * singleFingerPan のときは1本指のドラッグも移動に使い、短いタップとは区別する。
 * 移動後は全ての指が離れるまで塗りを抑止する。cancelStroke は未確定の塗りを戻す。
 */
function createTouchPan(viewport, cancelStroke, zoom) {
    const pointers = new Map();
    let panning = false;
    let singleFingerPan = false;
    let startPoint;
    let pinch;
    function center() {
        const points = [...pointers.values()];
        return {
            x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
            y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
        };
    }
    function distance() {
        const [a, b] = pointers.values();
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function startPinch() {
        pinch = zoom && pointers.size === 2 ? {
            center: center(),
            distance: Math.max(12, distance()),
            size: zoom.size(),
            scaling: false,
            pending: false,
        } : undefined;
    }

    function updatePinch(gesture) {
        if (!gesture?.pending) return;
        gesture.pending = false;
        const next = center();
        const span = Math.max(12, distance());
        // 位置だけを動かすとき、指の間隔の小さなぶれは倍率に反映しない。
        gesture.scaling ||= Math.abs(span - gesture.distance) >= Math.max(6, gesture.distance * 0.08);
        const size = gesture.scaling ? gesture.size * span / gesture.distance : gesture.size;
        zoom.apply(size, gesture.center, next);
        gesture.center = next;
    }

    return {
        down(event, allowSingleFingerPan = false) {
            updatePinch(pinch);
            if (!pointers.size) {
                panning = false;
                singleFingerPan = allowSingleFingerPan;
                startPoint = { x: event.clientX, y: event.clientY };
            }
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointers.size > 1) {
                singleFingerPan = false;
                if (!panning) {
                    panning = true;
                    cancelStroke();
                }
            }
            startPinch();
            return panning;
        },
        move(event) {
            if (!pointers.has(event.pointerId)) return false;
            let previous = center();
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pinch) {
                const gesture = pinch;
                if (!gesture.pending) {
                    gesture.pending = true;
                    zoom.schedule(() => {
                        if (pinch === gesture) updatePinch(gesture);
                    });
                }
                return true;
            }
            const next = center();
            if (!panning && singleFingerPan &&
                Math.hypot(next.x - startPoint.x, next.y - startPoint.y) >= 6) {
                panning = true;
                previous = startPoint;
                cancelStroke();
            }
            if (panning && (pointers.size > 1 || singleFingerPan)) {
                viewport.scrollLeft += previous.x - next.x;
                viewport.scrollTop += previous.y - next.y;
            }
            return panning;
        },
        end(event) {
            if (!pointers.has(event.pointerId)) return false;
            updatePinch(pinch);
            pointers.delete(event.pointerId);
            startPinch();
            return panning;
        },
        suppressesClick() { return panning; },
        reset() {
            pointers.clear();
            pinch = undefined;
            panning = false;
        },
    };
}
