// Esteira intervalada: tempo FORTE (máximo) e tempo LEVE (mínimo/recuperação), com alarme a cada troca.
import { db, salvar, novoId } from "./storage.js";
import {
  PLANO_PADRAO, NOME_FASE, montarFases, duracaoTotal, localizar, estimarSessao,
  formatarTempo, lerTempo, chaveData,
} from "./logic.js";
import { $, $$, esc, num, avisar, fmt, icone } from "./util.js";
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
    <p class="sub">Defina quanto tempo ficar forte e quanto recuperar. O app avisa cada troca com som, vibração e voz.</p>

    <div class="chips" role="group" aria-label="Modelos prontos">${PRESETS.map((x, i) => `<button class="chip" data-preset="${i}">${esc(x.nome)}</button>`).join("")}</div>

    <form id="form-esteira" autocomplete="off" style="margin-top:16px">
      <div class="placas">
        <div class="placa forte">
          <label for="e-forte">Forte</label>
          <input id="e-forte" name="forte" data-tempo="1" value="${formatarTempo(p.forte)}" inputmode="text" maxlength="6" aria-describedby="d-forte">
          <span class="dica" id="d-forte">tempo máximo</span>
          <div class="passos"><button type="button" data-passo="forte" data-d="-15" aria-label="Forte, menos 15 segundos">−15s</button><button type="button" data-passo="forte" data-d="15" aria-label="Forte, mais 15 segundos">+15s</button></div>
        </div>
        <div class="placa leve">
          <label for="e-leve">Leve</label>
          <input id="e-leve" name="leve" data-tempo="1" value="${formatarTempo(p.leve)}" inputmode="text" maxlength="6" aria-describedby="d-leve">
          <span class="dica" id="d-leve">tempo mínimo</span>
          <div class="passos"><button type="button" data-passo="leve" data-d="-15" aria-label="Leve, menos 15 segundos">−15s</button><button type="button" data-passo="leve" data-d="15" aria-label="Leve, mais 15 segundos">+15s</button></div>
        </div>
      </div>

      <div class="grade">
        ${campoNumero("rodadas", "Rodadas", p.rodadas, 1, 1, 50)}
        ${campoNumero("inclinacao", "Inclinação (%)", p.inclinacao, 0.5, 0, 15)}
        ${campoNumero("velForte", "Velocidade forte (km/h)", p.velForte, 0.5, 1, 25)}
        ${campoNumero("velLeve", "Velocidade leve (km/h)", p.velLeve, 0.5, 1, 25)}
        ${campoTempo("aquecimento", "Aquecimento", p.aquecimento)}
        ${campoTempo("desaquecimento", "Desaquecimento", p.desaquecimento)}
      </div>
      <p class="peq suave" style="margin-top:12px">Tempos em min:seg (<b>2:00</b>, <b>0:45</b>) ou só minutos (<b>2</b>). Use 0 para pular aquecimento ou desaquecimento.</p>

      <div class="resumo" id="resumo-esteira"></div>
      <p id="erro-esteira" class="erro peq" role="alert" style="margin-bottom:10px"></p>
      <button type="submit" class="primario grande">${icone("play")}Iniciar</button>
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
  $$("[data-passo]").forEach((b) =>
    b.addEventListener("click", () => {
      const campo = form.elements[b.dataset.passo];
      const atual = lerTempo(campo.value) ?? 0;
      campo.value = formatarTempo(Math.max(5, atual + Number(b.dataset.d)));
      atualizarResumo();
    }),
  );
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
  el.innerHTML = `<div class="linha espaco baixo"><span>Total <b>${formatarTempo(duracaoTotal(fases))}</b></span><span class="suave">${plano.rodadas} × ${formatarTempo(plano.forte)} forte${plano.rodadas > 1 ? ` + ${formatarTempo(plano.leve)} leve` : ""}</span></div>
    <p class="peq suave" style="margin-top:6px">Cerca de <b>${fmt(est.kcal)} kcal</b> e ${fmt(est.km, 1)} km${db.perfil.pesoKg ? "" : " (calculado para 70 kg; informe seu peso no Perfil)"}</p>`;
}

