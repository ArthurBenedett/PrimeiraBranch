// Comida: tira/escolhe a foto, a IA estima os alimentos e o app calcula o impacto no seu dia.
import { db, salvar, novoId } from "./storage.js";
import { somarItens, saldoDoDia, chaveData, tipoRefeicaoPorHora } from "./logic.js";
import { $, $$, esc, num, avisar, fmt, icone, regua } from "./util.js";

const TIPOS = ["Café da manhã", "Almoço", "Lanche", "Jantar", "Pré-treino", "Pós-treino"];
const MAX_LADO = 1280;

let analise = null; // {itens[], confianca, observacoes, foto}
let carregando = false;
let erroAnalise = "";
let statusApi = null; // {analiseDeFoto: bool}
let fotoAtual = null; // {dataUrl, base64, mediaType}
let notaAtual = ""; // detalhes digitados pelo usuário (sobrevive aos redesenhos)

const raiz = () => $("#view-comida");

export async function renderComida() {
  if (statusApi === null) {
    try {
      statusApi = await (await fetch("/api/status")).json();
    } catch {
      statusApi = { analiseDeFoto: false, offline: true };
    }
  }
  desenhar();
}

function consumidoHoje() {
  return db.refeicoes.filter((r) => r.data === chaveData()).reduce((s, r) => s + r.totais.calorias, 0);
}

function desenhar() {
  const hoje = db.refeicoes.filter((r) => r.data === chaveData());
  const tot = somarItens(hoje.flatMap((r) => r.itens.map((i) => ({ ...i, fator: i.fator ?? 1 }))));
  raiz().innerHTML = `
    <h1>Comida</h1>
    <p class="sub">Fotografe o prato e veja as calorias e os macros na hora.</p>

    ${!statusApi.analiseDeFoto ? `<div class="aviso ruim">${
      statusApi.offline
        ? "Sem conexão com o servidor: a análise por foto precisa de internet. Você ainda pode adicionar manualmente."
        : "A análise por foto está desativada (o servidor não tem a chave ANTHROPIC_API_KEY). Você ainda pode adicionar manualmente."
    }</div>` : ""}
    <label class="foto ${fotoAtual ? "tem" : ""} ${carregando ? "lendo" : ""}" for="foto" id="drop">
      ${fotoAtual
        ? `<img src="${fotoAtual.dataUrl}" alt="Foto da refeição">`
        : `<span class="vazio-foto">${icone("camera")}<b>Fotografar o prato</b><span>ou escolher da galeria</span></span>`}
    </label>
    <input id="foto" type="file" accept="image/*" capture="environment" hidden>
    <div style="margin-top:16px">
      <label for="nota">Detalhes (opcional, melhora a precisão)</label>
      <input id="nota" value="${esc(notaAtual)}" placeholder="Ex.: 200 g de arroz, frango de 150 g, sem óleo" maxlength="300">
    </div>
    <button class="primario grande" id="b-analisar" style="margin-top:16px" ${!fotoAtual || carregando || !statusApi.analiseDeFoto ? "disabled" : ""}>
      ${icone("buscar")}${carregando ? "Analisando" : "Analisar refeição"}
    </button>
    ${carregando ? `<div class="status" role="status">Identificando os alimentos…</div><div style="margin-top:12px"><div class="esqueleto"></div><div class="esqueleto"></div></div>` : ""}
    ${erroAnalise ? `<p class="erro" role="alert" style="margin-top:12px;font-weight:600">${esc(erroAnalise)}</p>` : ""}

    ${analise ? resultadoHtml() : ""}

    <details class="manual" id="manual">
      <summary>${icone("mais")}Adicionar manualmente</summary>
      <form id="form-manual" autocomplete="off">
        <label for="m-nome">Alimento</label><input id="m-nome" required maxlength="80">
        <div class="grade" style="margin-top:12px">
          <div><label for="m-kcal">Calorias (kcal)</label><input id="m-kcal" type="number" inputmode="decimal" min="0" step="any" required></div>
          <div><label for="m-prot">Proteína (g)</label><input id="m-prot" type="number" inputmode="decimal" min="0" step="any"></div>
          <div><label for="m-carb">Carboidrato (g)</label><input id="m-carb" type="number" inputmode="decimal" min="0" step="any"></div>
          <div><label for="m-gord">Gordura (g)</label><input id="m-gord" type="number" inputmode="decimal" min="0" step="any"></div>
        </div>
        <button class="grande" style="margin-top:16px">Adicionar à refeição</button>
      </form>
    </details>

    <section class="bloco" style="margin-top:20px">
      <div class="linha espaco baixo" style="margin-bottom:12px"><h2>Hoje</h2><span><b class="num" style="font-size:1.5rem">${fmt(tot.calorias)}</b> <span class="suave">/ ${fmt(db.perfil.metaKcal)} kcal</span></span></div>
      ${hoje.length ? hoje.slice().reverse().map(refeicaoHtml).join("") : `<p class="vazio">Nenhuma refeição registrada hoje. Fotografe o próximo prato.</p>`}
    </section>
  `;

  $("#foto").addEventListener("change", aoEscolherFoto);
  $("#nota").addEventListener("input", (e) => (notaAtual = e.target.value));
  $("#b-analisar").addEventListener("click", analisar);
  $("#form-manual").addEventListener("submit", adicionarManual);
  $$("[data-del-ref]").forEach((b) => b.addEventListener("click", () => removerRefeicao(b.dataset.delRef)));
  if (analise) ligarResultado();
}

