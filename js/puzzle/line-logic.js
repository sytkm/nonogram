// An untouched cell can become empty or any color. A slash must stay empty.
function canBeEmpty(cell, blank) {
    return cell === blank || cell === -1;
}

function lineReachability(cells, clues, blank, trace = false) {
    const width = cells.length;
    // reachable[i] means the first i cells can satisfy all clues processed so far.
    let reachable = new Uint8Array(width + 1);
    let next = new Uint8Array(width + 1);
    reachable[0] = 1;
    for (let i = 0; i < width; i++) {
        reachable[i + 1] = reachable[i] && canBeEmpty(cells[i], blank);
    }

    const prefixes = trace ? [reachable] : null;
    const placements = trace ? [] : null;
    let previousColor;
    for (const [color, length] of clues) {
        if (length === 0) continue;
        const needsGap = color === previousColor;
        const edge = trace ? new Int32Array(width + 1) : null;
        let lastBlocked = -1;
        for (let end = 1; end <= width; end++) {
            const cell = cells[end - 1];
            if (cell !== blank && cell !== color) lastBlocked = end - 1;

            const start = end - length;
            const before = start - Number(needsGap);
            const fits = before >= 0 && lastBlocked < start && reachable[before] &&
                (!needsGap || canBeEmpty(cells[before], blank));
            if (fits && edge) edge[end] = before + 1;
            next[end] = fits || (next[end - 1] && canBeEmpty(cell, blank));
        }
        if (!next.some(Boolean)) return false;
        if (trace) {
            prefixes.push(next);
            placements.push({ color, length, edge });
            reachable = next;
            next = new Uint8Array(width + 1);
        } else {
            [reachable, next] = [next, reachable];
            next[0] = 0;
        }
        previousColor = color;
    }
    if (!reachable[width]) return false;
    return trace ? { prefixes, placements } : true;
}

function isLinePossible(cells, clues, blank) {
    return lineReachability(cells, clues, blank);
}

function lineCellChoices(cells, clues, blank) {
    const trace = lineReachability(cells, clues, blank, true);
    if (!trace) return null;
    const { prefixes, placements } = trace;
    const width = cells.length;
    // Walk backwards from the end of a valid layout. Only traversed edges
    // belong to complete layouts, so they describe every possible cell value.
    let canFinish = new Uint8Array(width + 1);
    canFinish[width] = 1;
    const choices = Array(width).fill(undefined);
    function note(position, color) {
        if (choices[position] === undefined) choices[position] = color;
        else if (choices[position] !== color) choices[position] = null;
    }
    for (let count = placements.length; count >= 0; count--) {
        const placement = placements[count - 1];
        const earlier = new Uint8Array(width + 1);
        const coverage = new Int32Array(width + 1);
        for (let end = width; end > 0; end--) {
            if (!canFinish[end]) continue;
            if (prefixes[count][end - 1] && canBeEmpty(cells[end - 1], blank)) {
                canFinish[end - 1] = 1;
                note(end - 1, blank);
            }
            const encoded = placement?.edge[end];
            if (encoded) {
                const before = encoded - 1;
                const start = end - placement.length;
                earlier[before] = 1;
                if (before < start) note(before, blank);
                coverage[start]++;
                coverage[end]--;
            }
        }
        if (placement) {
            let active = 0;
            for (let i = 0; i < width; i++) {
                active += coverage[i];
                if (active) note(i, placement.color);
            }
        }
        canFinish = earlier;
    }
    return choices;
}

function findLogicalHint(cells, rowsOfClues, columnsOfClues, blank) {
    for (const [axis, lines] of [['row', rowsOfClues], ['column', columnsOfClues]]) {
        for (let index = 0; index < lines.length; index++) {
            const line = axis === 'row' ? cells[index] : cells.map(row => row[index]);
            if (!line.includes(blank)) continue;
            const choices = lineCellChoices(line, lines[index], blank);
            const offset = choices?.findIndex((color, i) => line[i] === blank && color != null);
            if (offset === undefined || offset < 0) continue;
            return {
                axis, index, color: choices[offset],
                row: axis === 'row' ? index : offset,
                column: axis === 'column' ? index : offset,
            };
        }
    }
    return null;
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
