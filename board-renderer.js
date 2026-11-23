// 盤面キャンバスの描画と、スクロール時に固定するヒント。

function boardResolution(width, height, pixelRatio) {
    // 大きな盤面を拡大しても、描画用のメモリを使いすぎないようにする。
    const scale = Math.min(pixelRatio, 4096 / width, 4096 / height, Math.sqrt(8_388_608 / (width * height)));
    return {
        width: Math.max(1, Math.floor(width * scale)),
        height: Math.max(1, Math.floor(height * scale)),
    };
}

/**
 * 盤面と固定ヒントを描く。入力イベントや盤面データの更新は行わない。
 * 進行中の同じマス配列と、その時点のチェック状態を読み取る。
 */
function createBoardRenderer({ canvas, viewport, clueOverlay, board, rowClues, columnClues, palette, blank, fixedSlashes }) {
    const { cells } = board;
    const [rowsOfClues, leftClueCount] = rowClues;
    const [columnsOfClues, topClueCount] = columnClues;
    const rows = rowsOfClues.length;
    const columns = columnsOfClues.length;
    const widthInCells = columns + leftClueCount;
    const heightInCells = rows + topClueCount;
    const context = canvas.getContext('2d');
    const clueContext = clueOverlay.getContext('2d');
    const sheetColors = getComputedStyle(canvas);
    const cluePaper = sheetColors.getPropertyValue('--puzzle-paper').trim();
    const clueInk = sheetColors.getPropertyValue('--puzzle-ink').trim();
    const majorRule = sheetColors.getPropertyValue('--puzzle-major-rule').trim();
    const minorRule = sheetColors.getPropertyValue('--puzzle-rule').trim();

    function drawBoard(force, { cellSize, showSymbols, conflicts, highlightedHint }) {
        const size = boardResolution(widthInCells * cellSize, heightInCells * cellSize,
            window.devicePixelRatio || 1);
        if (!force && canvas.width === size.width && canvas.height === size.height) {
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
        cells.forEach((row, y) => row.forEach((color, x) => paintCell(y, x, color, cellSize, showSymbols)));

        // ヒントを盤面側に揃え、どの行・列の数字か追いやすくする。
        rowsOfClues.forEach((clues, y) => clues.forEach((clue, x) =>
            paintClue(leftClueCount - clues.length + x, topClueCount + y, clue,
                boardClueKey('row', y, x), conflicts?.rows.has(y),
                highlightedHint?.cell && highlightedHint.axis === 'row' && highlightedHint.index === y,
                cellSize, showSymbols)
        ));
        columnsOfClues.forEach((clues, x) => clues.forEach((clue, y) =>
            paintClue(leftClueCount + x, topClueCount - clues.length + y, clue,
                boardClueKey('column', x, y), conflicts?.columns.has(x),
                highlightedHint?.cell && highlightedHint.axis === 'column' && highlightedHint.index === x,
                cellSize, showSymbols)
        ));
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

    function paintClue(column, row, [color, count], key, hasConflict, explainsHint, cellSize, showSymbols) {
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

    function paintCell(row, column, color, cellSize, showSymbols) {
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

    function renderFixedClues(cellSize, { left, top }) {
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

    return { drawBoard, paintCell, renderFixedClues };
}
