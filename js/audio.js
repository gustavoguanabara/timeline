/**
 * js/audio.js
 * Síntese Sonora Procedural Retrô via Web Audio API (Zero arquivos de áudio externos)
 */

const AUDIO_STORAGE_KEY = 'historia_audio_muted';
let audioCtx = null;
let isMuted = typeof localStorage !== 'undefined' && localStorage ? localStorage.getItem(AUDIO_STORAGE_KEY) === 'true' : false;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Configurar a sessão de áudio para categoria 'playback' (iOS Safari 16.4+)
// Isso instrui o sistema a tratar o áudio como mídia ativa, reproduzindo som mesmo no modo silencioso/vibrar
if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
  try {
    navigator.audioSession.type = 'playback';
  } catch (_) {}
}

let audioUnlocked = false;

/**
 * Eleva a sessão de áudio da página para o canal de mídia ativa (playback),
 * contornando a chave física de mudo/vibrar do iPhone e desbloqueando o AudioContext.
 */
export function unlockAudioForSilentMode() {
  if (audioUnlocked) return;
  audioUnlocked = true;

  if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
    try {
      navigator.audioSession.type = 'playback';
    } catch (_) {}
  }

  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
  }

  // Fallback para iOS: reproduz micro-áudio mudo via HTML5 para forçar a sessão de playback
  try {
    const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
    silentAudio.volume = 0.01;
    silentAudio.play().catch(() => {});
  } catch (_) {}
}

// Auto-desbloqueio no primeiro gesto de interação do usuário
if (typeof window !== 'undefined') {
  const unlockEvents = ['touchstart', 'pointerdown', 'click'];
  const unlockHandler = () => {
    unlockAudioForSilentMode();
  };
  unlockEvents.forEach(evt => {
    window.addEventListener(evt, unlockHandler, { capture: true, once: true, passive: true });
  });
}

export function isAudioMuted() {
  return isMuted;
}

export function toggleAudioMute() {
  isMuted = !isMuted;
  if (typeof localStorage !== 'undefined' && localStorage) {
    localStorage.setItem(AUDIO_STORAGE_KEY, String(isMuted));
  }
  return isMuted;
}

/**
 * Som curto de seleção/arraste de card (onda senoidal curta)
 */
export function playCardPick() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.05);

  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + 0.05);
}

let hapticSwitchLabel = null;

function getHapticSwitchLabel() {
  if (typeof document === 'undefined') return null;
  if (!hapticSwitchLabel) {
    let label = document.getElementById('hapticLabel');
    let input = document.getElementById('hapticSwitch');
    if (!input && document.body) {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.id = 'hapticSwitch';
      input.setAttribute('switch', '');
      input.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:-100px;left:-100px;';
      input.setAttribute('aria-hidden', 'true');
      input.tabIndex = -1;
      document.body.appendChild(input);
    }
    if (!label && document.body) {
      label = document.createElement('label');
      label.htmlFor = 'hapticSwitch';
      label.id = 'hapticLabel';
      label.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:-100px;left:-100px;';
      label.setAttribute('aria-hidden', 'true');
      label.tabIndex = -1;
      document.body.appendChild(label);
    }
    hapticSwitchLabel = label;
  }
  return hapticSwitchLabel;
}

/**
 * Disparo universal de vibração háptica no aparelho:
 * 1. iOS Safari (17.4+): Aciona o Taptic Engine do iPhone via Native Switch Workaround
 * 2. Android / Chrome / Firefox: Dispara a Web Vibration API com calibração física sólida
 */
export function triggerHaptic(pattern = 40) {
  // 1. Taptic Engine no iOS Safari via Switch Hack
  try {
    const label = getHapticSwitchLabel();
    if (label) {
      label.click();
    }
  } catch (_) {}

  // 2. Web Vibration API no Android (independente de áudio mudo)
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      let safePattern = pattern;
      if (typeof pattern === 'number' && pattern < 35) {
        safePattern = 35; // Calibração mínima para motores Android não filtrarem o pulso
      }
      navigator.vibrate(safePattern);
    } catch (_) {}
  }
}

/**
 * Arpejo ascendente de vitória (tríade maior 523Hz -> 659Hz -> 783Hz)
 */
export function playSuccess() {
  triggerHaptic([25, 40, 25]);
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const notes = [523.25, 659.25, 783.99, 1046.50];
  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startTime = ctx.currentTime + idx * 0.08;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.2, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + 0.15);
  });
}

/**
 * Som descendente de erro pedagógico (onda dente de serra 220Hz -> 110Hz)
 */
export function playError() {
  triggerHaptic(45);
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.25);

  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + 0.25);
}

/**
 * Jingle comemorativo de entrada no Top 10 Arcade
 */
export function playFanfare() {
  triggerHaptic([40, 60, 40, 80]);
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const notes = [440, 554.37, 659.25, 880];
  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startTime = ctx.currentTime + idx * 0.1;

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.12, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + 0.3);
  });
}

/**
 * Jingle retrô de encerramento de partida quando o jogador não atinge o Top 10
 * Sequência cadencial descendente suave estilo arcade (Sol4 -> Fá4 -> Mib4 -> Dó4)
 */
export function playGameOver() {
  triggerHaptic([35, 60, 35]);
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Notas: Sol4 (392Hz), Fá4 (349.23Hz), Mib4 (311.13Hz), Dó4 (261.63Hz)
  const notes = [
    { freq: 392.00, dur: 0.13, type: 'triangle', gain: 0.18 },
    { freq: 349.23, dur: 0.13, type: 'triangle', gain: 0.18 },
    { freq: 311.13, dur: 0.15, type: 'triangle', gain: 0.18 },
    { freq: 261.63, dur: 0.45, type: 'triangle', gain: 0.22 }
  ];

  let currentTime = ctx.currentTime;
  notes.forEach((note) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = note.type;
    osc.frequency.setValueAtTime(note.freq, currentTime);

    gain.gain.setValueAtTime(note.gain, currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, currentTime + note.dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(currentTime);
    osc.stop(currentTime + note.dur);

    currentTime += (note.dur * 0.85); // Suave legato entre notas
  });
}

