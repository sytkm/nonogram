const MOSAIC_SIDE = 10;
const MAX_MOSAIC_TILES = 400;
let mosaicShareRequest;

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

function openMosaic({ matrix, palette, blank }, saved) {
    const mosaic = splitMosaic(matrix, blank);
    mosaic.tiles.forEach((tile, index) => {
        const state = saved?.tiles[index];
        if (!state) return;
        tile.complete ||= state.complete;
        tile.board = state.board;
        if (state.clock) tile.clock = createPlayClock(undefined, state.clock);
    });
    const panel = document.getElementById('mosaic-panel');
    const title = document.getElementById('mosaic-title');
    const progress = document.getElementById('mosaic-progress');
    const totalTime = document.getElementById('mosaic-total-time');
    const timeToggle = document.getElementById('mosaic-time-toggle');
    const reviewToggle = document.getElementById('mosaic-review-toggle');
    const grid = document.getElementById('mosaic-grid');
    const map = document.getElementById('mosaic-map');
    const instructions = document.getElementById('mosaic-instructions');
    const finished = document.getElementById('mosaic-finished');
    const canvas = document.getElementById('mosaic-image');
    const save = document.getElementById('mosaic-save');
    const saveLarge = document.getElementById('mosaic-save-large');
    const styles = palette.map(color => 'rgb(' + color.join(',') + ')');
    let completedCount = mosaic.tiles.filter(tile => tile.complete).length;
    let showTimes = saved?.showTimes ?? false;
    let showTiles = false;
    const tileDisplays = [];
    grid.replaceChildren();
    grid.style.setProperty('--mosaic-columns', mosaic.columns);
    finished.hidden = true;
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
            instructions.hidden = true;
            finished.hidden = false;
            focusTarget = document.getElementById('mosaic-finished-title');
        }
        updateTimeView();
        focusTarget.focus();
    }

    function updateTimeView() {
        let total = 0;
        for (const { tile, button, label, time } of tileDisplays) {
            const elapsed = tile.clock?.elapsed() ?? 0;
            // 区画の表示と同じ秒単位に揃え、画面上の数字を足した合計にする。
            total += Math.floor(elapsed / 1000) * 1000;
            time.textContent = formatPlayTime(elapsed);
            const state = tile.complete ? '（完成済み・閲覧）' : '';
            button.setAttribute('aria-label', label + state + (showTimes ? '、' + time.textContent : ''));
        }
        totalTime.textContent = formatPlayTime(total);
        timeToggle.setAttribute('aria-pressed', String(showTimes));
        grid.classList.toggle('show-times', showTimes);
        reviewToggle.hidden = finished.hidden || showTimes;
        reviewToggle.setAttribute('aria-pressed', String(showTiles));
        map.hidden = !finished.hidden && !showTimes && !showTiles;
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

    function reveal(tile, button) {
        const thumbnail = document.createElement('canvas');
        thumbnail.width = MOSAIC_SIDE;
        thumbnail.height = MOSAIC_SIDE;
        thumbnail.setAttribute('aria-hidden', 'true');
        const context = thumbnail.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, MOSAIC_SIDE, MOSAIC_SIDE);
        drawPiece(context, tile, 0, 0);
        button.firstElementChild.replaceWith(thumbnail);
        button.classList.add('mosaic-complete');
    }

    mosaic.tiles.forEach((tile, index) => {
        const label = '区画 ' + (index + 1);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mosaic-tile';
        const number = document.createElement('span');
        number.className = 'mosaic-tile-number';
        number.textContent = String(index + 1);
        const time = document.createElement('span');
        time.className = 'mosaic-tile-time';
        button.append(number, time);
        tileDisplays.push({ tile, button, label, time });
        if (tile.complete) reveal(tile, button);
        button.onclick = () => {
            tile.clock ??= createPlayClock();
            if (tile.complete) {
                tile.clock.finish();
                // Older saves keep the completion flag and time, but discard the board.
                tile.board ??= { cells: tile.answer.map(row => row.slice()), finished: true };
            }
            startPuzzle({ matrix: tile.answer, palette, blank }, {
                tileLabel: label + ' / ' + mosaic.tiles.length,
                board: tile.board ??= {},
                clock: tile.clock,
                review: tile.complete,
                onReturn: () => updateOverview(button),
                onSolved: () => {
                    tile.complete = true;
                    completedCount++;
                    delete tile.board.past;
                    delete tile.board.future;
                    reveal(tile, button);
                },
            });
        };
        grid.append(button);
    });

    timeToggle.onclick = () => {
        showTimes = !showTimes;
        updateTimeView();
        queueProgressSave();
    };
    reviewToggle.onclick = () => {
        showTiles = !showTiles;
        updateTimeView();
    };
    updateOverview(title);
    updateMosaicShare({ matrix, palette, blank });
    setProgressSource(() => ({
        kind: 'mosaic',
        puzzle: { matrix, palette, blank },
        showTimes,
        tiles: mosaic.tiles.map(tile => ({
            complete: tile.complete, board: tile.board, clock: tile.clock?.snapshot(),
        })),
    }), saved?.id);
}

function updateMosaicShare(puzzle) {
    const group = document.getElementById('mosaic-share');
    const message = document.getElementById('mosaic-share-message');
    setupPuzzleShare(group, null);
    message.textContent = '';
    const request = mosaicShareURL(window.location.href, puzzle);
    mosaicShareRequest = request;
    request.then(url => {
        if (mosaicShareRequest !== request) return;
        setupPuzzleShare(group, url);
        if (!url) message.textContent = '共有リンクが8,000文字を超えるため、この分割問題はリンクで共有できません。';
    }).catch(() => {
        if (mosaicShareRequest !== request) return;
        message.textContent = 'このブラウザでは分割問題の共有リンクを作成できませんでした。';
    });
}
