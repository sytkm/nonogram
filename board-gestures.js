// ポインター座標、なぞり塗りの軌跡、タッチでの移動とピンチ。

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
