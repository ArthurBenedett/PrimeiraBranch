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

// Anel de progresso em SVG. `valor` e `meta` na mesma unidade.
export function anel(valor, meta, { cor = "var(--acento)", tamanho = 140, rotulo = "", sub = "" } = {}) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const pct = meta > 0 ? Math.min(1, valor / meta) : 0;
  return `<svg class="anel" viewBox="0 0 140 140" width="${tamanho}" height="${tamanho}" role="img" aria-label="${esc(rotulo)} ${esc(sub)}">
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--linha)" stroke-width="12"/>
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="${cor}" stroke-width="12" stroke-linecap="round"
      stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct)}" transform="rotate(-90 70 70)"/>
    <text x="70" y="68" text-anchor="middle" class="anel-valor">${esc(rotulo)}</text>
    <text x="70" y="88" text-anchor="middle" class="anel-sub">${esc(sub)}</text>
  </svg>`;
}
