function reducePuzzleLine(line, clues, blank, budget) {
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

function propagatePuzzleLines(cells, rowsOfClues, columnsOfClues, blank, budget) {
    const height = rowsOfClues.length;
    const width = columnsOfClues.length;
    let previousUnfilled;
    let unfilled = width * height + 1;
    do {
        previousUnfilled = unfilled;
        for (let row = 0; row < height; row++) {
            if (budget.remaining <= 0) return 'inconclusive';
            if (!reducePuzzleLine(cells[row], rowsOfClues[row], blank, budget)) return 'contradiction';
        }
        for (let column = 0; column < width; column++) {
            if (budget.remaining <= 0) return 'inconclusive';
            const line = cells.map(row => row[column]);
            if (!reducePuzzleLine(line, columnsOfClues[column], blank, budget)) return 'contradiction';
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

/**
 * @param {number} height
 * @param {number} width
 * @param {number} blank - 未確定マスの値
 * @param {number[]} fixed - 左上から行優先で数えた固定斜線の位置（0始まり）
 * @returns {number[][]} 検査用の行列。固定斜線は -1
 */
function initialPuzzleCells(height, width, blank, fixed) {
    const cells = Array.from({ length: height }, () => Array(width).fill(blank));
    for (const index of fixed) cells[Math.floor(index / width)][index % width] = -1;
    return cells;
}

/**
 * 行・列だけの推理で解けるか調べる。答えの候補を仮置きする探索は行わない。
 * @param {Clue[][]} rows
 * @param {Clue[][]} columns
 * @param {number} blank
 * @param {number[]} [fixed] - 固定斜線の位置（行優先、0始まり）
 * @param {number} [maxLineChecks] - 行・列を調べる回数の上限
 * @returns {'complete'|'partial'|'contradiction'|'inconclusive'}
 */
function inspectLineSolvability(rows, columns, blank, fixed = [], maxLineChecks = 20_000) {
    const height = rows.length;
    const width = columns.length;
    if (height > 200 || width > 200) return 'inconclusive';
    const cells = initialPuzzleCells(height, width, blank, fixed);
    return propagatePuzzleLines(cells, rows, columns, blank, { remaining: maxLineChecks });
}

function searchPuzzleSolutions(rowsOfClues, columnsOfClues, blank, fixed, budget) {
    const height = rowsOfClues.length;
    const width = columnsOfClues.length;
    if (height > 200 || width > 200) return null;

    const rowColors = rowsOfClues.map(clues => [...new Set(clues.map(([color]) => color))]);
    const columnColors = columnsOfClues.map(clues => new Set(clues.map(([color]) => color)));
    const solutions = [];

    function search(cells, depth) {
        if (depth >= 64) return false;
        const state = propagatePuzzleLines(cells, rowsOfClues, columnsOfClues, blank, budget);
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

    const cells = initialPuzzleCells(height, width, blank, fixed);
    return search(cells, 0) ? solutions : null;
}

function inspectPuzzleQuality(rows, columns, blank, maxLineChecks = 20_000, fixed = []) {
    const solutions = searchPuzzleSolutions(rows, columns, blank, fixed, { remaining: maxLineChecks });
    if (!solutions) return 'inconclusive';
    if (solutions.length >= 2) return 'multiple';
    return solutions.length === 1 ? 'unique' : 'none';
}

/**
 * 元画像を保ったまま答えを一つに絞れるよう、必要な固定斜線を探す。
 * @param {Clue[][]} rows
 * @param {Clue[][]} columns
 * @param {number} blank
 * @param {number[][]} answer - 元の答えの行列
 * @param {number} [maxLineChecks] - 全候補を通した共通の検査上限
 * @returns {{quality: 'unique'|'inconclusive', fixedSlashes: number[]}} 未確定時は途中の斜線を返さない
 */
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
