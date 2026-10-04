// Painel do dia: calorias, macros, água, treino e peso corporal.
import { db, salvar } from "./storage.js";
import { somarItens, volume, chaveData, formatarTempo } from "./logic.js";
import { $, $$, esc, num, avisar, fmt, anel } from "./util.js";

const raiz = () => $("#view-hoje");

export function renderHoje() {
  const hoje = chaveData();
  const refeicoes = db.refeicoes.filter((r) => r.data === hoje);
  const tot = somarItens(refeicoes.flatMap((r) => r.itens));
  const p = db.perfil;
  const agua = db.agua[hoje] ?? 0;
  const series = db.series.filter((s) => s.data === hoje);
  const corridas = db.esteira.filter((s) => s.data === hoje);
  const saudacao = new Date().getHours() < 12 ? "Bom dia" : new Date().getHours() < 18 ? "Boa tarde" : "Boa noite";

  raiz().innerHTML = `
    <h1>${saudacao} 💪</h1>
    <p class="sub">${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>

    <div class="card">
      <div class="linha" style="gap:16px">
        ${anel(tot.calorias, p.metaKcal, { rotulo: fmt(tot.calorias), sub: `de ${fmt(p.metaKcal)} kcal` })}
        <div class="col">
          ${macro("Proteína", tot.proteina_g, p.metaProteina, "var(--acento)")}
          ${macro("Carboidrato", tot.carboidrato_g, null)}
          ${macro("Gordura", tot.gordura_g, null)}
        </div>
      </div>
      <p class="peq suave" style="margin-bottom:0">${
        tot.calorias > p.metaKcal ? `Passou ${fmt(tot.calorias - p.metaKcal)} kcal da meta.` : `Restam ${fmt(p.metaKcal - tot.calorias)} kcal para a meta de hoje.`
      }</p>
    </div>

    <div class="card">
      <div class="linha espaco"><h2>💧 Água</h2><b>${fmt(agua / 1000, 2)} / ${fmt(p.metaAguaMl / 1000, 1)} L</b></div>
      <div class="barra" style="margin:6px 0 12px"><i style="width:${Math.min(100, (agua / p.metaAguaMl) * 100)}%;background:var(--desaq)"></i></div>
      <div class="linha quebra">
        <button class="mini" data-agua="250">+250 ml</button>
        <button class="mini" data-agua="500">+500 ml</button>
        <button class="mini fantasma" data-agua="-250">−250 ml</button>
      </div>
    </div>

    <div class="card">
      <h2>Treino de hoje</h2>
      ${series.length || corridas.length ? `
        <div class="grade grade3 centro">
          <div><b style="font-size:1.4rem">${series.length}</b><div class="peq suave">séries</div></div>
          <div><b style="font-size:1.4rem">${fmt(volume(series))}</b><div class="peq suave">kg volume</div></div>
          <div><b style="font-size:1.4rem">${fmt(corridas.reduce((s, c) => s + c.km, 0), 1)}</b><div class="peq suave">km esteira</div></div>
        </div>
        ${corridas.length ? `<p class="peq suave">Esteira: ${corridas.map((c) => formatarTempo(c.duracaoSeg)).join(" + ")} · ${fmt(corridas.reduce((s, c) => s + c.kcal, 0))} kcal</p>` : ""}`
      : `<p class="suave">Nada registrado ainda. Vá em <b>Esteira</b> ou <b>Treino</b>.</p>`}
    </div>

    <div class="card">
      <h2>⚖️ Peso corporal</h2>
      ${graficoPeso()}
      <form id="form-peso" class="linha" style="margin-top:10px" autocomplete="off">
        <input id="peso-kg" type="number" inputmode="decimal" step="0.1" min="20" max="400" placeholder="kg hoje" aria-label="Peso de hoje em kg" required>
        <button class="primario">Salvar</button>
      </form>
    </div>
  `;

  $$("[data-agua]").forEach((b) =>
    b.addEventListener("click", () => {
      db.agua[hoje] = Math.max(0, (db.agua[hoje] ?? 0) + Number(b.dataset.agua));
      salvar();
      renderHoje();
    }),
  );
  $("#form-peso").addEventListener("submit", (e) => {
    e.preventDefault();
    const kg = num($("#peso-kg").value, NaN);
    if (!(kg >= 20 && kg <= 400)) return avisar("Peso inválido.");
    db.peso = db.peso.filter((x) => x.data !== hoje);
    db.peso.push({ data: hoje, kg });
    db.perfil.pesoKg = kg; // usado para estimar calorias da esteira
    salvar();
    avisar("Peso salvo");
    renderHoje();
  });
}

function macro(nome, valor, meta, cor = "var(--suave)") {
  return `<div class="macro"><div class="linha espaco"><span>${esc(nome)}</span>
    <span class="suave">${fmt(valor, 0)} g${meta ? ` / ${fmt(meta)} g` : ""}</span></div>
    <div class="barra"><i style="width:${meta ? Math.min(100, (valor / meta) * 100) : 0}%;background:${cor}"></i></div></div>`;
}

function graficoPeso() {
  const pts = db.peso.slice().sort((a, b) => a.data.localeCompare(b.data)).slice(-30);
  if (pts.length < 2) {
    return `<p class="suave">${pts.length ? `Último: <b>${fmt(pts[0].kg, 1)} kg</b>. ` : ""}Registre por alguns dias para ver a evolução.</p>`;
  }
  const kgs = pts.map((p) => p.kg);
  const min = Math.min(...kgs), max = Math.max(...kgs), faixa = max - min || 1;
  const coords = pts.map((p, i) => `${(i / (pts.length - 1)) * 300},${50 - ((p.kg - min) / faixa) * 44 - 3}`).join(" ");
  const dif = pts.at(-1).kg - pts[0].kg;
  return `<svg viewBox="0 0 300 50" width="100%" height="70" preserveAspectRatio="none" role="img" aria-label="Evolução do peso">
      <polyline points="${coords}" fill="none" stroke="var(--acento)" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>
    <div class="linha espaco peq suave"><span>${fmt(pts[0].kg, 1)} kg</span><b style="color:var(--texto)">${fmt(pts.at(-1).kg, 1)} kg (${dif > 0 ? "+" : ""}${fmt(dif, 1)})</b></div>`;
}
