// Quadro do dia: calorias, macros, água, treino e peso corporal.
import { db, salvar } from "./storage.js";
import { somarItens, volume, chaveData, formatarTempo } from "./logic.js";
import { $, $$, num, avisar, fmt, icone, regua } from "./util.js";

const raiz = () => $("#view-hoje");

export function renderHoje() {
  const hoje = chaveData();
  const refeicoes = db.refeicoes.filter((r) => r.data === hoje);
  const tot = somarItens(refeicoes.flatMap((r) => r.itens));
  const p = db.perfil;
  const agua = db.agua[hoje] ?? 0;
  const series = db.series.filter((s) => s.data === hoje);
  const corridas = db.esteira.filter((s) => s.data === hoje);
  const restam = p.metaKcal - tot.calorias;
  const data = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  raiz().innerHTML = `
    <h1>Hoje</h1>
    <p class="sub">${data}</p>

    <section class="bloco quadro-kcal" aria-label="Calorias">
      <div class="linha espaco baixo"><h2>Calorias</h2><span class="suave peq">meta ${fmt(p.metaKcal)} kcal</span></div>
      <div class="num num-grande">${fmt(tot.calorias)}<small>kcal</small></div>
      ${regua([{ valor: tot.calorias }], p.metaKcal, { rotulo: `${fmt(tot.calorias)} de ${fmt(p.metaKcal)} calorias` })}
      <p class="${restam < 0 ? "erro" : "suave"}" style="margin-top:10px;font-weight:600">${
        restam < 0 ? `Passou ${fmt(-restam)} kcal da meta.` : `Restam ${fmt(restam)} kcal para a meta de hoje.`
      }</p>
    </section>

    <section class="bloco sutil" aria-label="Macronutrientes">
      <div class="leitura">
        <span class="nome">Proteína</span>
        <span class="valor">${fmt(tot.proteina_g)}<small>/ ${fmt(p.metaProteina)} g</small></span>
        ${regua([{ valor: tot.proteina_g }], p.metaProteina, { classe: "fino", rotulo: "Proteína do dia" })}
      </div>
      <div class="trio" style="margin-top:20px">
        <div><span class="valor num">${fmt(tot.carboidrato_g)} g</span><span class="nome">Carboidrato</span></div>
        <div><span class="valor num">${fmt(tot.gordura_g)} g</span><span class="nome">Gordura</span></div>
        <div><span class="valor num">${refeicoes.length}</span><span class="nome">Refeições</span></div>
      </div>
    </section>

    <section class="bloco sutil" aria-label="Água">
      <div class="leitura">
        <span class="nome">Água</span>
        <span class="valor">${fmt(agua / 1000, 2)}<small>/ ${fmt(p.metaAguaMl / 1000, 1)} L</small></span>
        ${regua([{ valor: agua }], p.metaAguaMl, { classe: "agua fino", rotulo: "Água do dia" })}
      </div>
      <div class="linha quebra" style="margin-top:14px">
        <button class="mini" data-agua="250">${icone("mais", "sm")}250 ml</button>
        <button class="mini" data-agua="500">${icone("mais", "sm")}500 ml</button>
        <button class="mini suave-btn" data-agua="-250" aria-label="Tirar 250 ml">${icone("menos", "sm")}250 ml</button>
      </div>
    </section>

    <section class="bloco sutil" aria-label="Treino de hoje">
      <h2>Treino</h2>
      ${series.length || corridas.length ? `
        <div class="trio" style="margin-top:14px">
          <div><span class="valor num">${series.length}</span><span class="nome">séries</span></div>
          <div><span class="valor num">${fmt(volume(series))}</span><span class="nome">kg de volume</span></div>
          <div><span class="valor num">${fmt(corridas.reduce((s, c) => s + c.km, 0), 1)}</span><span class="nome">km de esteira</span></div>
        </div>
        ${corridas.length ? `<p class="peq suave" style="margin-top:12px">Esteira: ${corridas.map((c) => formatarTempo(c.duracaoSeg)).join(" + ")} · ${fmt(corridas.reduce((s, c) => s + c.kcal, 0))} kcal</p>` : ""}`
      : `<p class="vazio" style="margin-top:10px">Nada registrado hoje. Abra <b>Esteira</b> para um intervalado ou <b>Treino</b> para anotar as séries.</p>`}
    </section>

    <section class="bloco sutil" aria-label="Peso corporal">
      <h2>Peso</h2>
      ${graficoPeso()}
      <form id="form-peso" class="linha" style="margin-top:12px" autocomplete="off">
        <input id="peso-kg" type="number" inputmode="decimal" step="0.1" min="20" max="400" placeholder="Peso de hoje, em kg" aria-label="Peso de hoje em kg" required>
        <button class="primario" style="flex:none">Salvar</button>
      </form>
    </section>
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

function graficoPeso() {
  const pts = db.peso.slice().sort((a, b) => a.data.localeCompare(b.data)).slice(-30);
  if (pts.length < 2) {
    return `<p class="vazio" style="margin-top:8px">${pts.length ? `Último: <b>${fmt(pts[0].kg, 1)} kg</b>. ` : ""}Registre por alguns dias para ver a evolução.</p>`;
  }
  const kgs = pts.map((p) => p.kg);
  const min = Math.min(...kgs), max = Math.max(...kgs), faixa = max - min || 1;
  const x = (i) => (i / (pts.length - 1)) * 300;
  const y = (kg) => 46 - ((kg - min) / faixa) * 40;
  const coords = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
  const dif = pts.at(-1).kg - pts[0].kg;
  return `<div class="linha espaco baixo" style="margin-top:6px"><span class="num" style="font-size:2.25rem">${fmt(pts.at(-1).kg, 1)}<small style="font:500 .9375rem var(--texto);color:var(--ink-3);margin-left:4px">kg</small></span>
      <span class="peq suave">${dif > 0 ? "+" : ""}${fmt(dif, 1)} kg em ${pts.length} registros</span></div>
    <svg class="grafico-peso" viewBox="0 0 300 52" preserveAspectRatio="none" role="img" aria-label="Evolução do peso: de ${fmt(pts[0].kg, 1)} para ${fmt(pts.at(-1).kg, 1)} quilos">
      <polyline points="${coords}"/>
    </svg>
    <div class="linha espaco peq suave"><span>mín. ${fmt(min, 1)} kg</span><span>máx. ${fmt(max, 1)} kg</span></div>`;
}
