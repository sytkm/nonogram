// ヒントの生成、クリア判定、行・列ヒント、完成行の自動斜線。

/**
 * 問題を作成・共有・保存するときに渡すデータ。プレイ中の斜線や入力は含まない。
 * @typedef {object} PuzzleData
 * @property {number[][]} matrix - 答えの行列。各値はパレット番号か blank
 * @property {number[][]} palette - RGBの配列
 * @property {number} blank - 空白を表す値。palette.length の場合もある
 */
/** @typedef {[color: number, count: number]} Clue */
/** @typedef {[clues: Clue[][], maxClues: number]} ClueSummary */

function matchesIntendedImage(answer, board, blank) {
    return answer.every((line, row) => line.every((color, column) => {
        const painted = board[row][column];
        return painted === color || (color === blank && painted === -1);
    }));
}

function pickLineHint(answer, board, blank, random = Math.random) {
    const unfinishedRows = Array(answer.length).fill(false);
    const unfinishedColumns = Array(answer[0].length).fill(false);
    answer.forEach((colors, row) => colors.forEach((color, column) => {
        const current = board[row][column];
        // Unmarked blanks already count as correct when selecting a line.
        if (current === color || (current === -1 && color === blank)) return;
        unfinishedRows[row] = true;
        unfinishedColumns[column] = true;
    }));
    const candidates = [];
    for (const [axis, lines] of [['row', unfinishedRows], ['column', unfinishedColumns]]) {
        lines.forEach((unfinished, index) => {
            if (unfinished) candidates.push({ axis, index });
        });
    }
    if (!candidates.length) return null;

    const { axis, index } = candidates[Math.floor(random() * candidates.length)];
    const line = axis === 'row' ? answer[index] : answer.map(row => row[index]);
    const changes = [];
    line.forEach((value, offset) => {
        const row = axis === 'row' ? index : offset;
        const column = axis === 'row' ? offset : index;
        const color = value === blank ? -1 : value;
        if (board[row][column] !== color) changes.push({ row, column, color });
    });
    return { axis, index, changes };
}

/**
 * 全行のヒントが一致するか調べる。斜線も空白として判定する。
 * @param {ClueSummary} clueSummary - makeNumber が返したヒントと最大組数
 * @param {number[][]} matrix - プレイ中の行列
 * @param {number} blank - その問題の空白番号
 * @returns {boolean}
 */
function checkNumber(clueSummary, matrix, blank) {
    const [lines] = clueSummary;
    return lines.length === matrix.length && lines.every((expected, index) =>
        lineMatchesClues(matrix[index], expected, blank));
}

function lineMatchesClues(line, clues, blank) {
    const actual = lineClues(line, blank);
    return actual.length === clues.length && clues.every(([color, count], index) =>
        color === actual[index][0] && count === actual[index][1]);
}

function findCompletedLineBlanks(cells, rowsOfClues, columnsOfClues, blank, changes) {
    const rows = new Set();
    const columns = new Set();
    for (const { row, column, after } of changes) {
        if (after !== blank && after >= 0) {
            rows.add(row);
            columns.add(column);
        }
    }

    const remaining = new Map();
    const width = cells[0].length;
    for (const row of rows) {
        const line = cells[row];
        if (!line.includes(blank) || !lineMatchesClues(line, rowsOfClues[row], blank)) continue;
        line.forEach((color, column) => {
            if (color === blank) remaining.set(row * width + column, { row, column });
        });
    }
    for (const column of columns) {
        const line = cells.map(row => row[column]);
        if (!line.includes(blank) || !lineMatchesClues(line, columnsOfClues[column], blank)) continue;
        line.forEach((color, row) => {
            if (color === blank) remaining.set(row * width + column, { row, column });
        });
    }
    return remaining.values();
}

function lineClues(line, blank) {
    const clues = [];
    let run;
    for (const color of line) {
        if (color === blank || color === -1) {
            run = undefined;
        } else if (run?.[0] === color) {
            run[1]++;
        } else {
            run = [color, 1];
            clues.push(run);
        }
    }
    return clues.length ? clues : [[-1, 0]];
}

/**
 * 入力行列からヒントと、1行に並ぶヒントの最大組数を求める。
 * @param {number[][]} matrix - 色番号の行列。-1 は斜線
 * @param {number} blank - その問題の空白番号
 * @returns {ClueSummary}
 */
function makeNumber(matrix, blank) {
    const clues = [];
    let maxClues = 0;
    for (const line of matrix) {
        const lineHints = lineClues(line, blank);
        clues.push(lineHints);
        maxClues = Math.max(maxClues, lineHints.length);
    }
    return [clues, maxClues];
}

/**
 * 作成プレビュー、プレイ開始、日替わりの検査で共通の行・列ヒントを作る。
 * @param {number[][]} matrix - 1行1列以上の盤面
 * @param {number} blank - その問題の空白番号
 * @returns {{rows: ClueSummary, columns: ClueSummary}}
 */
function makePuzzleClues(matrix, blank) {
    return { rows: makeNumber(matrix, blank), columns: makeNumber(transpose(matrix), blank) };
}

/**
 * 行列転置関数
 * https://qiita.com/kznr_luk/items/790f1b154d1b6d4de398
 * @param  {Number[][]} arr - 入力マトリクス
 * @return {Number[][]} - 転置したマトリクス
 */
function transpose(arr) {
    return arr[0].map((_, c) => arr.map(r => r[c]))
}
