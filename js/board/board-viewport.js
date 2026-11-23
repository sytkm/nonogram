/**
 * 表示倍率、スクロール、ポインター座標の変換を扱う。
 * 描画や入力の変更は呼び出し側が行う。倍率を変える前に入力を確定する。
 */
function createBoardViewport({
    viewport, canvas, columns, rows, leftClueCount, topClueCount,
    shouldStickClues, beforeResize, redraw, afterResize,
}) {
    const widthInCells = columns + leftClueCount;
    const heightInCells = rows + topClueCount;
    const standardCellSize = 44;
    const maxCellSize = 64;
    const zoomIn = document.getElementById('zoom-in');
    const zoomOut = document.getElementById('zoom-out');
    const fit = () => Math.max(1, Math.min(maxCellSize, Math.floor(Math.min(
        viewport.clientWidth / widthInCells, viewport.clientHeight / heightInCells
    ))));
    let cellSize;

    function clueGutters() {
        return shouldStickClues()
            ? fixedClueGutters(viewport.scrollLeft, viewport.scrollTop, viewport.clientWidth,
                viewport.clientHeight, leftClueCount * cellSize, topClueCount * cellSize)
            : { left: 0, top: 0 };
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

    function scrollCellIntoView(row, column) {
        const x = (leftClueCount + column) * cellSize;
        const y = (topClueCount + row) * cellSize;
        const { left, top } = clueGutters();
        viewport.scrollLeft = Math.min(x - left, Math.max(viewport.scrollLeft, x + cellSize - viewport.clientWidth));
        viewport.scrollTop = Math.min(y - top, Math.max(viewport.scrollTop, y + cellSize - viewport.clientHeight));
    }

    function scrollLineIntoView(axis, index) {
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
    }

    function resizeBoard(nextSize, center, anchor) {
        beforeResize();
        const previousSize = cellSize;
        const oldX = viewport.scrollLeft + (anchor?.from.x ?? Math.min(viewport.clientWidth, canvas.clientWidth) / 2);
        const oldY = viewport.scrollTop + (anchor?.from.y ?? Math.min(viewport.clientHeight, canvas.clientHeight) / 2);
        cellSize = nextSize;
        canvas.style.width = (widthInCells * cellSize) + 'px';
        canvas.style.height = (heightInCells * cellSize) + 'px';
        redraw();
        if (center && previousSize) {
            const ratio = cellSize / previousSize;
            viewport.scrollLeft = oldX * ratio - (anchor?.to.x ?? Math.min(viewport.clientWidth, canvas.clientWidth) / 2);
            viewport.scrollTop = oldY * ratio - (anchor?.to.y ?? Math.min(viewport.clientHeight, canvas.clientHeight) / 2);
        } else {
            viewport.scrollLeft = 0;
            viewport.scrollTop = 0;
        }
        afterResize();
        zoomIn.disabled = cellSize >= maxCellSize;
        zoomOut.disabled = cellSize <= 1;
    }

    function fitBoard() {
        resizeBoard(fit(), false);
        // Scrollbars can disappear after shrinking the board and free more space.
        const adjustedSize = fit();
        if (adjustedSize !== cellSize) resizeBoard(adjustedSize, false);
    }

    function initialize(initialCellSize) {
        const onSmallScreen = window.matchMedia('(max-width: 600px), (pointer: coarse)').matches;
        resizeBoard(onSmallScreen ? Math.max(28, Math.min(standardCellSize, fit())) : Math.min(initialCellSize, maxCellSize), false);
        zoomIn.onclick = () => resizeBoard(Math.min(maxCellSize, Math.ceil(cellSize * 1.25)), true);
        zoomOut.onclick = () => resizeBoard(Math.max(1, Math.floor(cellSize / 1.25)), true);
        document.getElementById('zoom-fit').onclick = fitBoard;
        document.getElementById('zoom-standard').onclick = () => {
            if (cellSize !== standardCellSize) resizeBoard(standardCellSize, true);
        };
    }

    const pinch = {
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
    };

    return {
        get cellSize() { return cellSize; },
        initialize, fitBoard, clueGutters, pointFor, scrollCellIntoView, scrollLineIntoView, pinch,
    };
}
