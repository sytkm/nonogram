// An untouched cell can become empty or any color. A slash must stay empty.
function canBeEmpty(cell, blank) {
    return cell === blank || cell === -1;
}

function isLinePossible(cells, clues, blank) {
    const width = cells.length;
    // reachable[i] means the first i cells can satisfy all clues processed so far.
    let reachable = new Uint8Array(width + 1);
    let next = new Uint8Array(width + 1);
    reachable[0] = 1;
    for (let i = 0; i < width; i++) {
        reachable[i + 1] = reachable[i] && canBeEmpty(cells[i], blank);
    }

    let previousColor;
    for (const [color, length] of clues) {
        if (length === 0) continue;
        const needsGap = color === previousColor;
        let lastBlocked = -1;
        for (let end = 1; end <= width; end++) {
            const cell = cells[end - 1];
            if (cell !== blank && cell !== color) lastBlocked = end - 1;

            const start = end - length;
            const fits = start >= 0 && lastBlocked < start && (needsGap
                ? start > 0 && reachable[start - 1] && canBeEmpty(cells[start - 1], blank)
                : reachable[start]);
            next[end] = fits || (next[end - 1] && canBeEmpty(cell, blank));
        }
        if (!next.some(Boolean)) return false;
        [reachable, next] = [next, reachable];
        next[0] = 0;
        previousColor = color;
    }
    return Boolean(reachable[width]);
}

function findBoardConflicts(cells, rowsOfClues, columnsOfClues, blank) {
    const rows = new Set();
    const columns = new Set();
    rowsOfClues.forEach((clues, row) => {
        if (!isLinePossible(cells[row], clues, blank)) rows.add(row);
    });
    columnsOfClues.forEach((clues, column) => {
        const line = cells.map(row => row[column]);
        if (!isLinePossible(line, clues, blank)) columns.add(column);
    });
    return { rows, columns };
}
