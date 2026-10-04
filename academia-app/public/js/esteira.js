// Esteira intervalada: tempo FORTE (máximo) e tempo LEVE (mínimo/recuperação), com alarme a cada troca.
import { db, salvar, novoId } from "./storage.js";
import {
  PLANO_PADRAO, NOME_FASE, montarFases, duracaoTotal, localizar, estimarSessao,
  formatarTempo, lerTempo, chaveData,
} from "./logic.js";
import { $, $$, esc, num, avisar, fmt } from "./util.js";
import {
  destravarAudio, alarmeContagem, alarmeTroca, alarmeFim, falar, manterTelaLigada,
} from "./alarme.js";

const PRESETS = [
  { nome: "Iniciante 1:2", plano: { aquecimento: 300, forte: 60, leve: 120, rodadas: 6, desaquecimento: 180, velForte: 9, velLeve: 5 } },
  { nome: "Intervalado 2:1", plano: { aquecimento: 300, forte: 120, leve: 60, rodadas: 6, desaquecimento: 180, velForte: 11, velLeve: 6 } },
  { nome: "HIIT 30/30", plano: { aquecimento: 300, forte: 30, leve: 30, rodadas: 10, desaquecimento: 180, velForte: 14, velLeve: 6 } },
  { nome: "Tiros 1:1", plano: { aquecimento: 300, forte: 60, leve: 60, rodadas: 8, desaquecimento: 180, velForte: 13, velLeve: 6 } },
];

let sessao = null; // sessão em andamento
let timer = null;

const raiz = () => $("#view-esteira");

export function renderEsteira() {
  if (sessao) return; // não derruba a tela durante o treino
  const p = { ...PLANO_PADRAO, ...db.planoEsteira };
  raiz().innerHTML = `
    <h1>Esteira</h1>
    <p class="sub">Defina quanto tempo ficar forte e quanto recuperar. O app avisa cada troca com alarme.</p>

    <div class="card">
      <h2>Modelos prontos</h2>
      <div class="preset-lista">${PRESETS.map((x, i) => `<button class="mini" data-preset="${i}">${esc(x.nome)}</button>`).join("")}</div>
    </div>

    <form class="card" id="form-esteira" autocomplete="off">
      <h2>Seu treino</h2>
      <div class="grade">
        ${campoTempo("forte", "Tempo FORTE (máx.)", p.forte)}
        ${campoTempo("leve", "Tempo LEVE (mín.)", p.leve)}
        ${campoNumero("rodadas", "Rodadas", p.rodadas, 1, 1, 50)}
        ${campoNumero("inclinacao", "Inclinação (%)", p.inclinacao, 0.5, 0, 15)}
        ${campoNumero("velForte", "Veloc. forte (km/h)", p.velForte, 0.5, 1, 25)}
        ${campoNumero("velLeve", "Veloc. leve (km/h)", p.velLeve, 0.5, 1, 25)}
        ${campoTempo("aquecimento", "Aquecimento", p.aquecimento)}
        ${campoTempo("desaquecimento", "Desaquecimento", p.desaquecimento)}
      </div>
      <p class="peq suave">Tempos em min:seg (ex.: <b>2:00</b>, <b>0:45</b>) ou só minutos (ex.: <b>2</b>). Use 0 para pular aquecimento ou desaquecimento.</p>
      <div id="resumo-esteira" class="aviso"></div>
      <p id="erro-esteira" class="erro peq" role="alert"></p>
      <button type="submit" class="primario grande">▶ Iniciar</button>
    </form>

    ${historicoHtml()}
  `;

  const form = $("#form-esteira");
  form.addEventListener("input", atualizarResumo);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const plano = lerFormulario();
    if (plano.erro) return ($("#erro-esteira").textContent = plano.erro);
    iniciar(plano.plano);
  });
  $$("[data-preset]").forEach((b) =>
    b.addEventListener("click", () => {
      const plano = { ...PLANO_PADRAO, ...PRESETS[b.dataset.preset].plano };
      for (const [k, v] of Object.entries(plano)) {
        const el = form.elements[k];
        if (el) el.value = el.dataset.tempo ? formatarTempo(v) : v;
      }
      atualizarResumo();
    }),
  );
  atualizarResumo();
}

function campoTempo(nome, rotulo, seg) {
  return `<div><label for="e-${nome}">${rotulo}</label><input id="e-${nome}" name="${nome}" data-tempo="1" value="${formatarTempo(seg)}" inputmode="text" maxlength="6"></div>`;
}
function campoNumero(nome, rotulo, valor, passo, min, max) {
  return `<div><label for="e-${nome}">${rotulo}</label><input id="e-${nome}" name="${nome}" type="number" inputmode="decimal" value="${valor}" step="${passo}" min="${min}" max="${max}"></div>`;
}

