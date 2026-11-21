const MOSAIC_SIDE = 10;
const MAX_MOSAIC_TILES = 400;

function canSplitPuzzle(matrix) {
    const across = Math.ceil(matrix[0].length / MOSAIC_SIDE);
    const down = Math.ceil(matrix.length / MOSAIC_SIDE);
    return across * down > 1 && across * down <= MAX_MOSAIC_TILES;
}

function splitMosaic(matrix, blank) {
    const width = matrix[0].length;
    const height = matrix.length;
    const columns = Math.ceil(width / MOSAIC_SIDE);
    const tiles = [];

    for (let top = 0; top < height; top += MOSAIC_SIDE) {
        for (let left = 0; left < width; left += MOSAIC_SIDE) {
            const tileWidth = Math.min(MOSAIC_SIDE, width - left);
            const tileHeight = Math.min(MOSAIC_SIDE, height - top);
            const answer = Array.from({ length: MOSAIC_SIDE }, (_, y) =>
                Array.from({ length: MOSAIC_SIDE }, (_, x) =>
                    x < tileWidth && y < tileHeight ? matrix[top + y][left + x] : blank
                )
            );
            tiles.push({
                top, left, width: tileWidth, height: tileHeight, answer,
                complete: answer.every(row => row.every(color => color === blank)),
            });
        }
    }
    return { width, height, columns, tiles };
}

function mosaicExportScale(width, height) {
    return Math.max(1, Math.min(32, Math.floor(1024 / Math.max(width, height))));
}

function prepareMosaicDownload(link, canvas) {
    canvas.toBlob(blob => {
        link.href = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
        link.hidden = false;
    }, 'image/png');
}

function openMosaic({ matrix, palette, blank }) {
    const mosaic = splitMosaic(matrix, blank);
    const panel = document.getElementById('mosaic-panel');
    const title = document.getElementById('mosaic-title');
    const progress = document.getElementById('mosaic-progress');
    const grid = document.getElementById('mosaic-grid');
    const map = document.getElementById('mosaic-map');
    const instructions = document.getElementById('mosaic-instructions');
    const finished = document.getElementById('mosaic-finished');
    const canvas = document.getElementById('mosaic-image');
    const save = document.getElementById('mosaic-save');
    const saveLarge = document.getElementById('mosaic-save-large');
    const styles = palette.map(color => 'rgb(' + color.join(',') + ')');
    let completedCount = mosaic.tiles.filter(tile => tile.complete).length;
    grid.replaceChildren();
    grid.style.setProperty('--mosaic-columns', mosaic.columns);
    finished.hidden = true;
    map.hidden = false;
    instructions.hidden = false;
    for (const link of [save, saveLarge]) {
        if (link.href.startsWith('blob:')) URL.revokeObjectURL(link.href);
        link.removeAttribute('href');
        link.hidden = true;
    }

    function updateOverview(focusTarget) {
        setPlaying(false);
        document.getElementById('start-panel').hidden = true;
        panel.hidden = false;
        progress.textContent = completedCount + ' / ' + mosaic.tiles.length + ' 区画が完成';
        if (completedCount === mosaic.tiles.length && finished.hidden) {
            canvas.width = mosaic.width;
            canvas.height = mosaic.height;
            canvas.style.width = Math.min(480, 480 * mosaic.width / mosaic.height) + 'px';
            const context = canvas.getContext('2d');
            for (const tile of mosaic.tiles) drawPiece(context, tile, tile.left, tile.top);
            prepareMosaicDownload(save, canvas);
            const scale = mosaicExportScale(mosaic.width, mosaic.height);
            if (scale > 1) {
                const enlarged = document.createElement('canvas');
                enlarged.width = mosaic.width * scale;
                enlarged.height = mosaic.height * scale;
                const enlargedContext = enlarged.getContext('2d');
                enlargedContext.imageSmoothingEnabled = false;
                enlargedContext.drawImage(canvas, 0, 0, enlarged.width, enlarged.height);
                prepareMosaicDownload(saveLarge, enlarged);
            }
            map.hidden = true;
            instructions.hidden = true;
            finished.hidden = false;
            focusTarget = document.getElementById('mosaic-finished-title');
        }
        focusTarget.focus();
    }

    function drawPiece(context, tile, left, top) {
        for (let y = 0; y < tile.height; y++) {
            for (let x = 0; x < tile.width; x++) {
                const color = tile.answer[y][x];
                context.fillStyle = color === blank ? '#fff' : styles[color];
                context.fillRect(left + x, top + y, 1, 1);
            }
        }
    }

    function reveal(tile, button, label) {
        const thumbnail = document.createElement('canvas');
        thumbnail.width = MOSAIC_SIDE;
        thumbnail.height = MOSAIC_SIDE;
        thumbnail.setAttribute('aria-hidden', 'true');
        const context = thumbnail.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, MOSAIC_SIDE, MOSAIC_SIDE);
        drawPiece(context, tile, 0, 0);
        button.replaceChildren(thumbnail);
        button.setAttribute('aria-label', label + '（完成済み）');
        button.classList.add('mosaic-complete');
        button.disabled = true;
    }

    mosaic.tiles.forEach((tile, index) => {
        const label = '区画 ' + (index + 1);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mosaic-tile';
        button.textContent = String(index + 1);
        button.setAttribute('aria-label', label);
        if (tile.complete) reveal(tile, button, label);
        button.onclick = () => {
            startPuzzle({ matrix: tile.answer, palette, blank }, {
                tileLabel: label + ' / ' + mosaic.tiles.length,
                initialBoard: tile.progress,
                onReturn: () => {
                    tile.progress = g_drawmatrix;
                    updateOverview(button);
                },
                onSolved: () => {
                    tile.complete = true;
                    completedCount++;
                    tile.progress = undefined;
                    reveal(tile, button, label);
                    updateOverview(grid.querySelector('button:not(:disabled)') ?? title);
                },
            });
        };
        grid.append(button);
    });

    updateOverview(title);
}