function historicoHtml() {
  const ultimas = db.esteira.slice(-5).reverse();
  if (!ultimas.length) return "";
  return `<section class="bloco" style="margin-top:28px"><h2>Últimas sessões</h2><div class="hist">${ultimas
    .map(
      (s) => `<div class="rol"><span>${esc(s.data.split("-").reverse().join("/"))} · <b>${formatarTempo(s.duracaoSeg)}</b></span>
      <span class="suave">${fmt(s.km, 1)} km · ${fmt(s.kcal)} kcal</span></div>`,
    )
    .join("")}</div></section>`;
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
    temas: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => [m, m.content]),
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
  document.body.classList.add("rodando");
  raiz().innerHTML = `
    <div class="run" id="palco" data-fase="aquecimento">
      <div class="run-topo"><span id="s-rodada"></span></div>
      <div class="run-centro">
        <div class="run-fase" id="s-fase">—</div>
        <div class="run-relogio" id="s-relogio" aria-live="off">00:00</div>
        <div class="run-vel" id="s-vel"></div>
      </div>
      <div class="run-prox" id="s-prox"></div>
      <div class="linha-tempo" id="s-linha" aria-hidden="true">${sessao.fases
        .map((f) => `<i style="flex:${f.duracao}"></i>`)
        .join("")}</div>
      <div class="run-meta"><span>Restam <b id="s-restante">${formatarTempo(total)}</b></span><span>Tempo <b id="s-decorrido">00:00</b></span></div>
      <div class="run-stats">
        <div><b id="s-km">0,0</b><span>km</span></div>
        <div><b id="s-kcal">0</b><span>kcal</span></div>
        <div><b id="s-rod">0</b><span>rodadas feitas</span></div>
      </div>
      <div class="run-controles">
        <button id="b-pausa" class="principal">${icone("pausa")}<span class="rot">Pausar</span></button>
        <button id="b-pular" aria-label="Pular fase">${icone("pular")}<span class="rot">Pular</span></button>
        <button id="b-parar" aria-label="Encerrar treino">${icone("parar")}<span class="rot">Fim</span></button>
      </div>
    </div>
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
  const palco = $("#palco");
  if (palco.dataset.fase !== fase.tipo) {
    palco.dataset.fase = fase.tipo;
    const rel = $("#s-relogio");
    rel.classList.remove("bate");
    void rel.offsetWidth; // reinicia a animação
    rel.classList.add("bate");
  }
  $("#s-fase").textContent = NOME_FASE[fase.tipo];
  $("#s-relogio").textContent = formatarTempo(loc.restanteFase);
  $("#s-vel").textContent = `${fmt(fase.velocidade, 1)} km/h${sessao.plano.inclinacao ? ` · ${fmt(sessao.plano.inclinacao, 1)}%` : ""}`;
  const prox = sessao.fases[loc.indice + 1];
  $("#s-prox").textContent = prox
    ? `Próxima: ${NOME_FASE[prox.tipo]} · ${formatarTempo(prox.duracao)} · ${fmt(prox.velocidade, 1)} km/h`
    : "Última fase. Falta pouco!";
  $("#s-rodada").textContent = fase.rodada ? `Rodada ${fase.rodada} de ${sessao.plano.rodadas}` : "";
  $("#s-restante").textContent = formatarTempo(duracaoTotal(sessao.fases) - dec);
  $("#s-decorrido").textContent = formatarTempo(dec);
  const est = estimarSessao(sessao.fases, dec, sessao.peso, sessao.plano.inclinacao);
  $("#s-km").textContent = fmt(est.km, 2);
  $("#s-kcal").textContent = fmt(est.kcal);
  $("#s-rod").textContent = sessao.fases.filter((f, i) => f.tipo === "forte" && i < loc.indice).length;
  $$("#s-linha i").forEach((el, i) => {
    el.classList.toggle("feita", i < loc.indice);
    el.classList.toggle("atual", i === loc.indice);
    if (i === loc.indice) el.style.setProperty("--p", (loc.noFase / fase.duracao).toFixed(3));
  });
  const cor = getComputedStyle(palco).backgroundColor; // barra de status do celular acompanha a fase
  for (const [meta] of sessao.temas) meta.setAttribute("content", cor);
}

function alternarPausa() {
  const btn = $("#b-pausa");
  if (sessao.pausadoEm) {
    sessao.pausaTotal += Date.now() - sessao.pausadoEm;
    sessao.pausadoEm = null;
    btn.innerHTML = `${icone("pausa")}<span class="rot">Pausar</span>`;
    manterTelaLigada(true);
    destravarAudio();
  } else {
    sessao.pausadoEm = Date.now();
    btn.innerHTML = `${icone("play")}<span class="rot">Seguir</span>`;
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
  document.body.classList.remove("rodando");
  for (const [meta, cor] of sessao.temas) meta.setAttribute("content", cor);
  manterTelaLigada(false);
  if (completo) {
    alarmeFim();
    falar("Treino concluído. Bom trabalho!");
  }
  sessao = null;
  raiz().innerHTML = `
    <div class="fim-sessao">
      <h1>${completo ? "Treino concluído" : "Treino encerrado"}</h1>
      <p class="sub">${completo ? "Todas as rodadas feitas." : "Sessão parcial registrada."}</p>
      <div class="bloco trio">
        <div><span class="valor num-grande">${formatarTempo(dec)}</span><span class="nome">Tempo</span></div>
        <div><span class="valor num-grande">${fmt(est.km, 2)}</span><span class="nome">km</span></div>
        <div><span class="valor num-grande">${fmt(est.kcal)}</span><span class="nome">kcal</span></div>
      </div>
      ${aviso ? `<p class="peq suave">Calorias calculadas para 70 kg. Informe seu peso no Perfil para ficar mais preciso.</p>` : ""}
      <button class="primario grande" id="b-novo" style="margin-top:24px">Novo treino</button>
    </div>`;
  $("#b-novo").addEventListener("click", renderEsteira);
  avisar(dec >= 10 ? "Sessão salva" : "Sessão muito curta, não foi salva");
}