function lerFormulario() {
  const f = $("#form-esteira").elements;
  const plano = { ...PLANO_PADRAO };
  for (const k of ["forte", "leve", "aquecimento", "desaquecimento"]) {
    const s = lerTempo(f[k].value);
    if (s === null) return { erro: "Tempo inválido. Use o formato 2:00 ou 0:45." };
    plano[k] = s;
  }
  for (const k of ["rodadas", "inclinacao", "velForte", "velLeve"]) plano[k] = num(f[k].value, NaN);
  if (!(plano.forte > 0)) return { erro: "O tempo forte precisa ser maior que zero." };
  if (!(plano.rodadas >= 1) || !Number.isInteger(plano.rodadas)) return { erro: "Rodadas deve ser um número inteiro (1 ou mais)." };
  if (!(plano.velForte > 0 && plano.velLeve > 0)) return { erro: "Velocidades precisam ser maiores que zero." };
  if (!(plano.inclinacao >= 0)) return { erro: "Inclinação inválida." };
  plano.velAquecimento = plano.velLeve;
  plano.velDesaquecimento = Math.max(3, plano.velLeve - 1);
  return { plano };
}

function atualizarResumo() {
  const { plano, erro } = lerFormulario();
  const el = $("#resumo-esteira");
  if (erro) {
    el.textContent = erro;
    return;
  }
  const fases = montarFases(plano);
  const peso = db.perfil.pesoKg || 70;
  const est = estimarSessao(fases, Infinity, peso, plano.inclinacao);
  el.innerHTML = `Total <b>${formatarTempo(duracaoTotal(fases))}</b> · ${plano.rodadas} × (${formatarTempo(plano.forte)} forte${plano.rodadas > 1 ? ` + ${formatarTempo(plano.leve)} leve` : ""}) ·
    ~<b>${fmt(est.kcal)} kcal</b> · ~${fmt(est.km, 1)} km${db.perfil.pesoKg ? "" : " <span class='suave'>(calculado para 70 kg — informe seu peso no Perfil)</span>"}`;
}

function historicoHtml() {
  const ultimas = db.esteira.slice(-5).reverse();
  if (!ultimas.length) return "";
  return `<div class="card"><h2>Últimas sessões</h2>${ultimas
    .map(
      (s) => `<div class="serie"><span>${esc(s.data.split("-").reverse().join("/"))} · ${formatarTempo(s.duracaoSeg)}</span>
      <span class="suave">${fmt(s.km, 1)} km · ${fmt(s.kcal)} kcal</span></div>`,
    )
    .join("")}</div>`;
}

// ---------- Sessão em andamento ----------

function iniciar(plano) {
  db.planoEsteira = plano;
  salvar();
  destravarAudio(); // precisa de um toque do usuário
  const fases = montarFases(plano);
  sessao = {
    plano, fases, inicio: Date.now(), pausadoEm: null, pausaTotal: 0,
    indice: -1, ultimoBipe: null, peso: db.perfil.pesoKg || 70,
  };
  document.body.dataset.telaLigada = "1";
  manterTelaLigada(true);
  desenharSessao();
  timer = setInterval(tick, 250);
  tick();
}

const decorrido = () => ((sessao.pausadoEm ?? Date.now()) - sessao.inicio - sessao.pausaTotal) / 1000;

function desenharSessao() {
  const total = duracaoTotal(sessao.fases);
  raiz().innerHTML = `
    <div class="palco" id="palco" data-fase="aquecimento" aria-live="off">
      <div class="fase" id="s-fase">—</div>
      <div class="relogio" id="s-relogio">00:00</div>
      <div class="vel" id="s-vel"></div>
      <div class="prox" id="s-prox"></div>
    </div>
    <div class="linha-tempo" id="s-linha" aria-hidden="true">${sessao.fases
      .map((f) => `<i data-t="${f.tipo}" style="flex:${f.duracao}"></i>`)
      .join("")}</div>
    <div class="linha espaco peq suave"><span id="s-rodada"></span><span>Restam <b id="s-restante">${formatarTempo(total)}</b></span></div>
    <div class="stats">
      <div><b id="s-decorrido">00:00</b><span>Tempo</span></div>
      <div><b id="s-km">0,0</b><span>km</span></div>
      <div><b id="s-kcal">0</b><span>kcal</span></div>
    </div>
    <div class="controles">
      <button id="b-pausa">⏸ Pausar</button>
      <button id="b-pular">⏭ Pular fase</button>
      <button id="b-parar" class="perigo">⏹ Encerrar</button>
    </div>
    <p class="peq suave centro" style="margin-top:14px">Mantenha esta tela aberta. O app tenta deixar a tela ligada durante o treino.</p>
  `;
  $("#b-pausa").addEventListener("click", alternarPausa);
  $("#b-pular").addEventListener("click", pularFase);
  $("#b-parar").addEventListener("click", () => {
    if (confirm("Encerrar o treino agora?")) finalizar(false);
  });
}

