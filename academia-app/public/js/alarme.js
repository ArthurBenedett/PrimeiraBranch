// Alarmes: bipes (Web Audio), vibração e voz. Precisa ser "destravado" por um toque do usuário.
import { db } from "./storage.js";

let ctx = null;
let wakeLock = null;

export function destravarAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  } catch {
    ctx = null;
  }
}

function bipe(freq, duracao, quando = 0, volume = 0.35, tipo = "square") {
  if (!ctx || !db.perfil.som) return;
  const t0 = ctx.currentTime + quando;
  const osc = ctx.createOscillator();
  const ganho = ctx.createGain();
  osc.type = tipo;
  osc.frequency.value = freq;
  ganho.gain.setValueAtTime(0.0001, t0);
  ganho.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
  ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + duracao);
  osc.connect(ganho).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duracao + 0.02);
}

function vibrar(padrao) {
  try {
    navigator.vibrate?.(padrao);
  } catch {
    /* sem suporte */
  }
}

export function falar(texto) {
  if (!db.perfil.voz || !("speechSynthesis" in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "pt-BR";
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch {
    /* sem voz disponível */
  }
}

// Contagem regressiva (3, 2, 1): bipe curto.
export function alarmeContagem() {
  bipe(880, 0.12);
  vibrar(40);
}

// Troca para ritmo FORTE: três bipes subindo. Troca para leve: dois descendo.
export function alarmeTroca(tipo) {
  if (tipo === "forte") {
    bipe(700, 0.15);
    bipe(900, 0.15, 0.2);
    bipe(1200, 0.35, 0.4);
    vibrar([200, 80, 200, 80, 400]);
  } else {
    bipe(900, 0.2);
    bipe(600, 0.4, 0.28);
    vibrar([300, 100, 300]);
  }
}

export function alarmeFim() {
  [0, 0.25, 0.5, 0.9].forEach((q, i) => bipe(i === 3 ? 1500 : 1100, i === 3 ? 0.6 : 0.18, q, 0.4));
  vibrar([300, 100, 300, 100, 600]);
}

// Mantém a tela ligada durante o treino (precisa de HTTPS ou localhost).
export async function manterTelaLigada(ligar) {
  try {
    if (ligar) {
      wakeLock = (await navigator.wakeLock?.request("screen")) ?? null;
    } else {
      await wakeLock?.release();
      wakeLock = null;
    }
  } catch {
    wakeLock = null;
  }
}

// O navegador solta o wake lock quando a aba some; pede de novo ao voltar.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && wakeLock === null && document.body.dataset.telaLigada === "1") {
    manterTelaLigada(true);
  }
});
