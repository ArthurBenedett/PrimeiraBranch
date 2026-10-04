// Dados salvos no próprio aparelho (localStorage). Nada sai do celular, exceto a foto
// enviada para análise de comida.
const CHAVE = "academia:v1";

const padrao = () => ({
  perfil: {
    pesoKg: null, alturaCm: null, idade: null, sexo: "m", atividade: 1.55, objetivo: "manter",
    metaKcal: 2500, metaProteina: 150, metaAguaMl: 3000, som: true, voz: true,
  },
  refeicoes: [], // {id, data, hora, tipo, itens[], totais}
  agua: {}, // {"2026-10-04": 750}
  series: [], // {id, ts, data, exercicio, carga, reps}
  esteira: [], // {id, ts, data, duracaoSeg, kcal, km, rodadas}
  peso: [], // {data, kg}
  planoEsteira: null,
});

function ler() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) {
      const salvo = JSON.parse(bruto);
      const base = padrao();
      return { ...base, ...salvo, perfil: { ...base.perfil, ...salvo.perfil } };
    }
  } catch {
    /* storage bloqueado ou JSON corrompido: começa do zero */
  }
  return padrao();
}

export const db = ler();

export function salvar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(db));
    return true;
  } catch {
    return false;
  }
}

export const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function exportar() {
  return JSON.stringify(db, null, 2);
}

export function importar(texto) {
  const dados = JSON.parse(texto);
  if (typeof dados !== "object" || dados === null || !Array.isArray(dados.refeicoes)) {
    throw new Error("Arquivo de backup inválido.");
  }
  const base = padrao();
  Object.assign(db, base, dados, { perfil: { ...base.perfil, ...dados.perfil } });
  salvar();
}

export function apagarTudo() {
  Object.assign(db, padrao());
  salvar();
}