function reguaDoDia(consumido, estaRefeicao) {
  return regua([{ valor: consumido }, { valor: estaRefeicao, classe: "b" }], db.perfil.metaKcal, { rotulo: "Calorias do dia com esta refeição" });
}

function resultadoHtml() {
  const t = somarItens(analise.itens);
  const consumido = consumidoHoje();
  const s = saldoDoDia({ consumido, estaRefeicao: t.calorias, meta: db.perfil.metaKcal });
  const aviso = { baixa: "Confiança baixa: confira o que foi identificado e as porções.", media: "Estimativa aproximada. Ajuste as porções se precisar.", alta: "" }[analise.confianca] ?? "";
  return `<section class="bloco" id="resultado" style="margin-top:28px">
    <h2>Resultado</h2>
    ${aviso ? `<div class="aviso" style="margin-top:14px">${esc(aviso)}</div>` : ""}
    ${analise.observacoes ? `<p class="suave peq" style="margin-top:10px">${esc(analise.observacoes)}</p>` : ""}
    ${fotoAtual && statusApi.analiseDeFoto ? `<div class="linha" style="margin:14px 0 6px">
      <input id="corrigir" value="${esc(notaAtual)}" placeholder="Errou? Diga o que é (ex.: batata cozida, 200 g)" maxlength="300" aria-label="Corrigir a análise">
      <button class="mini" id="b-reanalisar" style="flex:none">Reanalisar</button></div>` : ""}
    <div style="margin-top:10px">${analise.itens.length ? analise.itens.map(itemHtml).join("") : `<p class="vazio">Nenhum alimento identificado. Tente outra foto ou adicione manualmente.</p>`}</div>

    <div class="total-refeicao">
      <div class="linha espaco baixo">
        <div><span class="suave peq">Total desta refeição</span><div class="num num-grande" id="r-total">${fmt(t.calorias)}<small>kcal</small></div></div>
        <div class="peq suave" style="text-align:right" id="r-macros">Proteína ${fmt(t.proteina_g, 1)} g<br>Carbo ${fmt(t.carboidrato_g, 1)} g<br>Gordura ${fmt(t.gordura_g, 1)} g</div>
      </div>
      <div style="margin-top:18px">
        <div class="linha espaco peq" style="margin-bottom:8px"><b>Seu dia com esta refeição</b><b id="r-pct">${s.percentual}% da meta</b></div>
        <div id="r-regua">${reguaDoDia(consumido, t.calorias)}</div>
        <div class="legenda"><span><i></i>já consumido</span><span><i class="b"></i>esta refeição</span></div>
        <p class="peq ${s.estourou ? "erro" : "suave"}" id="r-saldo" style="margin-top:8px;font-weight:600">${saldoTexto(consumido, s)}</p>
      </div>
    </div>

    <div style="margin-top:18px">
      <label for="r-tipo">Refeição</label>
      <select id="r-tipo">${TIPOS.map((x) => `<option ${x === tipoRefeicaoPorHora(new Date().getHours()) ? "selected" : ""}>${x}</option>`).join("")}</select>
    </div>
    <div class="linha" style="margin-top:16px">
      <button class="primario col" id="b-salvar" ${analise.itens.length ? "" : "disabled"}>${icone("check")}Registrar</button>
      <button class="col" id="b-descartar">Descartar</button>
    </div>
  </section>`;
}

