// Treino: registro de séries, recordes (PR) e cronômetro de descanso com alarme.
import { db, salvar, novoId } from "./storage.js";
import { estimar1RM, melhor1RM, volume, chaveData, formatarTempo, ultimosDias } from "./logic.js";
import { $, $$, esc, num, avisar, fmt } from "./util.js";
import { destravarAudio, alarmeFim, alarmeContagem, falar } from "./alarme.js";

const EXERCICIOS = ["Supino reto", "Supino inclinado", "Agachamento", "Leg press", "Levantamento terra", "Desenvolvimento",
  "Remada curvada", "Puxada frontal", "Barra fixa", "Rosca direta", "Tríceps corda", "Elevação lateral", "Stiff", "Panturrilha em pé", "Abdominal"];

let descanso = null; // {fimEm, total}
let timerDescanso = null;
let ultimoBipe = null;
let ultimoExercicio = "";

const raiz = () => $("#view-treino");

export function renderTreino() {
  const hoje = db.series.filter((s) => s.data === chaveData());
  const grupos = new Map();
  for (const s of hoje) grupos.set(s.exercicio, [...(grupos.get(s.exercicio) ?? []), s]);
  const nomes = [...new Set([...EXERCICIOS, ...db.series.map((s) => s.exercicio)])];

  raiz().innerHTML = `
    <h1>Treino</h1>
    <p class="sub">Registre as séries, acompanhe recordes e controle o descanso.</p>

    <form class="card" id="form-serie" autocomplete="off">
      <h2>Nova série</h2>
      <label for="t-ex">Exercício</label>
      <input id="t-ex" list="lista-ex" required maxlength="60" value="${esc(ultimoExercicio)}" placeholder="Ex.: Supino reto">
      <datalist id="lista-ex">${nomes.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
      <div class="grade" style="margin-top:8px">
        <div><label for="t-carga">Carga (kg)</label><input id="t-carga" type="number" inputmode="decimal" min="0" step="0.5" required></div>
        <div><label for="t-reps">Repetições</label><input id="t-reps" type="number" inputmode="numeric" min="1" max="100" step="1" required></div>
      </div>
      <div class="linha" style="margin-top:8px">
        <input type="checkbox" id="t-auto" checked style="width:22px;min-height:22px">
        <label for="t-auto" style="margin:0">Iniciar descanso automaticamente</label>
      </div>
      <p id="t-dica" class="peq suave" style="min-height:1.2em"></p>
      <button class="primario grande">＋ Registrar série</button>
    </form>

    <div class="card">
      <h2>Descanso</h2>
      <div class="descanso" id="d-tempo">${descanso ? formatarTempo((descanso.fimEm - Date.now()) / 1000) : "00:00"}</div>
      <div class="linha quebra" style="justify-content:center;margin:10px 0">
        ${[45, 60, 90, 120, 180].map((s) => `<button class="mini" data-desc="${s}">${formatarTempo(s)}</button>`).join("")}
      </div>
      <button class="grande" id="d-parar" ${descanso ? "" : "hidden"}>Parar descanso</button>
    </div>

    <div class="card">
      <div class="linha espaco"><h2>Hoje</h2><span class="suave peq">${hoje.length} séries · ${fmt(volume(hoje))} kg de volume</span></div>
      ${grupos.size ? [...grupos].map(([ex, ss]) => `
        <div style="margin-bottom:10px"><b>${esc(ex)}</b>
          ${ss.map((s, i) => `<div class="serie"><span>${i + 1}ª · ${fmt(s.carga, 1)} kg × ${s.reps}${s.pr ? '<span class="pr">PR</span>' : ""}</span>
            <span class="suave peq">1RM ≈ ${fmt(estimar1RM(s.carga, s.reps), 1)} kg
            <button class="mini fantasma perigo" data-del="${s.id}" aria-label="Apagar série">🗑</button></span></div>`).join("")}
        </div>`).join("") : `<p class="suave">Nenhuma série hoje. Bora treinar!</p>`}
    </div>
    ${semanaHtml()}
  `;

  $("#form-serie").addEventListener("submit", registrarSerie);
  $("#t-ex").addEventListener("input", dica);
  $("#t-ex").addEventListener("change", dica);
  $$("[data-desc]").forEach((b) => b.addEventListener("click", () => iniciarDescanso(Number(b.dataset.desc))));
  $("#d-parar").addEventListener("click", pararDescanso);
  $$("[data-del]").forEach((b) =>
    b.addEventListener("click", () => {
      db.series = db.series.filter((s) => s.id !== b.dataset.del);
      salvar();
      renderTreino();
    }),
  );
  dica();
}

