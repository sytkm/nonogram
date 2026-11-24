// 画面上の位置を、元画像上のピクセルの境界に変換する。
function imageCropPoint(clientX, clientY, bounds, image) {
    const coordinate = (position, start, span, pixels) =>
        Math.max(0, Math.min(pixels, Math.round((position - start) / span * pixels)));
    return {
        x: coordinate(clientX, bounds.left, bounds.width, image.width),
        y: coordinate(clientY, bounds.top, bounds.height, image.height),
    };
}

function setupImageCrop() {
    const dialog = document.getElementById('image-crop-dialog');
    const stage = document.getElementById('image-crop-stage');
    const canvas = document.getElementById('image-crop-canvas');
    const selection = document.getElementById('image-crop-selection');
    const form = document.getElementById('image-crop-form');
    const submit = document.getElementById('image-crop-apply');
    const status = document.getElementById('image-crop-status');
    const names = ['x', 'y', 'width', 'height'];
    const fields = Object.fromEntries(names.map(name => [name, form.elements.namedItem(name)]));
    let full;
    let draft;
    let session;
    let drag;

    function setDraft(region) {
        draft = region;
        for (const name of names) fields[name].value = String(region[name]);
        selection.style.left = region.x / full.width * 100 + '%';
        selection.style.top = region.y / full.height * 100 + '%';
        selection.style.width = region.width / full.width * 100 + '%';
        selection.style.height = region.height / full.height * 100 + '%';
    }

    function readFields() {
        if (!names.every(name => fields[name].validity.valid)) return false;
        const { x, y, width, height } = Object.fromEntries(names.map(name => [name, fields[name].valueAsNumber]));
        setDraft({ x, y, width: Math.min(full.width - x, width), height: Math.min(full.height - y, height) });
        return true;
    }

    function point(event) {
        return imageCropPoint(event.clientX, event.clientY, stage.getBoundingClientRect(), full);
    }

    function dragTo(event) {
        const end = point(event);
        const { start } = drag;
        if (!drag.moved && start.x === end.x && start.y === end.y) return;
        drag.moved = true;
        setDraft({
            x: Math.min(start.x, end.x, full.width - 1),
            y: Math.min(start.y, end.y, full.height - 1),
            width: Math.max(1, Math.abs(start.x - end.x)),
            height: Math.max(1, Math.abs(start.y - end.y)),
        });
    }

    stage.addEventListener('pointerdown', event => {
        if (submit.disabled || drag || !event.isPrimary || event.button !== 0) return;
        drag = { id: event.pointerId, start: point(event), previous: draft };
        stage.setPointerCapture(event.pointerId);
    });
    stage.addEventListener('pointermove', event => {
        if (drag?.id === event.pointerId) dragTo(event);
    });
    stage.addEventListener('pointerup', event => {
        if (drag?.id !== event.pointerId) return;
        dragTo(event);
        drag = undefined;
    });
    stage.addEventListener('lostpointercapture', event => {
        if (drag?.id !== event.pointerId) return;
        setDraft(drag.previous);
        drag = undefined;
    });

    dialog.addEventListener('close', () => {
        if (!dialog.open) {
            session = undefined;
            drag = undefined;
        }
    });
    form.addEventListener('change', readFields);
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (submit.disabled || !readFields()) return;
        const activeSession = session;
        const { image, initial, apply } = activeSession;
        if (names.every(name => draft[name] === initial[name])) {
            dialog.close();
            return;
        }
        const region = draft.width === full.width && draft.height === full.height ? undefined : draft;
        submit.disabled = true;
        status.textContent = '';
        let bitmap;
        try {
            // 縮小時に選択範囲の外の画素が混ざらないよう、先に実寸で切り抜く。
            if (region) bitmap = await createImageBitmap(image, region.x, region.y, region.width, region.height);
        } catch {
            if (session === activeSession && dialog.open) {
                status.textContent = '切り抜けませんでした。範囲を指定し直してください。';
                submit.disabled = false;
            }
            return;
        }
        if (session !== activeSession || !dialog.open) {
            bitmap?.close();
            return;
        }
        dialog.close();
        apply(region, bitmap);
    });
    document.getElementById('image-crop-reset').addEventListener('click', () => setDraft(full));
    document.getElementById('image-crop-cancel').addEventListener('click', () => dialog.close());

    return (image, region, apply) => {
        full = fullImageRegion(image);
        const initial = region ?? full;
        session = { image, initial, apply };
        submit.disabled = false;
        status.textContent = '';
        drag = undefined;
        fields.x.max = full.width - 1;
        fields.y.max = full.height - 1;
        fields.width.max = full.width;
        fields.height.max = full.height;
        const size = fitPuzzleSize(full.width, full.height, 640);
        canvas.width = size.width;
        canvas.height = size.height;
        canvas.getContext('2d').drawImage(image, 0, 0, size.width, size.height);
        stage.style.aspectRatio = full.width + ' / ' + full.height;
        stage.style.width = 'min(100%, ' + full.width + 'px, ' + 42 * full.width / full.height + 'dvh)';
        setDraft(initial);
        dialog.showModal();
    };
}
