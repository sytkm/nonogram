// 手で入力したマスだけに、色や数字を覆わない短い反応を添える。
function createBoardFeedback({ marker, leftClueCount, topClueCount, cellSize, enabled }) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animation;
    let lastShown = -Infinity;

    function clear() {
        animation?.cancel();
        animation = undefined;
        marker.hidden = true;
        lastShown = -Infinity;
    }
    clear();

    function show(row, column) {
        const size = cellSize();
        if (!enabled() || reducedMotion.matches || size < 8 || !marker.animate) {
            clear();
            return;
        }
        const now = performance.now();
        // 連続入力で演出を重ねず、細かなポインターイベントも間引く。
        if (now - lastShown < 100) return;
        clear();
        lastShown = now;
        Object.assign(marker.style, {
            left: ((leftClueCount + column) * size) + 'px',
            top: ((topClueCount + row) * size) + 'px',
            width: size + 'px', height: size + 'px',
        });
        marker.hidden = false;
        const current = marker.animate([{ opacity: 0.9 }, { opacity: 0 }], {
            duration: 180, easing: 'ease-out',
        });
        animation = current;
        current.onfinish = () => {
            if (animation !== current) return;
            animation = undefined;
            marker.hidden = true;
        };
    }
    return { show, clear };
}