function semanaHtml() {
  const dias = ultimosDias(7);
  const vols = dias.map((d) => volume(db.series.filter((s) => s.data === d)));
  const max = Math.max(...vols, 1);
  const nomes = ["D", "S", "T", "Q", "Q", "S", "S"];
  return `<div class="card"><h2>Volume da semana</h2>
    <div style="display:flex;align-items:flex-end;gap:6px;height:90px" role="img" aria-label="Volume por dia nos últimos 7 dias">
      ${vols.map((v, i) => `<div style="flex:1;text-align:center"><div style="height:${Math.max(3, (v / max) * 70)}px;background:${v ? "var(--acento)" : "var(--linha)"};border-radius:4px"></div>
        <span class="peq suave">${nomes[new Date(dias[i] + "T00:00").getDay()]}</span></div>`).join("")}
    </div></div>`;
}

function dica() {
  const ex = $("#t-ex").value.trim();
  const el = $("#t-dica");
  if (!ex) return (el.textContent = "");
  const melhor = melhor1RM(db.series, ex);
  const ultima = [...db.series].reverse().find((s) => s.exercicio.toLowerCase() === ex.toLowerCase());
  el.textContent = ultima
    ? `Última vez: ${fmt(ultima.carga, 1)} kg × ${ultima.reps} · melhor 1RM ≈ ${fmt(melhor, 1)} kg`
    : "Primeira vez neste exercício.";
}

function registrarSerie(e) {
  e.preventDefault();
  const exercicio = $("#t-ex").value.trim();
  const carga = num($("#t-carga").value, NaN);
  const reps = Math.round(num($("#t-reps").value, NaN));
  if (!exercicio || !(carga >= 0) || !(reps >= 1)) return avisar("Confira exercício, carga e repetições.");
  const ts = Date.now();
  const anterior = melhor1RM(db.series, exercicio, ts);
  const novo1RM = estimar1RM(carga, reps);
  const pr = anterior > 0 && novo1RM > anterior;
  db.series.push({ id: novoId(), ts, data: chaveData(), exercicio, carga, reps, pr });
  salvar();
  ultimoExercicio = exercicio;
  const auto = $("#t-auto").checked;
  renderTreino();
  $("#t-carga").value = carga; // facilita repetir a mesma carga
  if (pr) {
    avisar("🏆 Novo recorde pessoal!");
    falar("Novo recorde pessoal!");
  } else {
    avisar("Série registrada");
  }
  if (auto) iniciarDescanso(descansoSugerido());
}

// Mais descanso para cargas pesadas (poucas reps), menos para volume.
function descansoSugerido() {
  const reps = db.series.at(-1)?.reps ?? 10;
  return reps <= 5 ? 180 : reps <= 12 ? 90 : 60;
}

function iniciarDescanso(seg) {
  destravarAudio();
  clearInterval(timerDescanso);
  descanso = { fimEm: Date.now() + seg * 1000, total: seg };
  ultimoBipe = null;
  $("#d-parar").hidden = false;
  timerDescanso = setInterval(tickDescanso, 250);
  tickDescanso();
}

function tickDescanso() {
  const el = $("#d-tempo");
  if (!descanso) return;
  const resta = (descanso.fimEm - Date.now()) / 1000;
  if (resta <= 0) {
    clearInterval(timerDescanso);
    descanso = null;
    alarmeFim();
    falar("Descanso terminou. Próxima série!");
    if (el) {
      el.textContent = "00:00";
      el.classList.add("fim");
    }
    const parar = $("#d-parar");
    if (parar) parar.hidden = true;
    return;
  }
  const seg = Math.ceil(resta);
  if (seg <= 3 && seg !== ultimoBipe) {
    ultimoBipe = seg;
    alarmeContagem();
  }
  if (el) {
    el.classList.remove("fim");
    el.textContent = formatarTempo(resta);
  }
}

function pararDescanso() {
  clearInterval(timerDescanso);
  descanso = null;
  $("#d-tempo").textContent = "00:00";
  $("#d-parar").hidden = true;
}