function saldoTexto(consumido, s) {
  return s.estourou
    ? `Passa ${fmt(-s.restante)} kcal da meta (já consumido: ${fmt(consumido)} kcal).`
    : `Depois desta refeição ainda restam ${fmt(s.restante)} kcal (já consumido: ${fmt(consumido)} kcal).`;
}

function itemHtml(it, i) {
  const f = it.fator ?? 1;
  return `<div class="alimento" data-i="${i}">
    <div class="linha espaco baixo">
      <div class="col"><div class="nome">${esc(it.nome)}</div><div class="macros">${esc(it.porcao)}</div></div>
      <div class="kcal"><span class="item-kcal">${fmt(it.calorias * f)}</span><small>kcal</small></div>
      <button class="icone" data-rem="${i}" aria-label="Remover ${esc(it.nome)}">${icone("fechar", "sm")}</button>
    </div>
    <div class="macros item-macros" style="margin-top:2px">Proteína ${fmt(it.proteina_g * f, 1)} g · Carbo ${fmt(it.carboidrato_g * f, 1)} g · Gordura ${fmt(it.gordura_g * f, 1)} g</div>
    <div class="porcoes"><label for="f-${i}">Porções</label>
      <input class="fator" id="f-${i}" type="number" inputmode="decimal" min="0.25" max="10" step="0.25" value="${f}" data-fator="${i}"></div>
  </div>`;
}

function refeicaoHtml(r) {
  return `<div class="refeicao">
    <div class="linha espaco"><b>${esc(r.tipo)} <span class="suave peq" style="font-weight:400">${esc(r.hora)}</span></b>
      <span class="linha" style="gap:2px"><span class="num" style="font-size:1.5rem">${fmt(r.totais.calorias)}</span><span class="suave peq">kcal</span>
      <button class="icone" data-del-ref="${r.id}" aria-label="Apagar refeição">${icone("lixo", "sm")}</button></span></div>
    <div class="peq suave" style="max-width:40ch">${r.itens.map((i) => esc(i.nome)).join(", ")}</div>
  </div>`;
}

function ligarResultado() {
  $$("[data-rem]").forEach((b) =>
    b.addEventListener("click", () => {
      analise.itens.splice(Number(b.dataset.rem), 1);
      desenhar();
    }),
  );
  $$("[data-fator]").forEach((inp) =>
    inp.addEventListener("input", () => {
      const f = num(inp.value, 1);
      analise.itens[Number(inp.dataset.fator)].fator = f > 0 ? Math.min(f, 10) : 1;
      atualizarTotais();
    }),
  );
  $("#b-reanalisar")?.addEventListener("click", () => {
    notaAtual = $("#corrigir").value;
    analisar();
  });
  $("#b-descartar").addEventListener("click", () => {
    analise = null;
    fotoAtual = null;
    notaAtual = "";
    desenhar();
  });
  $("#b-salvar").addEventListener("click", registrar);
}

