// 盤面への入力、ヒント、取り消し、一時停止を扱う。

function setupBoard({
    answer, palette, blank, rowClues, columnClues, initialCellSize, clock, board,
    multiColor, onEdit, fixedSlashes, paletteControls,
}) {
    const { selectColor, getSelectedColor } = paletteControls;
    const { cells } = board;
    const viewport = document.getElementById('pixelcanvas');
    const canvas = document.getElementById('canvas');
    const keyboardMarker = document.getElementById('keyboard-cell-marker');
    const renderer = createBoardRenderer({
        canvas, viewport, clueOverlay: document.getElementById('fixed-clues'),
        board, rowClues, columnClues, palette, blank, fixedSlashes,
    });
    const undo = document.getElementById('board-undo');
    const redo = document.getElementById('board-redo');
    const history = createBoardHistory(board);
    let keyboardCell;
    keyboardMarker.hidden = true;
    let showSymbols = multiColor && boardSetting('showSymbols', board);
    const palettePanel = document.getElementById('color-palette');
    palettePanel.classList.toggle('show-symbols', showSymbols);
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
    const boardView = createBoardViewport({
        viewport, canvas, columns, rows, leftClueCount, topClueCount,
        shouldStickClues: () => boardSetting('stickClues', board),
        beforeResize: stopStroke,
        redraw() {
            renderBoard(true);
            positionHintMarker();
            positionKeyboardCell();
        },
        afterResize: renderFixedClues,
    });
    const minimap = createBoardMinimap({ cells, palette, blank, viewport, leftClueCount, topClueCount, boardView });
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
        minimap.repaint();
        updateHistoryButtons();
        queueProgressSave();
        onEdit();
    }

    function renderFixedClues() {
        renderer.renderFixedClues(boardView.cellSize, boardView.clueGutters());
        minimap.updateViewport();
    }

    function positionKeyboardCell(scroll = false) {
        if (!keyboardCell) return;
        const x = (leftClueCount + keyboardCell.column) * boardView.cellSize;
        const y = (topClueCount + keyboardCell.row) * boardView.cellSize;
        Object.assign(keyboardMarker.style, {
            left: x + 'px', top: y + 'px', width: boardView.cellSize + 'px', height: boardView.cellSize + 'px',
        });
        keyboardMarker.hidden = false;
        if (scroll) boardView.scrollCellIntoView(keyboardCell.row, keyboardCell.column);
    }

    function positionHintMarker() {
        hintMarker.hidden = !highlightedHint;
        if (!highlightedHint) return;
        const { axis, index, cell } = highlightedHint;
        const row = axis === 'row';
        hintMarker.classList.toggle('is-logical', Boolean(cell));
        hintMarker.style.left = ((leftClueCount + (cell?.column ?? (row ? 0 : index))) * boardView.cellSize) + 'px';
        hintMarker.style.top = ((topClueCount + (cell?.row ?? (row ? index : 0))) * boardView.cellSize) + 'px';
        hintMarker.style.width = ((!cell && row ? columns : 1) * boardView.cellSize) + 'px';
        hintMarker.style.height = ((!cell && !row ? rows : 1) * boardView.cellSize) + 'px';
        hintMarker.style.borderWidth = Math.max(1, Math.min(2, Math.floor(boardView.cellSize / 2))) + 'px';
    }

    function renderBoard(force = false) {
        renderer.drawBoard(force, { cellSize: boardView.cellSize, showSymbols, conflicts, highlightedHint });
        renderFixedClues();
    }

    boardView.initialize(initialCellSize);
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
            conflictMessage.textContent = '今のところ、ヒントの数字と矛盾する行・列はありません。';
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
            hintMessage.textContent = '今の入力とヒントの数字に矛盾があります。「矛盾チェック」で場所を確認できます。';
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
        if (highlightedHint?.cell) boardView.scrollCellIntoView(highlightedHint.cell.row, highlightedHint.cell.column);
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
        boardView.scrollLineIntoView(axis, index);
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
                boardView.fitBoard();
            }
            clock.start();
        } else {
            stopStroke();
            pausedPosition = { left: viewport.scrollLeft, top: viewport.scrollTop };
            clock.suspend();
            showBoardMenu();
            minimap.close();
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

    function applyColor({ row, column }, color, action) {
        if (fixedSlashes.has(row * columns + column)) return;
        const before = cells[row][column];
        if (before === color) return;
        action.push({ row, column, before, after: color });
        cells[row][column] = color;
        renderer.paintCell(row, column, color, boardView.cellSize, showSymbols);
        minimap.repaint();
    }

    function continueStroke(event) {
        if (!stroke || event.pointerId !== stroke.id) return;
        const point = boardView.pointFor(event, true);
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
            minimap.repaint();
            queueProgressSave();
        }
        pressedClue = undefined;
    }, boardView.pinch);

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
        const point = boardView.pointFor(event);
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
        else if (inputMode === 'paint') editCell(cell, getSelectedColor());
    };
    canvas.oncontextmenu = event => {
        if (event.pointerType === 'touch') return;
        const cell = boardCellAt(boardView.pointFor(event), columns, rows);
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
                editCell(keyboardCell, key === 'delete' || key === 'backspace' ? blank : getSelectedColor());
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
        const point = boardView.pointFor(event);
        pressedClue = boardClueAt(point, rowsOfClues, columnsOfClues)?.key;
        if (inputMode !== 'trace') return;
        const cell = boardCellAt(point, columns, rows);
        if (!cell) return;
        canvas.setPointerCapture(event.pointerId);
        stroke = { id: event.pointerId, point, color: getSelectedColor(), changes: [] };
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
    return {
        state: board,
        stopStroke,
        closeMinimap: minimap.close,
        redraw() {
            renderBoard();
            boardView.updateZoomButtons();
        },
        refreshSettings() {
            const mode = configuredPaintMode();
            if (inputMode !== 'pick' && inputMode !== mode) setInputMode(mode);
            showSymbols = multiColor && boardSetting('showSymbols', board);
            palettePanel.classList.toggle('show-symbols', showSymbols);
            renderBoard(true);
        },
        fitInitially() {
            if (viewport.hidden) initialFitPending = true;
            else boardView.fitBoard();
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
