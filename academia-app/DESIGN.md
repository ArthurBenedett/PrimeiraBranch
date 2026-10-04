# Academia Pro: sistema visual

Mundo visual: **quadro de treino de academia**. Chão de borracha (tinta), giz (fundo), anilhas de competição (cores com significado). Detalhes do que está construído em `public/css/style.css`.

## Cor
Estratégia: restrita (neutros + cor só quando significa algo). Esteira em andamento é cor cheia (a tela vira a fase).

| Papel | Claro | Escuro |
|---|---|---|
| Fundo (giz / borracha) | `#eff0ec` | `#0e100f` |
| Folha (campos) | `#ffffff` | `#171a18` |
| Tinta | `#0f1210` | `#f1f2ee` |
| Tinta secundária | `#454b47` | `#bcc1bd` |
| Linha | `#d2d5cf` | `#2d322f` |

Anilhas (iguais nos dois temas): forte `#d4202a` (25 kg), leve `#12804a` (10 kg), aquecimento `#f2b705` (15 kg, texto tinta), desaquecimento `#1f55b5` (20 kg). Contraste do texto sobre cada fase ≥ 4,5:1.
Ação primária: tinta sobre fundo (invertida). Perigo: `#b3141e` / `#ff6b70`.

## Tipografia
- **Barlow Condensed** 600/700/800 (maiúsculas): títulos, números, relógio. Números sempre tabulares.
- **Barlow** 400/500/600: texto, campos, botões.
- Autohospedadas em `public/fonts` (licença SIL OFL incluída). Escala: 12 / 14 / 16 / 20 / 24 / 44 px; relógio da esteira até 15 rem.

## Componentes
- **Bloco:** seção separada por régua de 2 px (principal) ou 1 px (secundária). Sem cartões aninhados.
- **Régua segmentada:** 10 divisões, mede calorias, proteína, água; parte amarela = a refeição em análise; vermelha ao passar da meta.
- **Placas (esteira):** FORTE vermelha e LEVE verde, com ajuste de ±15 s.
- **Botões:** raio 8 px, borda 1,5 px, primário preenchido de tinta; chips 99 px. Alvo ≥ 44 px.
- **Ícones:** traço 2 px, pontas redondas, desenhados em `util.js` (`icone()`); sem emoji.

## Movimento
Uma ideia: a troca de fase da esteira (cor de fundo em 400 ms + batida do relógio). O resto só transmite estado (réguas, varredura da análise). `prefers-reduced-motion` respeitado.

## Evitar
Cartões iguais com ícone+título, anel de progresso, eyebrow acima de títulos, gradientes, emoji como ícone, cor sem significado.
