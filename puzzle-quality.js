function searchPuzzleSolutions(rowsOfClues, columnsOfClues, blank, fixed, budget) {
    const height = rowsOfClues.length;
    const width = columnsOfClues.length;
    if (height > 200 || width > 200) return null;

    const rowColors = rowsOfClues.map(clues => [...new Set(clues.map(([color]) => color))]);
    const columnColors = columnsOfClues.map(clues => new Set(clues.map(([color]) => color)));
    const solutions = [];

    function reduceLine(line, clues) {
        budget.remaining--;
        if (!line.includes(blank)) return isLinePossible(line, clues, blank);
        const choices = lineCellChoices(line, clues, blank);
        if (!choices) return false;
        for (let i = 0; i < line.length; i++) {
            const color = choices[i];
            if (line[i] === blank && color != null) line[i] = color === blank ? -1 : color;
        }
        return true;
    }

    function propagate(cells) {
        let previousUnfilled;
        let unfilled = width * height + 1;
        do {
            previousUnfilled = unfilled;
            for (let row = 0; row < height; row++) {
                if (budget.remaining <= 0) return 'inconclusive';
                if (!reduceLine(cells[row], rowsOfClues[row])) return 'contradiction';
            }
            for (let column = 0; column < width; column++) {
                if (budget.remaining <= 0) return 'inconclusive';
                const line = cells.map(row => row[column]);
                if (!reduceLine(line, columnsOfClues[column])) return 'contradiction';
                for (let row = 0; row < height; row++) cells[row][column] = line[row];
            }
            unfilled = 0;
            for (const row of cells) {
                for (const color of row) if (color === blank) unfilled++;
            }
        // Columns can fill the last cell and invalidate a row checked earlier.
        } while (unfilled < previousUnfilled);
        return unfilled ? 'partial' : 'complete';
    }

    function search(cells, depth) {
        if (depth >= 64) return false;
        const state = propagate(cells);
        if (state === 'inconclusive') return false;
        if (state === 'contradiction') return true;
        if (state === 'complete') {
            solutions.push(cells);
            return true;
        }

        const row = cells.findIndex(line => line.includes(blank));
        const column = cells[row].indexOf(blank);
        const colors = rowColors[row].filter(color => color >= 0 && columnColors[column].has(color));
        for (const color of [-1, ...colors]) {
            const branch = cells.map(line => line.slice());
            branch[row][column] = color;
            if (!search(branch, depth + 1)) return false;
            if (solutions.length >= 2) break;
        }
        return true;
    }

    const cells = Array.from({ length: height }, () => Array(width).fill(blank));
    for (const index of fixed) cells[Math.floor(index / width)][index % width] = -1;
    return search(cells, 0) ? solutions : null;
}

function inspectPuzzleQuality(rows, columns, blank, maxLineChecks = 20_000, fixed = []) {
    const solutions = searchPuzzleSolutions(rows, columns, blank, fixed, { remaining: maxLineChecks });
    if (!solutions) return 'inconclusive';
    if (solutions.length >= 2) return 'multiple';
    return solutions.length === 1 ? 'unique' : 'none';
}

function preparePuzzleQuality(rows, columns, blank, answer, maxLineChecks = 20_000) {
    const fixed = [];
    const budget = { remaining: maxLineChecks };
    const width = columns.length;
    // Keep the clues sparse, and use one shared limit for all attempts.
    while (fixed.length <= 12) {
        const solutions = searchPuzzleSolutions(rows, columns, blank, fixed, budget);
        if (!solutions?.length) break;
        if (solutions.length === 1) return { quality: 'unique', fixedSlashes: fixed };

        // Each painted position is determined by the order of the colored runs.
        // A different solution must paint at least one empty cell in the intended image.
        const previousCount = fixed.length;
        for (let row = 0; row < rows.length; row++) {
            const column = answer[row].findIndex((color, x) =>
                color === blank && solutions.some(candidate => candidate[row][x] >= 0));
            if (column >= 0) {
                fixed.push(row * width + column);
                break;
            }
        }
        if (fixed.length === previousCount) break;
    }
    return { quality: 'inconclusive', fixedSlashes: [] };
}
