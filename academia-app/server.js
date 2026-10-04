// Servidor do app: entrega os arquivos de /public e analisa fotos de comida com o Claude.
// A chave da API fica só aqui no servidor — nunca é enviada ao navegador.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, FOOD_SCHEMA } from "./prompt-comida.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const MAX_BODY_BYTES = 8 * 1024 * 1024; // foto já reduzida no navegador
const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const RATE_LIMIT = { janelaMs: 60_000, max: 20 };

carregarEnv();
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

const acessos = new Map(); // ip -> timestamps recentes

function limitado(ip) {
  const agora = Date.now();
  const recentes = (acessos.get(ip) || []).filter((t) => agora - t < RATE_LIMIT.janelaMs);
  recentes.push(agora);
  acessos.set(ip, recentes);
  return recentes.length > RATE_LIMIT.max;
}

async function analisarComida({ imagem, mediaType, nota }) {
  const mensagem = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "low", format: { type: "json_schema", schema: FOOD_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imagem } },
          {
            type: "text",
            text: nota
              ? `Analise esta refeição. Informação do usuário: ${nota}`
              : "Analise esta refeição.",
          },
        ],
      },
    ],
  });

  if (mensagem.stop_reason === "refusal") {
    throw new HttpError(422, "Não consegui analisar essa imagem.");
  }
  const texto = mensagem.content.find((b) => b.type === "text")?.text;
  if (!texto || mensagem.stop_reason === "max_tokens") {
    throw new HttpError(502, "A resposta da análise veio incompleta. Tente de novo.");
  }
  return JSON.parse(texto);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let tamanho = 0;
    const partes = [];
    req.on("data", (c) => {
      tamanho += c.length;
      if (tamanho > MAX_BODY_BYTES) {
        reject(new HttpError(413, "Imagem muito grande."));
        req.destroy();
        return;
      }
      partes.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(partes).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res, status, corpo) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(corpo));
}

async function rotaApi(req, res, url) {
  if (url.pathname === "/api/status" && req.method === "GET") {
    return json(res, 200, { analiseDeFoto: Boolean(client), modelo: client ? MODEL : null });
  }
  if (url.pathname === "/api/analisar-comida" && req.method === "POST") {
    if (!client) {
      return json(res, 503, { erro: "Análise por foto desativada: configure ANTHROPIC_API_KEY no servidor." });
    }
    if (limitado(req.socket.remoteAddress)) {
      return json(res, 429, { erro: "Muitas análises seguidas. Aguarde um minuto." });
    }
    let dados;
    try {
      dados = JSON.parse(await lerCorpo(req));
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(400, "Pedido inválido.");
    }
    const { imagem, mediaType } = dados;
    const nota = typeof dados.nota === "string" ? dados.nota.slice(0, 300) : "";
    if (typeof imagem !== "string" || !imagem || !MEDIA_TYPES.has(mediaType)) {
      throw new HttpError(400, "Envie uma imagem JPEG, PNG, WebP ou GIF.");
    }
    return json(res, 200, await analisarComida({ imagem, mediaType, nota }));
  }
  throw new HttpError(404, "Rota não encontrada.");
}

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function arquivoEstatico(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const alvo = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!alvo.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end("Acesso negado");
    return;
  }
  fs.readFile(alvo, (err, conteudo) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Não encontrado");
      return;
    }
    res.writeHead(200, {
      "Content-Type": TIPOS[path.extname(alvo)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(conteudo);
  });
}

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) return await rotaApi(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "Método não permitido.");
    arquivoEstatico(req, res, url);
  } catch (e) {
    if (e instanceof HttpError) return json(res, e.status, { erro: e.message });
    const status = e instanceof Anthropic.APIError ? e.status : undefined;
    console.error("Erro:", status ?? "", e.message);
    if (status === 401) return json(res, 502, { erro: "Chave da API inválida no servidor." });
    if (status === 429) return json(res, 429, { erro: "Limite da API atingido. Tente em instantes." });
    json(res, 500, { erro: "Erro ao analisar a refeição. Tente novamente." });
  }
});

// Lê um .env simples (CHAVE=valor) sem depender de pacote extra.
function carregarEnv() {
  const arquivo = path.join(here, ".env");
  if (!fs.existsSync(arquivo)) return;
  for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  servidor.listen(PORT, "0.0.0.0", () => {
    console.log(`App da academia rodando em http://localhost:${PORT}`);
    console.log(client ? `Análise de fotos ativa (${MODEL}).` : "Sem ANTHROPIC_API_KEY: análise de fotos desativada (o resto funciona).");
  });
}

export { servidor };
