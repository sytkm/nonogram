// パレット表示・横送りと、表示中の問題で選択した色。

let updatePaletteNavigation;

// パレットを通常のボタンで表示し、指でもキーボードでも色を選べるようにする。
function setupPaletteNavigation() {
    const strip = document.getElementById('palette-strip');
    const palette = document.getElementById('color-palette');
    const previous = document.getElementById('palette-prev');
    const next = document.getElementById('palette-next');
    const note = document.getElementById('palette-scroll-note');

    function update() {
        const vertical = getComputedStyle(palette).display === 'grid';
        const scrollable = !vertical && palette.scrollWidth > strip.clientWidth + 1;
        strip.toggleAttribute('data-scrollable', scrollable);
        previous.hidden = next.hidden = !scrollable;
        previous.setAttribute('aria-disabled', String(palette.scrollLeft <= 1));
        next.setAttribute('aria-disabled',
            String(palette.scrollLeft + palette.clientWidth >= palette.scrollWidth - 1));
        note.hidden = !vertical || palette.scrollHeight <= palette.clientHeight + 1;
    }

    for (const [button, direction] of [[previous, -1], [next, 1]]) {
        button.onclick = () => {
            if (button.getAttribute('aria-disabled') === 'true') return;
            const distance = Math.max(50, palette.clientWidth - 50);
            palette.scrollBy({ left: direction * distance });
        };
    }
    palette.addEventListener('scroll', update);
    const observer = new ResizeObserver(update);
    observer.observe(strip);
    observer.observe(palette);
    updatePaletteNavigation = update;
}

function drawUnderPalette(palette, usedColors, blank, initialColor, { numbered = false } = {}) {
    let selectedColor = initialColor;
    let onSelect = () => {};
    const container = document.getElementById('color-palette');
    container.replaceChildren();
    const buttons = new Map([
        [blank, document.getElementById('palette-blank')],
        [-1, document.getElementById('palette-slash')],
    ]);

    function selectColor(color) {
        const button = buttons.get(color);
        if (!button || button.disabled) return;
        buttons.get(selectedColor)?.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-pressed', 'true');
        selectedColor = color;
        onSelect();
        if (container.contains(button)) {
            // Move only the palette to reveal a color selected with a clue or the eyedropper.
            const viewport = container.getBoundingClientRect();
            const tile = button.getBoundingClientRect();
            const left = tile.left < viewport.left ? tile.left - viewport.left - 4
                : tile.right > viewport.left + container.clientWidth
                    ? tile.right - viewport.left - container.clientWidth + 4 : 0;
            const top = tile.top < viewport.top ? tile.top - viewport.top - 4
                : tile.bottom > viewport.top + container.clientHeight
                    ? tile.bottom - viewport.top - container.clientHeight + 4 : 0;
            if (left || top) container.scrollBy({ left, top });
        }
        return button;
    }

    for (const color of usedColors) {
        if (color === blank) continue;
        const button = document.createElement('button');
        const swatch = document.createElement('span');
        const symbol = document.createElement('span');
        const hexColor = '#' + palette[color].map(channel => channel.toString(16).padStart(2, '0')).join('');
        const colorSymbol = numbered ? String(color) : paletteSymbol(color, blank);
        const label = '色 ' + colorSymbol + ' ' + hexColor;

        button.type = 'button';
        button.className = 'palette-color';
        button.title = label;
        button.setAttribute('aria-label', label);
        symbol.className = 'palette-symbol';
        symbol.textContent = colorSymbol;
        swatch.className = 'palette-swatch';
        swatch.style.backgroundColor = hexColor;
        swatch.style.color = chooseTextColor(...palette[color]);
        swatch.append(symbol);
        button.append(swatch);
        buttons.set(color, button);
        container.append(button);
    }

    for (const [color, button] of buttons) {
        button.setAttribute('aria-pressed', String(selectedColor === color));
        button.onclick = () => selectColor(color);
    }
    container.scrollLeft = 0;
    container.scrollTop = 0;
    updatePaletteNavigation();
    return {
        updateRemaining(remaining) {
            for (const [color, button] of buttons) {
                if (color === blank || color < 0) continue;
                button.disabled = remaining[color] === 0;
                button.classList.toggle('is-complete', button.disabled);
                button.setAttribute('aria-label', button.title + (button.disabled ? ' 完了' : ' 残り' + remaining[color] + 'マス'));
            }
        },
        selectColor, getSelectedColor: () => selectedColor,
        onSelect(callback) { onSelect = callback; },
        showSelection(show) {
            for (const [color, button] of buttons) {
                button.setAttribute('aria-pressed', String(show && color === selectedColor));
            }
        },
    };
}

/**
 * 背景色から文字色を決める関数
 * https://katashin.info/2018/12/18/247
 * @param  {Number} red 
 * @param  {Number} green
 * @param  {Number} blue
 * @return {String} 'white'か'blackを返す
 */
function chooseTextColor(red, green, blue) {
    // sRGB を RGB に変換し、背景色の相対輝度を求める
    const toRgbItem = item => {
        const i = item / 255
        return i <= 0.03928 ? i / 12.92 : Math.pow((i + 0.055) / 1.055, 2.4)
    }
    const R = toRgbItem(red)
    const G = toRgbItem(green)
    const B = toRgbItem(blue)
    const Lbg = 0.2126 * R + 0.7152 * G + 0.0722 * B

    // 白と黒の相対輝度。定義からそれぞれ 1 と 0 になる。
    const Lw = 1
    const Lb = 0

    // 白と背景色のコントラスト比、黒と背景色のコントラスト比を
    // それぞれ求める。
    const Cw = (Lw + 0.05) / (Lbg + 0.05)
    const Cb = (Lbg + 0.05) / (Lb + 0.05)

    // コントラスト比が大きい方を文字色として返す。
    return Cw < Cb ? 'black' : 'white'
}
