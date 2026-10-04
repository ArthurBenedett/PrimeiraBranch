// Perfil: metas, sugestão automática, preferências de alarme e backup.
import { db, salvar, exportar, importar, apagarTudo } from "./storage.js";
import { sugerirMetas } from "./logic.js";
import { $, $$, esc, num, avisar, fmt } from "./util.js";

const raiz = () => $("#view-perfil");

export function renderPerfil() {
  const p = db.perfil;
  raiz().innerHTML = `
    <h1>Perfil e metas</h1>
    <p class="sub">Usado para calcular calorias da esteira e as metas do dia.</p>

    <form class="card" id="form-perfil" autocomplete="off">
      <h2>Seus dados</h2>
      <div class="grade">
        <div><label for="p-peso">Peso (kg)</label><input id="p-peso" name="pesoKg" type="number" inputmode="decimal" step="0.1" min="20" max="400" value="${p.pesoKg ?? ""}"></div>
        <div><label for="p-alt">Altura (cm)</label><input id="p-alt" name="alturaCm" type="number" inputmode="numeric" min="100" max="250" value="${p.alturaCm ?? ""}"></div>
        <div><label for="p-idade">Idade</label><input id="p-idade" name="idade" type="number" inputmode="numeric" min="12" max="100" value="${p.idade ?? ""}"></div>
        <div><label for="p-sexo">Sexo</label><select id="p-sexo" name="sexo"><option value="m" ${p.sexo === "m" ? "selected" : ""}>Masculino</option><option value="f" ${p.sexo === "f" ? "selected" : ""}>Feminino</option></select></div>
        <div><label for="p-ativ">Nível de atividade</label><select id="p-ativ" name="atividade">
          ${[[1.2, "Sedentário"], [1.375, "Leve (1–3x/sem)"], [1.55, "Moderado (3–5x/sem)"], [1.725, "Intenso (6–7x/sem)"]]
            .map(([v, t]) => `<option value="${v}" ${p.atividade === v ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div><label for="p-obj">Objetivo</label><select id="p-obj" name="objetivo">
          ${[["cortar", "Perder gordura"], ["manter", "Manter"], ["ganhar", "Ganhar massa"]]
            .map(([v, t]) => `<option value="${v}" ${p.objetivo === v ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      </div>
      <button type="button" class="mini" id="b-sugerir" style="margin-top:10px">✨ Sugerir metas com esses dados</button>

      <h2 style="margin-top:18px">Metas diárias</h2>
      <div class="grade grade3">
        <div><label for="p-kcal">Calorias</label><input id="p-kcal" name="metaKcal" type="number" inputmode="numeric" min="800" max="8000" value="${p.metaKcal}"></div>
        <div><label for="p-prot">Proteína (g)</label><input id="p-prot" name="metaProteina" type="number" inputmode="numeric" min="0" max="500" value="${p.metaProteina}"></div>
        <div><label for="p-agua">Água (ml)</label><input id="p-agua" name="metaAguaMl" type="number" inputmode="numeric" min="500" max="10000" step="250" value="${p.metaAguaMl}"></div>
      </div>

      <h2 style="margin-top:18px">Alarmes</h2>
      <div class="linha"><input type="checkbox" id="p-som" name="som" ${p.som ? "checked" : ""} style="width:22px;min-height:22px"><label for="p-som" style="margin:0">Bipes</label></div>
      <div class="linha" style="margin-top:8px"><input type="checkbox" id="p-voz" name="voz" ${p.voz ? "checked" : ""} style="width:22px;min-height:22px"><label for="p-voz" style="margin:0">Voz avisando as trocas de ritmo</label></div>

      <button class="primario grande" style="margin-top:16px">Salvar</button>
    </form>

    <div class="card">
      <h2>Seus dados</h2>
      <p class="peq suave">Tudo fica salvo só neste aparelho. Faça backup de vez em quando.</p>
      <div class="linha quebra">
        <button class="mini" id="b-exp">⬇ Exportar backup</button>
        <button class="mini" id="b-imp">⬆ Importar backup</button>
        <button class="mini perigo" id="b-apagar">Apagar tudo</button>
      </div>
      <input type="file" id="arq-imp" accept="application/json,.json" hidden>
    </div>
  `;

  const form = $("#form-perfil");
  $("#b-sugerir").addEventListener("click", () => {
    const f = form.elements;
    const s = sugerirMetas({
      pesoKg: num(f.pesoKg.value), alturaCm: num(f.alturaCm.value), idade: num(f.idade.value),
      sexo: f.sexo.value, atividade: Number(f.atividade.value), objetivo: f.objetivo.value,
    });
    if (!s) return avisar("Preencha peso, altura e idade.");
    f.metaKcal.value = s.metaKcal;
    f.metaProteina.value = s.metaProteina;
    f.metaAguaMl.value = s.metaAguaMl;
    avisar(`Sugestão: ${fmt(s.metaKcal)} kcal · ${s.metaProteina} g de proteína`);
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = form.elements;
    const opc = (el) => (el.value === "" ? null : num(el.value, null));
    Object.assign(db.perfil, {
      pesoKg: opc(f.pesoKg), alturaCm: opc(f.alturaCm), idade: opc(f.idade),
      sexo: f.sexo.value, atividade: Number(f.atividade.value), objetivo: f.objetivo.value,
      metaKcal: num(f.metaKcal.value, db.perfil.metaKcal), metaProteina: num(f.metaProteina.value, db.perfil.metaProteina),
      metaAguaMl: num(f.metaAguaMl.value, db.perfil.metaAguaMl), som: f.som.checked, voz: f.voz.checked,
    });
    avisar(salvar() ? "Salvo ✔" : "Não consegui salvar (armazenamento bloqueado).");
  });

  $("#b-exp").addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([exportar()], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `academia-backup-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $("#b-imp").addEventListener("click", () => $("#arq-imp").click());
  $("#arq-imp").addEventListener("change", async (e) => {
    const arq = e.target.files?.[0];
    if (!arq) return;
    try {
      if (!confirm("Importar substitui os dados atuais deste aparelho. Continuar?")) return;
      importar(await arq.text());
      avisar("Backup importado ✔");
      renderPerfil();
    } catch (err) {
      avisar(err.message || "Arquivo inválido.");
    }
  });
  $("#b-apagar").addEventListener("click", () => {
    if (confirm("Apagar TODOS os dados (refeições, treinos, peso)? Não dá para desfazer.")) {
      apagarTudo();
      renderPerfil();
      avisar("Dados apagados");
    }
  });
}
