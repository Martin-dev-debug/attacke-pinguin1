/* Attacke Pinguin – einfache Soundeffekte */
let gameAudioContext = null;
function playSound(kind = "throw") {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!gameAudioContext) gameAudioContext = new AudioCtx();
    if (gameAudioContext.state === "suspended") gameAudioContext.resume();
    const now = gameAudioContext.currentTime;
    const osc = gameAudioContext.createOscillator();
    const gain = gameAudioContext.createGain();
    const settings = kind === "upgrade"
      ? { frequency: 720, endFrequency: 1040, duration: 0.16, volume: 0.045 }
      : { frequency: 310, endFrequency: 180, duration: 0.075, volume: 0.025 };
    osc.type = kind === "upgrade" ? "sine" : "triangle";
    osc.frequency.setValueAtTime(settings.frequency, now);
    osc.frequency.exponentialRampToValueAtTime(settings.endFrequency, now + settings.duration);
    gain.gain.setValueAtTime(settings.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + settings.duration);
    osc.connect(gain); gain.connect(gameAudioContext.destination);
    osc.start(now); osc.stop(now + settings.duration);
  } catch (_) {}
}
