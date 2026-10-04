// Comida: tira/escolhe a foto, a IA estima os alimentos e o app calcula o impacto no seu dia.
import { db, salvar, novoId } from "./storage.js";
import { somarItens, saldoDoDia, chaveData, tipoRefeicaoPorHora } from "./logic.js";
import { $, $$, esc, num, avisar, fmt } from "./util.js";

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
    <p class="sub">Fotografe o prato e veja as calorias e macros na hora.</p>

    <div class="card">
      ${!statusApi.analiseDeFoto ? `<div class="aviso ruim" style="margin-bottom:12px">${
        statusApi.offline
          ? "Sem conexão com o servidor: a análise por foto precisa de internet. Você ainda pode adicionar manualmente."
          : "A análise por foto está desativada (o servidor não tem a chave ANTHROPIC_API_KEY). Você ainda pode adicionar manualmente."
      }</div>` : ""}
      <label class="drop ${fotoAtual ? "tem" : ""}" for="foto" id="drop">
        ${fotoAtual ? `<img src="${fotoAtual.dataUrl}" alt="Foto da refeição">` : `<span style="font-size:2.4rem" aria-hidden="true">📷</span><b>Tirar foto ou escolher da galeria</b><span class="peq">JPG, PNG ou WebP</span>`}
      </label>
      <input id="foto" type="file" accept="image/*" capture="environment" hidden>
      <div style="margin-top:12px">
        <label for="nota">Detalhes (opcional — melhora a precisão)</label>
        <input id="nota" value="${esc(notaAtual)}" placeholder="Ex.: 200 g de arroz, frango de 150 g, sem óleo" maxlength="300">
      </div>
      <button class="primario grande" id="b-analisar" style="margin-top:12px" ${!fotoAtual || carregando || !statusApi.analiseDeFoto ? "disabled" : ""}>
        ${carregando ? "Analisando…" : "🔍 Analisar refeição"}
      </button>
      ${carregando ? `<div class="linha" style="justify-content:center;margin-top:12px"><div class="spinner"></div><span class="suave">Identificando alimentos…</span></div>` : ""}
      ${erroAnalise ? `<p class="erro" role="alert">${esc(erroAnalise)}</p>` : ""}
    </div>

    ${analise ? resultadoHtml() : ""}

    <details class="card" id="manual">
      <summary><b>➕ Adicionar manualmente</b></summary>
      <form id="form-manual" style="margin-top:12px" autocomplete="off">
        <label for="m-nome">Alimento</label><input id="m-nome" required maxlength="80">
        <div class="grade" style="margin-top:8px">
          <div><label for="m-kcal">Calorias (kcal)</label><input id="m-kcal" type="number" inputmode="decimal" min="0" step="any" required></div>
          <div><label for="m-prot">Proteína (g)</label><input id="m-prot" type="number" inputmode="decimal" min="0" step="any"></div>
          <div><label for="m-carb">Carboidrato (g)</label><input id="m-carb" type="number" inputmode="decimal" min="0" step="any"></div>
          <div><label for="m-gord">Gordura (g)</label><input id="m-gord" type="number" inputmode="decimal" min="0" step="any"></div>
        </div>
        <button class="grande" style="margin-top:12px">Adicionar à refeição</button>
      </form>
    </details>

    <div class="card">
      <div class="linha espaco"><h2>Hoje</h2><b>${fmt(tot.calorias)} / ${fmt(db.perfil.metaKcal)} kcal</b></div>
      ${hoje.length ? hoje.slice().reverse().map(refeicaoHtml).join("") : `<p class="suave">Nenhuma refeição registrada hoje.</p>`}
    </div>
  `;

  $("#foto").addEventListener("change", aoEscolherFoto);
  $("#nota").addEventListener("input", (e) => (notaAtual = e.target.value));
  $("#b-analisar").addEventListener("click", analisar);
  $("#form-manual").addEventListener("submit", adicionarManual);
  $$("[data-del-ref]").forEach((b) => b.addEventListener("click", () => removerRefeicao(b.dataset.delRef)));
  if (analise) ligarResultado();
}

function resultadoHtml() {
  const t = somarItens(analise.itens);
  const consumido = consumidoHoje();
  const s = saldoDoDia({ consumido, estaRefeicao: t.calorias, meta: db.perfil.metaKcal });
  const corBarra = s.estourou ? "var(--forte)" : "var(--acento)";
  const aviso = { baixa: "Confiança baixa: confira as porções.", media: "Estimativa aproximada — ajuste as porções se precisar.", alta: "" }[analise.confianca] ?? "";
  return `<div class="card" id="resultado">
    <h2>Resultado</h2>
    ${aviso ? `<div class="aviso" style="margin-bottom:10px">${esc(aviso)}</div>` : ""}
    ${analise.observacoes ? `<p class="suave peq">${esc(analise.observacoes)}</p>` : ""}
    ${analise.itens.length ? analise.itens.map(itemHtml).join("") : `<p class="suave">Nenhum alimento identificado. Tente outra foto ou adicione manualmente.</p>`}
    <div class="linha espaco" style="margin-top:12px;align-items:flex-end">
      <div><div class="suave peq">Total desta refeição</div><div class="total" id="r-total">${fmt(t.calorias)} kcal</div></div>
      <div class="peq suave" style="text-align:right" id="r-macros">P ${fmt(t.proteina_g, 1)} g<br>C ${fmt(t.carboidrato_g, 1)} g<br>G ${fmt(t.gordura_g, 1)} g</div>
    </div>
    <div style="margin-top:12px">
      <div class="linha espaco peq"><span>Seu dia com esta refeição</span><b id="r-pct">${s.percentual}% da meta</b></div>
      <div class="barra"><i id="r-barra" style="width:${Math.min(100, s.percentual)}%;background:${corBarra}"></i></div>
      <p class="peq ${s.estourou ? "erro" : "suave"}" id="r-saldo">${saldoTexto(consumido, s)}</p>
    </div>
    <div class="linha quebra" style="margin-top:12px">
      <div class="col"><label for="r-tipo">Refeição</label>
        <select id="r-tipo">${TIPOS.map((x) => `<option ${x === tipoRefeicaoPorHora(new Date().getHours()) ? "selected" : ""}>${x}</option>`).join("")}</select></div>
    </div>
    <div class="linha" style="margin-top:12px">
      <button class="primario col" id="b-salvar" ${analise.itens.length ? "" : "disabled"}>✔ Registrar refeição</button>
      <button class="col" id="b-descartar">Descartar</button>
    </div>
  </div>`;
}

function saldoTexto(consumido, s) {
  return s.estourou
    ? `Passa ${fmt(-s.restante)} kcal da meta (já consumido: ${fmt(consumido)} kcal).`
    : `Depois desta refeição ainda restam ${fmt(s.restante)} kcal (já consumido: ${fmt(consumido)} kcal).`;
}

function itemHtml(it, i) {
  return `<div class="item" data-i="${i}">
    <div class="linha espaco"><span class="nome">${esc(it.nome)}</span>
      <button class="mini fantasma perigo" data-rem="${i}" aria-label="Remover ${esc(it.nome)}">✕</button></div>
    <div class="macros">${esc(it.porcao)} · <b class="item-kcal">${fmt(it.calorias * (it.fator ?? 1))}</b> kcal · P ${fmt(it.proteina_g * (it.fator ?? 1), 1)} · C ${fmt(it.carboidrato_g * (it.fator ?? 1), 1)} · G ${fmt(it.gordura_g * (it.fator ?? 1), 1)}</div>
    <div class="linha" style="margin-top:6px"><label for="f-${i}" style="margin:0">Porções</label>
      <input class="fator" id="f-${i}" type="number" inputmode="decimal" min="0.25" max="10" step="0.25" value="${it.fator ?? 1}" data-fator="${i}"></div>
  </div>`;
}

function refeicaoHtml(r) {
  return `<div class="refeicao">
    <div class="linha espaco"><b>${esc(r.tipo)} <span class="suave peq">${esc(r.hora)}</span></b>
      <span>${fmt(r.totais.calorias)} kcal <button class="mini fantasma perigo" data-del-ref="${r.id}" aria-label="Apagar refeição">🗑</button></span></div>
    <div class="peq suave">${r.itens.map((i) => esc(i.nome)).join(", ")}</div>
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
  $("#r-total").textContent = `${fmt(t.calorias)} kcal`;
  $("#r-macros").innerHTML = `P ${fmt(t.proteina_g, 1)} g<br>C ${fmt(t.carboidrato_g, 1)} g<br>G ${fmt(t.gordura_g, 1)} g`;
  $("#r-pct").textContent = `${s.percentual}% da meta`;
  const barra = $("#r-barra");
  barra.style.width = `${Math.min(100, s.percentual)}%`;
  barra.style.background = s.estourou ? "var(--forte)" : "var(--acento)";
  const saldo = $("#r-saldo");
  saldo.textContent = saldoTexto(consumido, s);
  saldo.className = `peq ${s.estourou ? "erro" : "suave"}`;
  $$(".item").forEach((el) => {
    const it = analise.itens[Number(el.dataset.i)];
    $(".item-kcal", el).textContent = fmt(it.calorias * (it.fator ?? 1));
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
