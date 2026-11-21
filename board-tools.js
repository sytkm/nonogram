function boardClueKey(axis, line, index) {
    return axis + ':' + line + ':' + index;
}

function boardClueAt(point, rows, columns) {
    if (!point) return null;
    const row = Math.floor(point.y);
    const column = Math.floor(point.x);
    if (row >= 0 && column < 0 && rows[row]?.length + column >= 0) {
        return boardClueKey('row', row, rows[row].length + column);
    }
    if (column >= 0 && row < 0 && columns[column]?.length + row >= 0) {
        return boardClueKey('column', column, columns[column].length + row);
    }
    return null;
}

function createBoardHistory(state) {
    // Board changes are kept in place so switching tiles preserves their state.
    const past = state.past ??= [];
    const future = state.future ??= [];

    function apply(change, value) {
        if ('key' in change) {
            if (value) state.marks[change.key] = true;
            else delete state.marks[change.key];
        } else {
            state.cells[change.row][change.column] = value;
        }
    }

    return {
        canUndo: () => past.length > 0,
        canRedo: () => future.length > 0,
        record(changes) {
            if (!changes.length) return;
            past.push(changes);
            if (past.length > 50) past.shift();
            future.length = 0;
        },
        undo() {
            const action = past.pop();
            if (!action) return false;
            for (let index = action.length - 1; index >= 0; index--) {
                apply(action[index], action[index].before);
            }
            future.push(action);
            return true;
        },
        redo() {
            const action = future.pop();
            if (!action) return false;
            for (const change of action) apply(change, change.after);
            past.push(action);
            return true;
        },
    };
}

function paletteSymbol(index, blank) {
    if (index > blank) index--;
    let symbol = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
        symbol = String.fromCharCode(65 + (n - 1) % 26) + symbol;
    }
    return symbol;
}

function fixedClueGutters(scrollLeft, scrollTop, viewWidth, viewHeight, clueWidth, clueHeight) {
    // Leave room to play even when many clues fit on a small or zoomed-in screen.
    return {
        left: scrollLeft > 0 && clueWidth <= viewWidth / 2 ? clueWidth : 0,
        top: scrollTop > 0 && clueHeight <= viewHeight / 2 ? clueHeight : 0,
    };
}

function fixedClueHit(x, y, { left, top }) {
    return {
        left: x >= 0 && x < left && y >= 0,
        top: y >= 0 && y < top && x >= 0,
    };
}
