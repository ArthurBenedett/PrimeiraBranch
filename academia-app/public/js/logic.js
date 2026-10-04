// Lógica pura (sem DOM) — usada pelo app e testada em test/logic.test.js.

// ---------- Esteira intervalada ----------

export const PLANO_PADRAO = {
  aquecimento: 300, // segundos
  forte: 120, // tempo MÁXIMO em ritmo forte (ex.: 2 min)
  leve: 60, // tempo MÍNIMO de recuperação em ritmo leve
  rodadas: 6,
  desaquecimento: 180,
  velAquecimento: 6, // km/h
  velForte: 12,
  velLeve: 6,
  velDesaquecimento: 5,
  inclinacao: 0, // %
};

export const NOME_FASE = {
  aquecimento: "Aquecimento",
  forte: "FORTE",
  leve: "Leve",
  desaquecimento: "Desaquecimento",
};

// Monta a lista de fases. O leve fica ENTRE os fortes (não depois do último).
export function montarFases(plano) {
  const p = { ...PLANO_PADRAO, ...plano };
  const fases = [];
  const add = (tipo, duracao, velocidade, rodada) => {
    if (duracao > 0) fases.push({ tipo, duracao, velocidade, rodada });
  };
  add("aquecimento", p.aquecimento, p.velAquecimento, 0);
  for (let r = 1; r <= p.rodadas; r++) {
    add("forte", p.forte, p.velForte, r);
    if (r < p.rodadas) add("leve", p.leve, p.velLeve, r);
  }
  add("desaquecimento", p.desaquecimento, p.velDesaquecimento, 0);
  return fases;
}

export function duracaoTotal(fases) {
  return fases.reduce((s, f) => s + f.duracao, 0);
}

// Onde estamos após `decorrido` segundos. `fim: true` quando acabou.
export function localizar(fases, decorrido) {
  let inicio = 0;
  for (let i = 0; i < fases.length; i++) {
    const fim = inicio + fases[i].duracao;
    if (decorrido < fim) {
      return { indice: i, fase: fases[i], noFase: decorrido - inicio, restanteFase: fim - decorrido, fim: false };
    }
    inicio = fim;
  }
  const ultimo = fases.length - 1;
  return { indice: ultimo, fase: fases[ultimo], noFase: fases[ultimo]?.duracao ?? 0, restanteFase: 0, fim: true };
}

// Início (em segundos) de cada fase.
export function inicios(fases) {
  let t = 0;
  return fases.map((f) => {
    const i = t;
    t += f.duracao;
    return i;
  });
}

// Gasto energético pela equação do ACSM (caminhada ≤ 7 km/h, corrida acima).
export function kcalPorMinuto(velKmh, pesoKg, inclinacaoPct = 0) {
  const v = (velKmh * 1000) / 60; // m/min
  const g = inclinacaoPct / 100;
  const vo2 = velKmh <= 7 ? 0.1 * v + 1.8 * v * g + 3.5 : 0.2 * v + 0.9 * v * g + 3.5; // ml/kg/min
  return (vo2 * pesoKg * 5) / 1000;
}

// Estima calorias e distância até `decorrido` segundos.
export function estimarSessao(fases, decorrido, pesoKg, inclinacao = 0) {
  let t = 0;
  let kcal = 0;
  let km = 0;
  for (const f of fases) {
    const dentro = Math.max(0, Math.min(f.duracao, decorrido - t));
    if (dentro <= 0) break;
    kcal += kcalPorMinuto(f.velocidade, pesoKg, inclinacao) * (dentro / 60);
    km += f.velocidade * (dentro / 3600);
    t += f.duracao;
  }
  return { kcal: Math.round(kcal), km: Math.round(km * 100) / 100 };
}

// Lê "2:30" (min:seg) ou "2" / "1,5" (minutos) e devolve segundos; null se inválido.
export function lerTempo(texto) {
  const t = String(texto ?? "").trim().replace(",", ".");
  if (!t) return null;
  if (t.includes(":")) {
    const [m, s = ""] = t.split(":");
    const min = Number(m);
    const seg = s === "" ? 0 : Number(s);
    if (![min, seg].every(Number.isFinite) || min < 0 || seg < 0 || seg >= 60) return null;
    return Math.round(min * 60 + seg);
  }
  const min = Number(t);
  return Number.isFinite(min) && min >= 0 ? Math.round(min * 60) : null;
}

export function formatarTempo(segundos) {
  const s = Math.max(0, Math.ceil(segundos));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// ---------- Nutrição ----------

export const MACROS = ["calorias", "proteina_g", "carboidrato_g", "gordura_g"];

// Soma os itens; cada item pode ter `fator` (porções) que multiplica tudo.
export function somarItens(itens) {
  const total = { calorias: 0, proteina_g: 0, carboidrato_g: 0, gordura_g: 0 };
  for (const it of itens) {
    const f = Number.isFinite(it.fator) ? it.fator : 1;
    for (const m of MACROS) total[m] += (Number(it[m]) || 0) * f;
  }
  for (const m of MACROS) total[m] = Math.round(total[m] * 10) / 10;
  total.calorias = Math.round(total.calorias);
  return total;
}

// Quanto falta da meta depois de comer isto.
export function saldoDoDia({ consumido, estaRefeicao, meta }) {
  const depois = consumido + estaRefeicao;
  return {
    depois,
    restante: Math.round(meta - depois),
    percentual: meta > 0 ? Math.round((depois / meta) * 100) : 0,
    estourou: depois > meta,
  };
}

// Metas sugeridas: Mifflin-St Jeor × fator de atividade, ajustada pelo objetivo.
export function sugerirMetas({ pesoKg, alturaCm, idade, sexo, atividade, objetivo }) {
  if (![pesoKg, alturaCm, idade].every((n) => n > 0)) return null;
  const tmb = 10 * pesoKg + 6.25 * alturaCm - 5 * idade + (sexo === "f" ? -161 : 5);
  const ajuste = { cortar: -400, manter: 0, ganhar: 300 }[objetivo] ?? 0;
  const kcal = Math.round((tmb * atividade + ajuste) / 10) * 10;
  const protPorKg = objetivo === "cortar" ? 2.2 : 1.8;
  return {
    metaKcal: kcal,
    metaProteina: Math.round(pesoKg * protPorKg),
    metaAguaMl: Math.round((pesoKg * 40) / 250) * 250,
  };
}

// ---------- Treino ----------

// Estimativa de 1RM (Epley). Acima de ~12 reps perde precisão.
export function estimar1RM(carga, reps) {
  if (!(carga > 0) || !(reps > 0)) return 0;
  return reps === 1 ? carga : Math.round(carga * (1 + reps / 30) * 10) / 10;
}

export function volume(series) {
  return series.reduce((s, x) => s + x.carga * x.reps, 0);
}

// Melhor 1RM estimado de um exercício antes de `ate` (timestamp).
export function melhor1RM(series, exercicio, ate = Infinity) {
  let melhor = 0;
  for (const s of series) {
    if (s.exercicio.toLowerCase() === exercicio.toLowerCase() && s.ts < ate) {
      melhor = Math.max(melhor, estimar1RM(s.carga, s.reps));
    }
  }
  return melhor;
}

// ---------- Datas ----------

export function chaveData(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function ultimosDias(n, hoje = new Date()) {
  const dias = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - i);
    dias.push(chaveData(d));
  }
  return dias;
}

export function tipoRefeicaoPorHora(hora) {
  if (hora < 10) return "Café da manhã";
  if (hora < 15) return "Almoço";
  if (hora < 18) return "Lanche";
  return "Jantar";
}
