// 盤面の入力済みマスと、いま見えているマスの範囲を小さく表示する。

function minimapVisibleRange(cellCount, cellSize, clueCount, scroll, viewSize, fixedGutter) {
    const start = Math.max(0, (scroll + fixedGutter) / cellSize - clueCount);
    const end = Math.min(cellCount, (scroll + viewSize) / cellSize - clueCount);
    return end > start ? { start, end } : null;
}

function createBoardMinimap({ cells, palette, blank, viewport, leftClueCount, topClueCount, boardView }) {
    const toggle = document.getElementById('toggle-board-minimap');
    const panel = document.getElementById('board-minimap');
    const canvas = document.getElementById('board-minimap-canvas');
    const frame = document.getElementById('board-minimap-frame');
    const columns = cells[0].length;
    const rows = cells.length;
    const longestSide = Math.max(columns, rows);
    const colors = palette.map(([r, g, b]) => [r, g, b, 255]);
    const white = [255, 255, 255, 255];
    const slash = [196, 205, 213, 255];
    // 表示に必要な画素だけを使い、盤面が大きくても描画の負荷を抑える。
    const scale = Math.min(1, 176 / longestSide);
    const width = Math.max(1, Math.round(columns * scale));
    const height = Math.max(1, Math.round(rows * scale));
    let repaintPending = false;
    let image;

    function paint() {
        const context = canvas.getContext('2d');
        if (!image) {
            canvas.width = width;
            canvas.height = height;
            image = context.createImageData(width, height);
        }
        for (let y = 0; y < height; y++) {
            const row = cells[Math.floor((y + 0.5) * rows / height)];
            for (let x = 0; x < width; x++) {
                const color = row[Math.floor((x + 0.5) * columns / width)];
                image.data.set(color === blank ? white : color < 0 ? slash : colors[color] ?? white,
                    (y * width + x) * 4);
            }
        }
        context.putImageData(image, 0, 0);
    }

    function repaint() {
        if (panel.hidden || repaintPending) return;
        repaintPending = true;
        requestAnimationFrame(() => {
            repaintPending = false;
            // 別の盤面に切り替えた後は、以前の盤面の描画を反映しない。
            if (!panel.hidden && toggle.onclick === toggleMinimap) paint();
        });
    }

    function updateViewport() {
        if (panel.hidden || viewport.hidden) return;
        const { clientWidth, clientHeight, scrollLeft, scrollTop } = viewport;
        const { cellSize } = boardView;
        const gutters = boardView.clueGutters();
        const size = Math.min(144, clientWidth / 3, clientHeight * 0.45);
        canvas.style.width = Math.max(1, size * columns / longestSide) + 'px';
        canvas.style.height = Math.max(1, size * rows / longestSide) + 'px';

        const across = minimapVisibleRange(columns, cellSize, leftClueCount, scrollLeft, clientWidth, gutters.left);
        const down = minimapVisibleRange(rows, cellSize, topClueCount, scrollTop, clientHeight, gutters.top);
        frame.hidden = !across || !down;
        if (!across || !down) {
            panel.setAttribute('aria-label', 'ミニマップ。塗るマスは表示範囲外です。');
            return;
        }
        const percent = (value, count) => (value / count * 100) + '%';
        Object.assign(frame.style, {
            left: percent(across.start, columns),
            top: percent(down.start, rows),
            width: percent(across.end - across.start, columns),
            height: percent(down.end - down.start, rows),
        });
        panel.setAttribute('aria-label',
            'ミニマップ。' + (Math.floor(down.start) + 1) + '〜' + Math.ceil(down.end) + '行、' +
            (Math.floor(across.start) + 1) + '〜' + Math.ceil(across.end) + '列を表示中。');
    }

    function close() {
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
    }

    function toggleMinimap() {
        if (!panel.hidden) {
            close();
            return;
        }
        panel.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        paint();
        updateViewport();
    }

    canvas.onclick = event => {
        const { left, top, width, height } = canvas.getBoundingClientRect();
        if (!width || !height) return;
        const row = (event.clientY - top) * rows / height;
        const column = (event.clientX - left) * columns / width;
        boardView.centerOnCell(row, column);
        updateViewport();
    };

    panel.onkeydown = event => {
        const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!direction || event.altKey || event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        viewport.scrollLeft += direction[0] * viewport.clientWidth / 2;
        viewport.scrollTop += direction[1] * viewport.clientHeight / 2;
        updateViewport();
    };

    close();
    toggle.onclick = toggleMinimap;
    panel.parentElement.onkeydown = event => {
        if (event.key !== 'Escape' || event.defaultPrevented || panel.hidden) return;
        close();
        toggle.focus({ preventScroll: true });
        event.preventDefault();
    };
    return { repaint, updateViewport, close };
}
