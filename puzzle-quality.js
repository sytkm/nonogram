function inspectPuzzleQuality(rowsOfClues, columnsOfClues, blank, maxLineChecks = 20_000) {
    const height = rowsOfClues.length;
    const width = columnsOfClues.length;
    if (height > 200 || width > 200) return 'inconclusive';

    const rowColors = rowsOfClues.map(clues => [...new Set(clues.map(([color]) => color))]);
    const columnColors = columnsOfClues.map(clues => new Set(clues.map(([color]) => color)));
    let lineChecks = 0;
    let solutions = 0;

    function reduceLine(line, clues) {
        lineChecks++;
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
                if (lineChecks >= maxLineChecks) return 'inconclusive';
                if (!reduceLine(cells[row], rowsOfClues[row])) return 'contradiction';
            }
            for (let column = 0; column < width; column++) {
                if (lineChecks >= maxLineChecks) return 'inconclusive';
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
            solutions++;
            return true;
        }

        const row = cells.findIndex(line => line.includes(blank));
        const column = cells[row].indexOf(blank);
        const colors = rowColors[row].filter(color => color >= 0 && columnColors[column].has(color));
        for (const color of [-1, ...colors]) {
            const branch = cells.map(line => line.slice());
            branch[row][column] = color;
            if (!search(branch, depth + 1)) return false;
            if (solutions >= 2) break;
        }
        return true;
    }

    const cells = Array.from({ length: height }, () => Array(width).fill(blank));
    if (!search(cells, 0)) return 'inconclusive';
    if (solutions >= 2) return 'multiple';
    return solutions === 1 ? 'unique' : 'none';
}
