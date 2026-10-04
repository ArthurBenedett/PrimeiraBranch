import test from "node:test";
import assert from "node:assert/strict";
import {
  montarFases, duracaoTotal, localizar, inicios, kcalPorMinuto, estimarSessao, formatarTempo,
  somarItens, lerTempo, saldoDoDia, sugerirMetas, estimar1RM, melhor1RM, ultimosDias, chaveData,
} from "../public/js/logic.js";

const plano = { aquecimento: 60, forte: 120, leve: 60, rodadas: 3, desaquecimento: 60 };

test("montarFases: leve só ENTRE os fortes", () => {
  const f = montarFases(plano);
  assert.deepEqual(f.map((x) => x.tipo), ["aquecimento", "forte", "leve", "forte", "leve", "forte", "desaquecimento"]);
  assert.equal(duracaoTotal(f), 60 + 3 * 120 + 2 * 60 + 60);
});

test("montarFases: fase com 0s é ignorada", () => {
  const f = montarFases({ ...plano, aquecimento: 0, desaquecimento: 0 });
  assert.equal(f[0].tipo, "forte");
  assert.equal(f.at(-1).tipo, "forte");
});

test("localizar: fronteiras e fim", () => {
  const f = montarFases(plano);
  assert.equal(localizar(f, 0).fase.tipo, "aquecimento");
  assert.equal(localizar(f, 59.9).fase.tipo, "aquecimento");
  const l = localizar(f, 60);
  assert.equal(l.fase.tipo, "forte");
  assert.equal(l.noFase, 0);
  assert.equal(localizar(f, 100).restanteFase, 80);
  assert.equal(localizar(f, duracaoTotal(f)).fim, true);
  assert.deepEqual(inicios(f).slice(0, 3), [0, 60, 180]);
});

test("kcalPorMinuto: valores plausíveis (70 kg)", () => {
  const caminhada = kcalPorMinuto(5, 70); // ~4–5 kcal/min
  const corrida = kcalPorMinuto(10, 70); // ~11–12 kcal/min
  assert.ok(caminhada > 3.5 && caminhada < 6, String(caminhada));
  assert.ok(corrida > 10 && corrida < 14, String(corrida));
  assert.ok(kcalPorMinuto(10, 70, 5) > corrida);
});

test("estimarSessao: distância parcial", () => {
  const f = montarFases({ aquecimento: 0, forte: 360, leve: 0, rodadas: 1, desaquecimento: 0, velForte: 10 });
  assert.equal(estimarSessao(f, 360, 70).km, 1);
  assert.equal(estimarSessao(f, 180, 70).km, 0.5);
  assert.equal(estimarSessao(f, 9999, 70).km, 1);
});

test("formatarTempo", () => {
  assert.equal(formatarTempo(125), "02:05");
  assert.equal(formatarTempo(0.2), "00:01");
  assert.equal(formatarTempo(-3), "00:00");
});

test("somarItens usa o fator de porções", () => {
  const t = somarItens([
    { calorias: 200, proteina_g: 10, carboidrato_g: 30, gordura_g: 5, fator: 2 },
    { calorias: 100, proteina_g: 20, carboidrato_g: 0, gordura_g: 2 },
  ]);
  assert.deepEqual(t, { calorias: 500, proteina_g: 40, carboidrato_g: 60, gordura_g: 12 });
});

test("saldoDoDia", () => {
  const s = saldoDoDia({ consumido: 1800, estaRefeicao: 900, meta: 2500 });
  assert.equal(s.restante, -200);
  assert.equal(s.estourou, true);
  assert.equal(saldoDoDia({ consumido: 0, estaRefeicao: 500, meta: 2000 }).percentual, 25);
});

test("sugerirMetas", () => {
  const m = sugerirMetas({ pesoKg: 80, alturaCm: 180, idade: 30, sexo: "m", atividade: 1.55, objetivo: "manter" });
  assert.ok(m.metaKcal > 2500 && m.metaKcal < 3000, String(m.metaKcal));
  assert.equal(m.metaProteina, 144);
  assert.equal(sugerirMetas({ pesoKg: 0 }), null);
});

test("1RM e PR", () => {
  assert.equal(estimar1RM(100, 1), 100);
  assert.equal(estimar1RM(100, 10), 133.3);
  assert.equal(estimar1RM(0, 5), 0);
  const series = [
    { exercicio: "Supino", carga: 100, reps: 5, ts: 1 },
    { exercicio: "supino", carga: 90, reps: 10, ts: 2 },
  ];
  assert.equal(melhor1RM(series, "SUPINO", 2), 116.7);
  assert.equal(melhor1RM(series, "Supino"), 120);
});

test("datas", () => {
  assert.equal(chaveData(new Date(2026, 0, 5)), "2026-01-05");
  assert.deepEqual(ultimosDias(3, new Date(2026, 2, 1)), ["2026-02-27", "2026-02-28", "2026-03-01"]);
});

test("lerTempo", () => {
  assert.equal(lerTempo("2:00"), 120);
  assert.equal(lerTempo("0:45"), 45);
  assert.equal(lerTempo("1,5"), 90);
  assert.equal(lerTempo("3"), 180);
  assert.equal(lerTempo("2:"), 120);
  assert.equal(lerTempo("1:75"), null);
  assert.equal(lerTempo("abc"), null);
  assert.equal(lerTempo(""), null);
  assert.equal(lerTempo("-1"), null);
});
