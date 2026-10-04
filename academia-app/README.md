# Academia Pro

App para quem treina: esteira intervalada com alarme, calorias por foto, registro de treino e progresso.
Funciona no celular (PWA instalável) e guarda os dados no próprio aparelho.

## Funcionalidades

- **🏃 Esteira intervalada** — você define o tempo **forte** (máximo, ex.: 2:00) e o tempo **leve** (mínimo/recuperação, ex.: 1:00),
  rodadas, velocidades, aquecimento e desaquecimento. A cada troca toca um alarme diferente (subindo = forte, descendo = leve),
  com contagem 3-2-1, vibração e voz ("Forte! 12 quilômetros por hora"). Tem pausar, pular fase, modelos prontos,
  estimativa de calorias/distância (equação do ACSM) e tenta manter a tela ligada.
- **🍽️ Calorias por foto** — tire foto do prato; o Claude identifica os alimentos, estima porções, calorias e macros.
  Você ajusta as porções, e o app mostra quanto aquela refeição representa da sua meta do dia e quanto ainda resta.
  Também dá para adicionar alimentos manualmente.
- **🏋️ Treino** — registra carga × repetições, estima 1RM, avisa **recorde pessoal** e tem cronômetro de descanso com alarme.
- **📊 Hoje** — calorias, proteína, água, volume de treino, km de esteira e evolução do peso.
- **⚙️ Perfil** — metas sugeridas (Mifflin-St Jeor), alarmes e backup (exportar/importar JSON).

## Como rodar

```bash
cd academia-app
npm install
cp .env.example .env      # coloque sua ANTHROPIC_API_KEY (só necessária para a foto)
npm start                 # http://localhost:3000
npm test                  # testes da lógica
```

Sem `ANTHROPIC_API_KEY` tudo funciona, menos a análise por foto (o app avisa e oferece o cadastro manual).
A chave fica só no servidor; o navegador nunca a vê. O modelo pode ser trocado com `CLAUDE_MODEL` (padrão `claude-opus-5-5`).

### Usar no celular

Abra `http://IP-DO-SEU-COMPUTADOR:3000` com o celular na mesma rede. O botão de foto usa a câmera sem precisar de HTTPS.
Para **instalar como app**, **manter a tela ligada** e usar o modo offline, o navegador exige HTTPS (ou `localhost`):
publique em um serviço com HTTPS ou use um túnel.

## Limitações

- O alarme depende do app estar aberto. Com a tela bloqueada, navegadores móveis podem pausar os bipes
  (por isso o app pede para manter a tela ligada).
- Calorias por foto são **estimativas**; informe quantidades no campo de detalhes para melhorar.
- Os dados ficam no aparelho: faça backup pelo Perfil.

## Estrutura

```
server.js            servidor: arquivos estáticos + POST /api/analisar-comida (Claude com visão)
public/js/logic.js   lógica pura (esteira, calorias, 1RM, metas), coberta por test/
public/js/*.js       telas: esteira, comida, treino, hoje, perfil + alarmes e armazenamento
```