function tick() {
  if (!sessao || sessao.pausadoEm) return;
  const dec = decorrido();
  const loc = localizar(sessao.fases, dec);
  if (loc.fim) return finalizar(true);

  if (loc.indice !== sessao.indice) {
    const primeira = sessao.indice === -1;
    sessao.indice = loc.indice;
    sessao.ultimoBipe = null;
    anunciarFase(loc.fase, primeira);
  }

  const seg = Math.ceil(loc.restanteFase);
  if (seg >= 1 && seg <= 3 && seg !== sessao.ultimoBipe && loc.fase.duracao > 5) {
    sessao.ultimoBipe = seg;
    alarmeContagem();
  }
  atualizarTela(loc, dec);
}

function anunciarFase(fase, primeira) {
  const nome = NOME_FASE[fase.tipo];
  const vel = `${fmt(fase.velocidade, 1)} quilômetros por hora`;
  if (fase.tipo === "forte" || fase.tipo === "leve") {
    alarmeTroca(fase.tipo);
    falar(fase.tipo === "forte" ? `Forte! ${vel}` : `Leve. ${vel}`);
  } else if (!primeira) {
    alarmeTroca("leve");
    falar(`${nome}. ${vel}`);
  } else {
    falar(`Vamos começar. ${nome}, ${vel}`);
  }
}

function atualizarTela(loc, dec) {
  const { fase } = loc;
  $("#palco").dataset.fase = fase.tipo;
  $("#s-fase").textContent = NOME_FASE[fase.tipo];
  $("#s-relogio").textContent = formatarTempo(loc.restanteFase);
  $("#s-vel").textContent = `${fmt(fase.velocidade, 1)} km/h${sessao.plano.inclinacao ? ` · ${fmt(sessao.plano.inclinacao, 1)}%` : ""}`;
  const prox = sessao.fases[loc.indice + 1];
  $("#s-prox").textContent = prox
    ? `Próxima: ${NOME_FASE[prox.tipo]} · ${formatarTempo(prox.duracao)} · ${fmt(prox.velocidade, 1)} km/h`
    : "Última fase — falta pouco!";
  $("#s-rodada").textContent = fase.rodada ? `Rodada ${fase.rodada} de ${sessao.plano.rodadas}` : "";
  $("#s-restante").textContent = formatarTempo(duracaoTotal(sessao.fases) - dec);
  $("#s-decorrido").textContent = formatarTempo(dec);
  const est = estimarSessao(sessao.fases, dec, sessao.peso, sessao.plano.inclinacao);
  $("#s-km").textContent = fmt(est.km, 2);
  $("#s-kcal").textContent = fmt(est.kcal);
  $$("#s-linha i").forEach((el, i) => {
    el.classList.toggle("feita", i < loc.indice);
    el.classList.toggle("atual", i === loc.indice);
  });
}

function alternarPausa() {
  const btn = $("#b-pausa");
  if (sessao.pausadoEm) {
    sessao.pausaTotal += Date.now() - sessao.pausadoEm;
    sessao.pausadoEm = null;
    btn.textContent = "⏸ Pausar";
    manterTelaLigada(true);
    destravarAudio();
  } else {
    sessao.pausadoEm = Date.now();
    btn.textContent = "▶ Continuar";
  }
}

function pularFase() {
  if (sessao.pausadoEm) return;
  const loc = localizar(sessao.fases, decorrido());
  sessao.inicio -= loc.restanteFase * 1000; // salta para o começo da próxima fase
  tick();
}

function finalizar(completo) {
  clearInterval(timer);
  timer = null;
  const dec = Math.min(decorrido(), duracaoTotal(sessao.fases));
  const est = estimarSessao(sessao.fases, dec, sessao.peso, sessao.plano.inclinacao);
  const rodadas = sessao.fases.filter((f, i) => f.tipo === "forte" && i < localizar(sessao.fases, dec).indice).length;
  const aviso = !db.perfil.pesoKg;
  if (dec >= 10) {
    db.esteira.push({
      id: novoId(), ts: Date.now(), data: chaveData(), duracaoSeg: Math.round(dec),
      kcal: est.kcal, km: est.km, rodadas: completo ? sessao.plano.rodadas : rodadas,
    });
    salvar();
  }
  document.body.dataset.telaLigada = "0";
  manterTelaLigada(false);
  if (completo) {
    alarmeFim();
    falar("Treino concluído. Bom trabalho!");
  }
  sessao = null;
  raiz().innerHTML = `
    <div class="card centro">
      <div style="font-size:3rem">${completo ? "🏁" : "👏"}</div>
      <h1>${completo ? "Treino concluído!" : "Treino encerrado"}</h1>
      <div class="stats">
        <div><b>${formatarTempo(dec)}</b><span>Tempo</span></div>
        <div><b>${fmt(est.km, 2)}</b><span>km</span></div>
        <div><b>${fmt(est.kcal)}</b><span>kcal</span></div>
      </div>
      ${aviso ? `<p class="peq suave">Calorias calculadas para 70 kg. Informe seu peso no Perfil para ficar mais preciso.</p>` : ""}
      <button class="primario grande" id="b-novo" style="margin-top:14px">Novo treino</button>
    </div>`;
  $("#b-novo").addEventListener("click", renderEsteira);
  avisar(dec >= 10 ? "Sessão salva" : "Sessão muito curta, não foi salva");
}
