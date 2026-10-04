export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

// Escapa texto vindo do usuário ou da IA antes de entrar em innerHTML.
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const num = (v, padrao = 0) => {
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : padrao;
};

let timerToast;
export function avisar(texto) {
  const el = $("#toast");
  el.textContent = texto;
  el.classList.add("on");
  clearTimeout(timerToast);
  timerToast = setTimeout(() => el.classList.remove("on"), 2600);
}

export const fmt = (n, casas = 0) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: casas });

// Ícones desenhados (traço de 2 px, pontas redondas). Um só estilo no app inteiro.
const ICONES = {
  hoje: '<path d="M4 20V11M10 20V4M16 20v-7M22 20H2"/>',
  esteira: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5M12 2.5v3.5"/>',
  comida: '<path d="M6 3v7a2.5 2.5 0 0 0 5 0V3M8.5 3v18M17.5 21V3c-2.7 1.4-3.5 4.6-3.5 8.5h3.5"/>',
  treino: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  perfil: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.5"/><circle cx="8" cy="17" r="2.5"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  pausa: '<path d="M8 5v14M16 5v14"/>',
  pular: '<path d="M5 5v14l9-7zM18 5v14"/>',
  parar: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  camera: '<path d="M3 8.5A1.5 1.5 0 0 1 4.5 7H7l1.5-2.5h7L17 7h2.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.5"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  menos: '<path d="M5 12h14"/>',
  lixo: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
  buscar: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  baixar: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>',
  subir: '<path d="M12 20V9M7.5 13.5L12 9l4.5 4.5M5 4h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  mais_info: '<path d="M6 9l6 6 6-6"/>',
};
export function icone(nome, classe = "") {
  return `<svg class="ic ${classe}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONES[nome] ?? ""}</svg>`;
}

// Régua segmentada (10 divisões). `partes`: [{valor, classe?}] somadas em sequência, na escala de `meta`.
export function regua(partes, meta, { classe = "", rotulo = "" } = {}) {
  let acumulado = 0;
  const barras = partes
    .map((p) => {
      acumulado += p.valor;
      const pct = meta > 0 ? Math.min(100, (acumulado / meta) * 100) : 0;
      return `<i class="${p.classe ?? ""}" style="width:${pct.toFixed(1)}%"></i>`;
    })
    .reverse() // a maior (acumulada) fica atrás e a menor por cima
    .join("");
  const total = partes.reduce((s, p) => s + p.valor, 0);
  const estourou = meta > 0 && total > meta ? "estourou" : "";
  return `<div class="regua ${classe} ${estourou}" role="img" aria-label="${esc(rotulo)}">${barras}</div>`;
}
