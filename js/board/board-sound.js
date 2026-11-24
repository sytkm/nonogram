// Share one audio context and playback interval across boards and mosaic sections.
let paintAudio;
let lastPaintSound = -Infinity;
let lastPaintResume = -Infinity;
const paintNoiseBuffers = new Map();

async function playBoardPaintSound(enabled, { sound = 'pop', retryOnTouchEnd = false } = {}) {
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

        if (sound === 'paper' || sound === 'slash') {
            playPaintNoise(paintAudio, sound, now);
        } else {
            playPaintTone(paintAudio, sound === 'wood', now);
        }
    } catch {
        // Audio may be blocked or unavailable. Painting still works.
    }
}

function playPaintTone(audio, wood, now) {
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    if (wood) tone.type = 'triangle';
    tone.frequency.setValueAtTime(wood ? 350 : 570, now);
    tone.frequency.exponentialRampToValueAtTime(wood ? 255 : 340, now + (wood ? 0.033 : 0.045));
    volume.gain.setValueAtTime(0, now);
    volume.gain.linearRampToValueAtTime(wood ? 0.09 : 0.08, now + (wood ? 0.003 : 0.006));
    volume.gain.exponentialRampToValueAtTime(0.001, now + (wood ? 0.04 : 0.05));
    tone.connect(volume);
    volume.connect(audio.destination);
    tone.onended = () => { tone.disconnect(); volume.disconnect(); };
    tone.start(now);
    tone.stop(now + (wood ? 0.045 : 0.055));
}

function playPaintNoise(audio, sound, now) {
    let buffer = paintNoiseBuffers.get(sound);
    if (!buffer) {
        const paper = sound === 'paper';
        const frames = Math.ceil(audio.sampleRate * (paper ? 0.035 : 0.075));
        buffer = audio.createBuffer(1, frames, audio.sampleRate);
        const samples = buffer.getChannelData(0);
        let fast = 0;
        let slow = 0;
        for (let i = 0; i < frames; i++) {
            const phase = i / (frames - 1);
            const noise = Math.random() * 2 - 1;
            // A bright snap for paper, a softer band and longer envelope for pencil.
            fast += (paper ? 0.75 : 0.33) * (noise - fast);
            slow += (paper ? 0.22 : 0.06) * (noise - slow);
            const fade = Math.sin(Math.PI * phase) * (paper ? (1 - phase) ** 5 : 1);
            samples[i] = (fast - slow) * fade * (paper ? 0.43 : 0.19);
        }
        paintNoiseBuffers.set(sound, buffer);
    }
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    source.onended = () => source.disconnect();
    source.start(now);
}
