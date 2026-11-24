// Share one audio context and playback interval across boards and mosaic sections.
let paintAudio;
let lastPaintSound = -Infinity;
let lastPaintResume = -Infinity;

async function playBoardPaintSound(enabled, retryOnTouchEnd = false) {
    if (!enabled() || (retryOnTouchEnd && paintAudio?.state === 'running')) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;

    try {
        paintAudio ??= new Audio();
        if (paintAudio.state !== 'running') {
            const requested = performance.now();
            if (!retryOnTouchEnd && requested - lastPaintResume < 120) return;
            lastPaintResume = requested;
            await paintAudio.resume();
            if (performance.now() - requested > 180 || !enabled()) return;
        }
        if (paintAudio.state !== 'running') return;
        const now = paintAudio.currentTime;
        if (now - lastPaintSound < 0.12) return;
        lastPaintSound = now;

        const tone = paintAudio.createOscillator();
        const volume = paintAudio.createGain();
        tone.frequency.setValueAtTime(570, now);
        tone.frequency.exponentialRampToValueAtTime(340, now + 0.045);
        volume.gain.setValueAtTime(0, now);
        volume.gain.linearRampToValueAtTime(0.08, now + 0.006);
        volume.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        tone.connect(volume);
        volume.connect(paintAudio.destination);
        tone.onended = () => { tone.disconnect(); volume.disconnect(); };
        tone.start(now);
        tone.stop(now + 0.055);
    } catch {
        // Audio may be blocked or unavailable. Painting still works.
    }
}
