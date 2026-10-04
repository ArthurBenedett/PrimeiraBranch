import { $, $$ } from "./util.js";
import { renderHoje } from "./hoje.js";
import { renderEsteira } from "./esteira.js";
import { renderComida } from "./comida.js";
import { renderTreino } from "./treino.js";
import { renderPerfil } from "./perfil.js";

const telas = { hoje: renderHoje, esteira: renderEsteira, comida: renderComida, treino: renderTreino, perfil: renderPerfil };

function abrir(nome) {
  if (!telas[nome]) nome = "hoje";
  $$(".view").forEach((v) => v.classList.toggle("ativa", v.id === `view-${nome}`));
  $$("#tabs button").forEach((b) => {
    const ativa = b.dataset.view === nome;
    b.classList.toggle("ativa", ativa);
    b.setAttribute("aria-current", ativa ? "page" : "false");
  });
  telas[nome]();
  window.scrollTo(0, 0);
  try {
    if (location.hash !== `#${nome}`) history.replaceState(null, "", `#${nome}`);
  } catch {
    /* ambiente que bloqueia o histórico (iframe isolado) */
  }
}

$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-view]");
  if (b) abrir(b.dataset.view);
});

abrir(location.hash.slice(1) || "hoje");

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
