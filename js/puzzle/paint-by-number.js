// 塗り絵のルール。画像処理・画面・ノノグラムの判定から独立させる。
const paintSharePrefix = '#paint=';

function paintPuzzleProblem(puzzle) {
    if (!puzzle || !isValidSharedPuzzle(puzzle, false)) return '画像のデータを読み直してください。';
    if (puzzle.matrix.length > 200 || puzzle.matrix[0].length > 200) {
        return '塗り絵は最長辺200マスまでです。「色とマス数」でマス数を減らしてください。';
    }
    const colors = new Set(puzzle.matrix.flat());
    colors.delete(puzzle.blank);
    if (!colors.size) return '塗るマスがありません。画像や変換条件を選び直してください。';
    if (colors.size > 15) return '塗り絵は背景込み16色までです。「色とマス数」で色数を減らしてください。';
    return '';
}

/** 使用する色だけをパレット順に並べ、背景0・塗り色1〜15に揃える。 */
function normalizePaintPuzzle(puzzle) {
    const problem = paintPuzzleProblem(puzzle);
    if (problem) throw new Error(problem);
    const colors = [...new Set(puzzle.matrix.flat())].filter(color => color !== puzzle.blank).sort((a, b) => a - b);
    const indices = new Map(colors.map((color, index) => [color, index + 1]));
    return {
        matrix: puzzle.matrix.map(row => row.map(color => color === puzzle.blank ? 0 : indices.get(color))),
        palette: [[255, 255, 255], ...colors.map(color => puzzle.palette[color].slice())],
        blank: 0,
    };
}

function canPaintNumberCell(answer, cells, blank, { row, column }, color) {
    return color !== blank && answer[row]?.[column] === color && cells[row]?.[column] === blank;
}

function paintColorProgress({ matrix, palette, blank }, cells) {
    const remaining = Array(palette.length).fill(0);
    for (let row = 0; row < matrix.length; row++) {
        for (let column = 0; column < matrix[row].length; column++) {
            const color = matrix[row][column];
            if (color !== blank && cells[row][column] !== color) remaining[color]++;
        }
    }
    return remaining;
}

function nextPaintColor(remaining, current) {
    for (let step = 1; step <= remaining.length; step++) {
        const color = (current + step) % remaining.length;
        if (remaining[color] > 0) return color;
    }
    return null;
}

/** 直接押したマスを優先し、空白などの境界付近だけ一意の対象を補う。 */
function paintTouchCell(point, columns, rows, tolerance, canPaint) {
    const direct = boardCellAt(point, columns, rows);
    if (!point || (direct && canPaint(direct))) return direct;
    // 呼び出し側で別の色・塗り済みマスへの補正を抑え、空白の境界だけを補う。
    const candidates = [];
    for (let row = Math.max(0, Math.floor(point.y - tolerance)); row <= Math.min(rows - 1, Math.floor(point.y + tolerance)); row++) {
        for (let column = Math.max(0, Math.floor(point.x - tolerance)); column <= Math.min(columns - 1, Math.floor(point.x + tolerance)); column++) {
            const cell = { row, column };
            if (canPaint(cell)) candidates.push(cell);
        }
    }
    return candidates.length === 1 ? candidates[0] : direct;
}

function paintSamplePuzzle() {
    const lines = ['..........', '......55..', '...1..55..', '..111.....', '.11111....', '..222..4..', '..232.444.', '..222..4..', '.44444444.', '..........'];
    return {
        matrix: lines.map(line => [...line].map(value => value === '.' ? 0 : Number(value))),
        palette: [[255, 255, 255], [214, 69, 69], [168, 107, 69], [77, 143, 232], [82, 166, 107], [245, 211, 77]],
        blank: 0,
    };
}

async function readPaintShare(hash) {
    return normalizePaintPuzzle(await readPuzzleShare(hash, paintSharePrefix));
}