// Atualiza só os números (não recria os campos, para não perder o foco ao digitar).
function atualizarTotais() {
  const t = somarItens(analise.itens);
  const consumido = consumidoHoje();
  const s = saldoDoDia({ consumido, estaRefeicao: t.calorias, meta: db.perfil.metaKcal });
  $("#r-total").innerHTML = `${fmt(t.calorias)}<small>kcal</small>`;
  $("#r-macros").innerHTML = `Proteína ${fmt(t.proteina_g, 1)} g<br>Carbo ${fmt(t.carboidrato_g, 1)} g<br>Gordura ${fmt(t.gordura_g, 1)} g`;
  $("#r-pct").textContent = `${s.percentual}% da meta`;
  $("#r-regua").innerHTML = reguaDoDia(consumido, t.calorias);
  const saldo = $("#r-saldo");
  saldo.textContent = saldoTexto(consumido, s);
  saldo.className = `peq ${s.estourou ? "erro" : "suave"}`;
  $$(".alimento").forEach((el) => {
    const it = analise.itens[Number(el.dataset.i)];
    const f = it.fator ?? 1;
    $(".item-kcal", el).textContent = fmt(it.calorias * f);
    $(".item-macros", el).textContent = `Proteína ${fmt(it.proteina_g * f, 1)} g · Carbo ${fmt(it.carboidrato_g * f, 1)} g · Gordura ${fmt(it.gordura_g * f, 1)} g`;
  });
}

function registrar() {
  if (!analise?.itens.length) return;
  const itens = analise.itens.map((i) => ({ ...i, fator: i.fator ?? 1 }));
  const agora = new Date();
  db.refeicoes.push({
    id: novoId(), data: chaveData(agora),
    hora: agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    tipo: $("#r-tipo").value, itens, totais: somarItens(itens),
  });
  salvar();
  analise = null;
  fotoAtual = null;
  notaAtual = "";
  avisar("Refeição registrada ✔");
  desenhar();
}

function removerRefeicao(id) {
  if (!confirm("Apagar esta refeição?")) return;
  db.refeicoes = db.refeicoes.filter((r) => r.id !== id);
  salvar();
  desenhar();
}

function adicionarManual(e) {
  e.preventDefault();
  const item = {
    nome: $("#m-nome").value.trim(), porcao: "1 porção", fator: 1,
    calorias: num($("#m-kcal").value), proteina_g: num($("#m-prot").value),
    carboidrato_g: num($("#m-carb").value), gordura_g: num($("#m-gord").value),
  };
  if (!item.nome) return;
  if (analise) {
    analise.itens.push(item);
  } else {
    analise = { itens: [item], confianca: "alta", observacoes: "" };
  }
  desenhar();
  $("#resultado")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- Foto + análise ----------

async function aoEscolherFoto(e) {
  const arquivo = e.target.files?.[0];
  if (!arquivo) return;
  erroAnalise = "";
  try {
    fotoAtual = await reduzirImagem(arquivo);
    analise = null;
  } catch {
    fotoAtual = null;
    erroAnalise = "Não consegui abrir essa imagem. Tente outra.";
  }
  desenhar();
  if (fotoAtual && statusApi.analiseDeFoto) analisar();
}

// Reduz para no máx. 1280 px e converte em JPEG: upload rápido e barato.
async function reduzirImagem(arquivo) {
  const bmp = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  const escala = Math.min(1, MAX_LADO / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * escala);
  canvas.height = Math.round(bmp.height * escala);
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { dataUrl, base64: dataUrl.split(",")[1], mediaType: "image/jpeg" };
}

async function analisar() {
  if (!fotoAtual || carregando) return;
  const nota = notaAtual.trim();
  carregando = true;
  erroAnalise = "";
  desenhar();
  try {
    const resp = await fetch("/api/analisar-comida", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imagem: fotoAtual.base64, mediaType: fotoAtual.mediaType, nota }),
    });
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(dados.erro || "Falha na análise.");
    analise = {
      itens: (dados.alimentos ?? []).map((a) => ({ ...a, fator: 1 })),
      confianca: dados.confianca,
      observacoes: dados.observacoes,
    };
  } catch (e) {
    erroAnalise = e instanceof TypeError ? "Sem conexão com o servidor." : e.message;
  } finally {
    carregando = false;
    desenhar();
    $("#resultado")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
