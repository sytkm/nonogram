/** キャンバスの表示寸法と描画だけを更新する。 */
function drawPuzzlePreview(canvas, { matrix, palette, blank }) {
    canvas.width = matrix[0].length;
    canvas.height = matrix.length;
    canvas.style.width = Math.min(240, canvas.width * 8, 240 * canvas.width / canvas.height) + 'px';
    const context = canvas.getContext('2d');
    const styles = palette.map(rgb => 'rgb(' + rgb.join(',') + ')');
    matrix.forEach((row, y) => row.forEach((value, x) => {
        context.fillStyle = value === blank ? '#fff' : styles[value];
        context.fillRect(x, y, 1, 1);
    }));
}

// 画像選択から作成プレビュー、共有、プレイ開始までをつなぐ。
function setupImagePicker() {
    const input = document.getElementById('file');
    document.getElementById('open-image').onclick = () => input.click();
    document.getElementById('change-preview-image').onclick = () => input.click();
    const status = document.getElementById('image-status');
    const preview = document.getElementById('image-preview');
    const resetPreviewTabs = setupTabs(preview);
    const canvas = document.getElementById('preview-canvas');
    const side = document.getElementById('puzzle-side');
    const sideRange = document.getElementById('puzzle-side-range');
    const resetSize = document.getElementById('reset-puzzle-side');
    const mode = document.getElementById('puzzle-mode');
    const threshold = document.getElementById('threshold');
    const colorCount = document.getElementById('paint-color-count');
    const colorPanel = document.getElementById('paint-color-count-panel');
    const colorLimit = document.getElementById('paint-color-limit');
    const colorResult = document.getElementById('paint-color-result');
    colorCount.max = String(MAX_CONVERSION_COLORS);
    const playPreview = document.getElementById('play-preview');
    const splitPreview = document.getElementById('split-preview');
    const playOptions = document.getElementById('preview-play-options');
    const splitHelp = document.getElementById('preview-split-help');
    let currentImage;
    const previewQuality = document.getElementById('preview-quality');
    const previewLogic = document.getElementById('preview-logic');
    let previewLogicResult;
    function readPreviewClues() {
        const { matrix, blank } = currentImage.puzzle;
        const { rows: [rows], columns: [columns] } = makePuzzleClues(matrix, blank);
        return { rows, columns, blank };
    }
    const resetPreviewQuality = setupQualityCheck(previewQuality,
        document.getElementById('preview-quality-result'), readPreviewClues);
    const resetPreviewLogic = setupQualityCheck(previewLogic,
        document.getElementById('preview-logic-result'),
        () => ({ ...readPreviewClues(), check: 'logic', answer: currentImage.puzzle.matrix }),
        result => {
            previewLogicResult = result?.preparation ? result : undefined;
            const fixed = result?.preparation?.fixedSlashes.length;
            return lineSolvabilityMessage(result) + (fixed ? ' 最初からある青い斜線を含めて調べました。' : '');
        }, '行・列の推理で解けるか調べています…');

    function resetPreviewChecks() {
        resetPreviewQuality();
        resetPreviewLogic();
        previewQuality.disabled = playPreview.disabled;
        previewLogic.disabled = playPreview.disabled;
        previewLogicResult = undefined;
    }

    function usesIndexedColors() {
        return mode.value === 'color' && Boolean(currentImage.originalPuzzle);
    }

    function originalShareSource() {
        return currentImage.puzzle === currentImage.originalPuzzle ? currentImage.shareSource : undefined;
    }

    function updatePreview() {
        const useColor = mode.value === 'color';
        const indexed = usesIndexedColors();
        resetPreviewChecks();
        let puzzle;
        if (indexed) {
            puzzle = resizeIndexedPuzzle(currentImage.originalPuzzle, side.valueAsNumber);
        } else if (useColor) {
            currentImage.colorPuzzle ??= makeColorPuzzle(currentImage.imageData, colorCount.valueAsNumber);
            puzzle = currentImage.colorPuzzle;
        } else {
            puzzle = {
                matrix: makeMonochromeMatrix(currentImage.imageData, Number(threshold.value)),
                palette: [[255, 255, 255], [0, 0, 0]],
                blank: 0,
            };
        }
        currentImage.puzzle = puzzle;
        const { matrix } = puzzle;
        const { naturalWidth, naturalHeight } = currentImage.image;
        document.getElementById('preview-size').textContent =
            '元画像 ' + naturalWidth + ' × ' + naturalHeight +
            ' ／ 盤面 ' + matrix[0].length + ' × ' + matrix.length + ' マス';
        document.getElementById('preview-original-color').hidden = !indexed;
        sideRange.hidden = indexed;
        resetSize.hidden = !indexed;
        resetSize.disabled = puzzle === currentImage.originalPuzzle;
        const tileCount = mosaicTileCount(matrix);
        const withinLimit = tileCount <= MAX_MOSAIC_TILES;
        splitPreview.disabled = playPreview.disabled || !withinLimit;
        const preferSplit = withinLimit && tileCount > 1;
        const primary = preferSplit ? splitPreview : playPreview;
        splitPreview.className = preferSplit ? 'action-link action-primary' : 'action-link';
        playPreview.className = preferSplit ? 'action-link' : 'action-link action-primary';
        if (playOptions.firstElementChild !== primary) playOptions.prepend(primary);
        if (!withinLimit) {
            splitHelp.textContent = 'この画像は' + tileCount + '区画になります。分割は' + MAX_MOSAIC_TILES +
                '区画までです。「色とマス数」でマス数を減らしてください。';
        } else {
            splitHelp.textContent = tileCount === 1
                ? '10×10に収まる画像は、分けて遊ぶと1区画になります。'
                : '10×10の小さな区画を解いて、1枚の絵を完成させます。';
        }
        if (!playPreview.disabled) {
            updatePuzzleSharing(puzzle, originalShareSource());
        }
        document.getElementById('threshold-panel').hidden = useColor;
        colorPanel.hidden = !useColor || indexed;
        if (!colorPanel.hidden) {
            const usedColors = new Set();
            for (const row of matrix) {
                for (const color of row) usedColors.add(color);
            }
            usedColors.delete(puzzle.blank);
            colorLimit.value = colorCount.value + '色';
            colorResult.textContent = '変換結果：塗る色' + usedColors.size + '色 ＋ 背景色1色。';
        }
        document.getElementById('threshold-value').value = threshold.value;
        drawPuzzlePreview(canvas, puzzle);

        const first = matrix[0][0];
        const uniform = matrix.every(row => row.every(value => value === first));
        let message = '';
        if (uniform) {
            message = useColor
                ? '盤面が一色になっています。別の画像やマス数をお試しください。'
                : '白か黒の一色になっています。境目を調整するか、明暗の差がある画像をお試しください。';
        }
        document.getElementById('preview-message').textContent = message;
    }

    function resetThreshold() {
        threshold.value = String(currentImage.suggestedThreshold);
        updatePreview();
    }

    function updateSize() {
        playPreview.disabled = false;
        sideRange.value = side.value;
        if (usesIndexedColors()) {
            updatePreview();
            return;
        }
        const image = currentImage.image;
        const imageData = rasterizePuzzleImage(image, side.valueAsNumber);
        currentImage.imageData = imageData;
        currentImage.colorPuzzle = undefined;
        currentImage.suggestedThreshold = suggestMonochromeThreshold(imageData);
        resetThreshold();
    }

    function updateSizeLimit(reset) {
        const { naturalWidth, naturalHeight } = currentImage.image;
        const originalSide = Math.max(naturalWidth, naturalHeight);
        const indexed = usesIndexedColors();
        const limit = indexed ? originalSide : Math.min(originalSide, MAX_PUZZLE_SIDE);
        side.max = String(limit);
        sideRange.max = side.max;
        if (reset || !side.validity.valid || !side.value) {
            side.value = String(!indexed && originalSide > MAX_PUZZLE_SIDE ? SUGGESTED_PHOTO_SIDE : originalSide);
        }
    }

    function openPreview() {
        const image = currentImage.image;
        const originalSide = Math.max(image.naturalWidth, image.naturalHeight);
        const hasColorMode = Boolean(currentImage.originalPuzzle) || currentImage.canMakeConvertedColor;
        document.getElementById('puzzle-mode-panel').hidden = !hasColorMode;
        mode.value = hasColorMode ? 'color' : 'monochrome';
        colorCount.value = colorCount.max;
        updateSizeLimit(true);
        updateSize();
        status.textContent = !usesIndexedColors() && originalSide > MAX_PUZZLE_SIDE
            ? '大きな画像なので、最長辺' + SUGGESTED_PHOTO_SIDE + 'マスを提案します。' +
              MAX_PUZZLE_SIDE + 'マスまで変更できます。'
            : '';
        resetPreviewTabs();
        preview.hidden = false;
        leavePuzzleScreen();
        document.getElementById('preview-heading').focus();
    }

    input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        document.getElementById('shared-link-status').textContent = '';
        const selection = {};
        currentImage = selection;
        updatePuzzleSharing();
        resetPreviewChecks();
        preview.hidden = true;
        status.textContent = '画像を読み込んでいます…';
        try {
            const decoded = await readPuzzleImage(file);
            if (currentImage !== selection) return;
            selection.image = decoded.image;
            selection.canMakeConvertedColor = decoded.canMakeConvertedColor;
            let fallbackMessage;
            if (decoded.canPlayLegacyColor) {
                try {
                    const src = await readBase64(file);
                    if (currentImage !== selection) return;
                    selection.originalPuzzle = decodeLegacyPng(src);
                    selection.shareSource = src;
                } catch {
                    if (currentImage !== selection) return;
                    fallbackMessage = 'このPNGはカラー問題にできません。白黒のプレビューを表示しました。';
                }
            }
            openPreview();
            if (fallbackMessage) status.textContent = fallbackMessage;
        } catch (error) {
            if (currentImage !== selection) return;
            currentImage = undefined;
            input.value = '';
            status.textContent = error.message;
        }
    });

    side.addEventListener('input', () => {
        playPreview.disabled = !side.validity.valid || !side.value;
        splitPreview.disabled = playPreview.disabled;
        if (playPreview.disabled) {
            resetSize.disabled = false;
            resetPreviewChecks();
            updatePuzzleSharing();
        } else {
            updateSize();
        }
    });
    sideRange.addEventListener('input', () => {
        side.value = sideRange.value;
        updateSize();
    });
    mode.addEventListener('change', () => {
        if (currentImage.originalPuzzle) {
            status.textContent = '';
            updateSizeLimit(false);
            updateSize();
        } else updatePreview();
    });
    resetSize.addEventListener('click', () => {
        side.value = side.max;
        updateSize();
        side.focus();
    });
    threshold.addEventListener('input', () => {
        if (!playPreview.disabled) updatePreview();
    });
    colorCount.addEventListener('input', () => {
        currentImage.colorPuzzle = undefined;
        colorLimit.value = colorCount.value + '色';
        if (!playPreview.disabled) updatePreview();
    });
    document.getElementById('reset-threshold').addEventListener('click', () => {
        if (!playPreview.disabled) resetThreshold();
    });
    playPreview.addEventListener('click', () => {
        const initialCheck = previewLogicResult;
        resetPreviewChecks();
        const generated = !usesIndexedColors();
        const shareSource = originalShareSource();
        startPuzzle(currentImage.puzzle, { generated, initialCheck, shareSource, fitOnStart: true });
    });
    splitPreview.addEventListener('click', () => {
        resetPreviewChecks();
        openMosaic(currentImage.puzzle);
    });
}
