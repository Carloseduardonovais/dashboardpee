# Dashboard PEE Brasil

Dashboard estático (HTML + JS + Plotly.js) com os resultados dos projetos de
Programas de Eficiência Energética (PEE) e um mapa estratégico das chamadas
públicas (CPPs) abertas por concessionária/estado.

## Como funciona

- `scripts/etl.py` — busca os dados publicados da planilha **PEE - Brasil**
  (Google Sheets → Arquivo → Compartilhar → Publicar na web, uma aba por vez
  em CSV) e gera os arquivos estáticos em `public/data/`:
  - `resultados.json` — projetos submetidos/julgados por distribuidora
  - `editais.json` — chamadas públicas (CPPs), por estado
  - `meta.json` — data/hora da última atualização
  - `br_states.geojson` — geometria dos estados (gerado uma vez, não muda)
- `public/` — o site em si (`index.html`, `app.js`, `style.css`). Sem build
  step: o JS lê os JSONs em tempo de execução e renderiza tudo no navegador.

## Atualizar os dados manualmente

```
py scripts/etl.py
```

Isso sobrescreve os arquivos em `public/data/`. Basta commitar e dar push.

## Atualização automática

`.github/workflows/update.yml` roda o ETL todo dia (cron `0 9 * * *`, ~06h em
Brasília) e comita os JSONs atualizados. Cada push para a branch principal
faz o Netlify republicar o site automaticamente.

Para rodar manualmente: aba **Actions** do repositório no GitHub → workflow
"Atualizar dados do dashboard PEE" → **Run workflow**.

## Publicar no Netlify

1. [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import
   an existing project** → conecte este repositório do GitHub.
2. Build settings (já configurados em `netlify.toml`):
   - Build command: `python scripts/etl.py`
   - Publish directory: `public`
3. Deploy. A cada push (manual ou via Action agendada), o Netlify republica.

## Adicionar uma nova concessionária na planilha

1. Crie a aba de resultados na planilha "PEE - Brasil" (mesmas colunas das
   abas existentes: `Título Projeto`, `Tipologia`, `Usos Finais`, `Empresa
   Proponente`, `Nome do cliente beneficiado`, `RCB PEE`, `Valor total do
   Projeto`, `Valor Solicitado ao PEE`, `Contrapartida`, `Pontuação
   Alcançada`, `Resultado`, `Ano` — e `Distribuidora` se a aba cobrir mais de
   uma distribuidora).
2. Publique a aba: **Arquivo → Compartilhar → Publicar na web**, selecione a
   aba específica, formato CSV, copie o link gerado e extraia o `gid`.
3. Em `scripts/etl.py`, adicione a entrada em `SHEET_GIDS` (e em
   `DISTRIBUIDORA_UF` o estado correspondente).
4. Rode `py scripts/etl.py` para validar e dê commit/push.

## Logos

Coloque os arquivos em `public/assets/logos/`:
`acao-engenharia.png`, `enel.png`, `edp.png`, `cpfl.png`,
`neoenergia.png`, `equatorial.png`. Logos ausentes são simplesmente
ocultados (não quebram o layout).

Created by Carlos Oliveira
