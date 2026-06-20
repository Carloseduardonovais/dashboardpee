// Dashboard PEE Brasil — lê os JSONs gerados pelo ETL (scripts/etl.py) e
// renderiza tudo no navegador com Plotly.js. Nenhum build step necessário:
// para atualizar os dados, só sobrescrever os arquivos em public/data/.

const COLORS = {
  bar: "#5470ff",
  line: "#ff5c5c",
  ok: "#2fa86a",
  warn: "#c98a2c",
  danger: "#d22f2f",
  neutro: "#7a8099",
  grid: "#20253a",
  text: "#e9ebf3",
};

const PLOTLY_LAYOUT_BASE = {
  paper_bgcolor: "transparent",
  plot_bgcolor: "transparent",
  font: { color: COLORS.text, size: 12, family: "Inter, Segoe UI, sans-serif" },
  margin: { t: 10, r: 50, l: 60, b: 90 },
  xaxis: { gridcolor: COLORS.grid, tickangle: -35 },
  yaxis: { gridcolor: COLORS.grid },
  legend: { orientation: "h", y: 1.12 },
};
const PLOTLY_CONFIG = { displaylogo: false, responsive: true, scrollZoom: true };

const PARTNER_LOGOS = [
  { match: "Enel", file: "enel.png", label: "Enel SP" },
  { match: "EDP", file: "edp.png", label: "EDP SP" },
  { match: "CPFL", file: "cpfl.png", label: "CPFL" },
  { match: "Neoenergia", file: "neoenergia.png", label: "Neoenergia" },
  { match: "Equatorial", file: "equatorial.png", label: "Equatorial" },
];

let RESULTADOS = [];
let EDITAIS = [];
let GEOJSON = null;

function fmtBRL(v) {
  if (v == null || isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtNum(v, dec = 2) {
  if (v == null || isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function truncate(s, n = 18) {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function resultadoTagClass(r) {
  if (!r) return "neutro";
  const low = r.toLowerCase();
  if (low.includes("reprov")) return "reprovado";
  if (low.includes("aprov") || low.includes("selecion")) return "aprovado";
  return "neutro";
}

// ---------- carga de dados ----------

async function loadAll() {
  const [resultados, editais, meta, geojson] = await Promise.all([
    fetch("data/resultados.json").then(r => r.json()),
    fetch("data/editais.json").then(r => r.json()),
    fetch("data/meta.json").then(r => r.json()).catch(() => null),
    fetch("data/br_states.geojson").then(r => r.json()).catch(() => null),
  ]);
  RESULTADOS = resultados;
  EDITAIS = editais;
  GEOJSON = geojson;

  if (meta && meta.gerado_em) {
    const d = new Date(meta.gerado_em);
    document.getElementById("meta-atualizacao").textContent =
      "Atualizado em " + d.toLocaleString("pt-BR");
  } else {
    document.getElementById("meta-atualizacao").textContent = "";
  }
}

function uniqueSorted(arr, key) {
  return [...new Set(arr.map(x => x[key]).filter(Boolean))].sort();
}

function populateSelect(selectEl, values, placeholder) {
  const prev = selectEl.value;
  selectEl.innerHTML = `<option value="">${placeholder}</option>`;
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  }
  if (prev && values.includes(prev)) selectEl.value = prev;
}

function renderPartnerLogos() {
  const distribuidoras = uniqueSorted(RESULTADOS, "distribuidora");
  const container = document.getElementById("partner-logos");
  for (const partner of PARTNER_LOGOS) {
    if (!distribuidoras.some(d => d.includes(partner.match))) continue;
    const img = document.createElement("img");
    img.src = `assets/logos/${partner.file}`;
    img.alt = partner.label;
    img.title = partner.label;
    img.onerror = () => img.remove();
    container.appendChild(img);
  }
}

// ---------- filtros ----------

function applyFilters(data, { distribuidora, ano, resultado, tipologia, usos, empresa } = {}) {
  return data.filter(d =>
    (!distribuidora || d.distribuidora === distribuidora) &&
    (!ano || String(d.ano) === String(ano)) &&
    (!resultado || d.resultado === resultado) &&
    (!tipologia || d.tipologia === tipologia) &&
    (!usos || d.usos_finais === usos) &&
    (!empresa || d.empresa_proponente === empresa)
  );
}

function currentFilters(prefix) {
  const get = id => {
    const el = document.getElementById(id);
    return el ? el.value : "";
  };
  return {
    distribuidora: get(`${prefix}-distribuidora`),
    ano: get(`${prefix}-ano`),
    resultado: get(`${prefix}-resultado`),
    tipologia: get(`${prefix}-tipologia`),
    usos: get(`${prefix}-usos`),
    empresa: get(`${prefix}-empresa`),
  };
}

function clearFilters(prefix, ids, rerender) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.tagName === "SELECT") el.value = "";
    else el.value = "";
  }
  rerender();
}

// ---------- view: Visão Geral ----------

function renderKPIs(data) {
  const totalProjetos = data.length;
  const totalSolicitado = data.reduce((s, d) => s + (d.valor_solicitado_pee || 0), 0);
  const aprovados = data.filter(d => resultadoTagClass(d.resultado) === "aprovado");
  const totalAprovado = aprovados.reduce((s, d) => s + (d.valor_solicitado_pee || 0), 0);
  const totalContrapartida = data.reduce((s, d) => s + (d.contrapartida || 0), 0);
  const taxaAprovacao = totalProjetos ? (aprovados.length / totalProjetos) * 100 : 0;
  const concessionarias = new Set(data.map(d => d.distribuidora).filter(Boolean)).size;
  const beneficiarios = new Set(data.map(d => d.cliente).filter(Boolean)).size;
  const estados = new Set(data.map(d => d.uf).filter(Boolean)).size;

  const kpis = [
    { label: "Concessionárias", value: concessionarias, cls: "accent" },
    { label: "Projetos", value: totalProjetos, cls: "" },
    { label: "Valor Solicitado ao PEE", value: fmtBRL(totalSolicitado), cls: "" },
    { label: "Valor Aprovado/Selecionado", value: fmtBRL(totalAprovado), cls: "ok" },
    { label: "Contrapartida Total", value: fmtBRL(totalContrapartida), cls: "" },
    { label: "Beneficiários Atendidos", value: beneficiarios, cls: "" },
    { label: "Estados Atendidos", value: estados, cls: "" },
    { label: "Taxa de Aprovação", value: fmtNum(taxaAprovacao, 1) + "%", cls: taxaAprovacao >= 50 ? "ok" : "warn" },
  ];

  const container = document.getElementById("kpis");
  container.innerHTML = kpis.map(k => `
    <div class="kpi ${k.cls}">
      <div class="label">${k.label}</div>
      <div class="value">${k.value}</div>
    </div>
  `).join("");
}

function renderPorDistribuidora(data) {
  const groups = groupAgg(data, "distribuidora");
  groups.sort((a, b) => a.rcb - b.rcb);

  Plotly.newPlot("chart-por-distribuidora", [
    {
      type: "bar", name: "Valor Solicitado ao PEE",
      x: groups.map(g => g.key), y: groups.map(g => g.valor),
      marker: { color: COLORS.bar }, yaxis: "y",
    },
    {
      type: "scatter", mode: "lines+markers+text", name: "RCB médio",
      x: groups.map(g => g.key), y: groups.map(g => g.rcb),
      text: groups.map(g => fmtNum(g.rcb)), textposition: "top center",
      line: { color: COLORS.line }, marker: { color: COLORS.line }, yaxis: "y2",
    },
  ], {
    ...PLOTLY_LAYOUT_BASE,
    yaxis: { title: "Valor Solicitado (R$)", gridcolor: COLORS.grid },
    yaxis2: { title: "RCB médio", overlaying: "y", side: "right", gridcolor: COLORS.grid },
  }, PLOTLY_CONFIG);
}

function donutWithCenterLabel(divId, groups, centerLabel) {
  const labels = groups.map(g => g.key);
  const values = groups.map(g => g.value);
  const total = values.reduce((s, v) => s + v, 0);
  const palette = [COLORS.bar, COLORS.line, COLORS.ok, COLORS.warn, COLORS.neutro, "#7c8df0", "#f08a8a"];
  Plotly.newPlot(divId, [{
    type: "pie", labels, values, hole: 0.55,
    marker: { colors: palette },
    textfont: { color: COLORS.text, size: 11 },
    textinfo: "percent",
    hovertemplate: "%{label}<br>%{value} (%{percent})<extra></extra>",
  }], {
    ...PLOTLY_LAYOUT_BASE,
    margin: { t: 10, r: 10, l: 10, b: 10 },
    showlegend: true,
    legend: { orientation: "v", font: { size: 10 }, x: 1, y: 0.5 },
    annotations: [{
      text: `<b>${total}</b><br>${centerLabel}`,
      showarrow: false, font: { size: 13, color: COLORS.text },
      x: 0.5, y: 0.5, xref: "paper", yref: "paper",
    }],
  }, PLOTLY_CONFIG);
}

function renderTipologiaDonut(data) {
  const map = new Map();
  for (const d of data) {
    const k = d.tipologia || "—";
    map.set(k, (map.get(k) || 0) + 1);
  }
  const groups = [...map.entries()].map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value);
  donutWithCenterLabel("chart-tipologia-donut", groups, "Projetos");
}

function renderResultadoPizza(data) {
  const groups = {};
  for (const d of data) {
    const k = d.resultado || "—";
    groups[k] = (groups[k] || 0) + 1;
  }
  const entries = Object.entries(groups).map(([key, value]) => ({ key, value }));
  donutWithCenterLabel("chart-resultado-pizza", entries, "Projetos");
}

function renderPorAno(data) {
  const map = new Map();
  for (const d of data) {
    const k = d.ano ?? "—";
    map.set(k, (map.get(k) || 0) + 1);
  }
  const groups = [...map.entries()].map(([key, value]) => ({ key, value }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));
  Plotly.newPlot("chart-por-ano", [{
    type: "scatter", mode: "lines+markers", x: groups.map(g => g.key), y: groups.map(g => g.value),
    line: { color: COLORS.bar, shape: "spline" }, marker: { color: COLORS.bar },
    fill: "tozeroy", fillcolor: "rgba(84,112,255,0.12)",
  }], {
    ...PLOTLY_LAYOUT_BASE,
    margin: { t: 10, r: 16, l: 36, b: 30 },
    xaxis: { ...PLOTLY_LAYOUT_BASE.xaxis, tickangle: 0 },
    yaxis: { title: "Projetos", gridcolor: COLORS.grid },
  }, PLOTLY_CONFIG);
}

function renderUltimosProjetos(data) {
  const rows = data.slice().sort((a, b) => (b.ano ?? 0) - (a.ano ?? 0)).slice(0, 8);
  const tbody = document.querySelector("#tabela-ultimos-projetos tbody");
  tbody.innerHTML = rows.map(d => `
    <tr>
      <td>${truncate(d.cliente, 30)}</td>
      <td>${d.distribuidora}</td>
      <td>${fmtBRL(d.valor_solicitado_pee)}</td>
      <td>${d.ano ?? "—"}</td>
    </tr>
  `).join("") || `<tr><td colspan="4">Nenhum projeto encontrado.</td></tr>`;
}

function renderChamadasAbertasMini() {
  const hoje = new Date();
  const rows = EDITAIS
    .filter(e => e.data_entrega && new Date(e.data_entrega) >= hoje)
    .sort((a, b) => new Date(a.data_entrega) - new Date(b.data_entrega))
    .slice(0, 8);
  const fallback = rows.length ? rows : EDITAIS.slice(0, 8);
  const tbody = document.querySelector("#tabela-chamadas-abertas tbody");
  tbody.innerHTML = fallback.map(e => `
    <tr>
      <td>${e.distribuidora}</td>
      <td>${fmtBRL(e.recurso_total_tipologia)}</td>
      <td>${e.data_entrega ?? "—"}</td>
      <td><span class="tag ${resultadoTagClass(e.status)}">${e.status || "—"}</span></td>
    </tr>
  `).join("") || `<tr><td colspan="4">Nenhuma chamada encontrada.</td></tr>`;
}

function renderVisaoGeral() {
  const filters = currentFilters("f");
  const data = applyFilters(RESULTADOS, filters);
  renderKPIs(data);
  renderPorDistribuidora(data);
  renderTipologiaDonut(data);
  renderResultadoPizza(data);
  renderPorAno(data);
  renderUltimosProjetos(data);
  renderChamadasAbertasMini();
}

// ---------- view: Resultados por Dimensão ----------

function groupAgg(data, key) {
  const map = new Map();
  for (const d of data) {
    const k = d[key] || "—";
    if (!map.has(k)) map.set(k, { key: k, valor: 0, rcbSum: 0, n: 0 });
    const g = map.get(k);
    g.valor += d.valor_solicitado_pee || 0;
    if (d.rcb_pee != null) { g.rcbSum += d.rcb_pee; g.n += 1; }
  }
  return [...map.values()].map(g => ({ key: g.key, valor: g.valor, rcb: g.n ? g.rcbSum / g.n : null }));
}

function renderComboChart(divId, data, key, labelLen = 22) {
  let groups = groupAgg(data, key);
  groups = groups.filter(g => g.valor > 0);
  groups.sort((a, b) => (a.rcb ?? 0) - (b.rcb ?? 0));

  Plotly.newPlot(divId, [
    {
      type: "bar", name: "Valor Solicitado ao PEE",
      x: groups.map(g => truncate(g.key, labelLen)), y: groups.map(g => g.valor),
      customdata: groups.map(g => g.key),
      hovertemplate: "%{customdata}<br>R$ %{y:,.0f}<extra></extra>",
      marker: { color: COLORS.bar }, yaxis: "y",
    },
    {
      type: "scatter", mode: "lines+markers+text", name: "RCB PEE",
      x: groups.map(g => truncate(g.key, labelLen)), y: groups.map(g => g.rcb),
      text: groups.map(g => g.rcb != null ? fmtNum(g.rcb) : ""), textposition: "top center",
      line: { color: COLORS.line }, marker: { color: COLORS.line }, yaxis: "y2",
    },
  ], {
    ...PLOTLY_LAYOUT_BASE,
    yaxis: { title: "Valor Solicitado (R$)", gridcolor: COLORS.grid },
    yaxis2: { title: "RCB PEE", overlaying: "y", side: "right", gridcolor: COLORS.grid },
  }, PLOTLY_CONFIG);
}

function renderPontuacao(data) {
  const rows = data.filter(d => d.pontuacao_alcancada != null)
    .slice()
    .sort((a, b) => b.pontuacao_alcancada - a.pontuacao_alcancada);

  Plotly.newPlot("chart-pontuacao", [{
    type: "scatter", mode: "lines+markers",
    x: rows.map(d => truncate(d.cliente, 20)), y: rows.map(d => d.pontuacao_alcancada),
    line: { color: COLORS.line }, marker: { color: COLORS.line },
    fill: "tozeroy", fillcolor: "rgba(255,92,92,0.08)",
  }], {
    ...PLOTLY_LAYOUT_BASE,
    yaxis: { title: "Pontuação Alcançada", range: [0, 100], gridcolor: COLORS.grid },
  }, PLOTLY_CONFIG);
}

function renderResultadosView() {
  const filters = currentFilters("f2");
  const data = applyFilters(RESULTADOS, filters);
  renderComboChart("chart-usos-finais", data, "usos_finais");
  renderComboChart("chart-tipologia", data, "tipologia");
  renderComboChart("chart-empresa", data, "empresa_proponente");
  renderComboChart("chart-cliente", data, "cliente", 24);
  renderPontuacao(data);
}

// ---------- view: Mapa Estratégico ----------

function ufRecursoAprovado() {
  const map = {};
  for (const r of RESULTADOS) {
    if (!r.uf || resultadoTagClass(r.resultado) !== "aprovado") continue;
    map[r.uf] = (map[r.uf] || 0) + (r.valor_solicitado_pee || 0);
  }
  return map;
}

function ufRecursoEditais(anoEdital) {
  const map = {};
  const data = EDITAIS.filter(e => !anoEdital || String(e.ano_chamada) === String(anoEdital));
  for (const e of data) {
    if (!e.uf) continue;
    map[e.uf] = (map[e.uf] || 0) + (e.recurso_total_tipologia || 0);
  }
  return map;
}

// Plotly's "choropleth" trace + geo subplot tem um bug de preenchimento com
// estes dados (a área inteira do recorte é pintada em vez de só o contorno
// do estado). Para contornar isso com confiabilidade, desenhamos cada estado
// como um traço "scatter" preenchido (fill: toself), com a geometria
// projetada manualmente (equirretangular, com correção simples de aspecto).
// Isso mantém zoom/pan e clique nativos do Plotly, só não usa o subplot geo.

function lerpColor(c1, c2, t) {
  const a = c1.match(/\d+/g).map(Number), b = c2.match(/\d+/g).map(Number);
  const m = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}

function hexToRgbStr(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
}

const HEAT_LOW = "rgb(23,27,44)";
const HEAT_MID = hexToRgbStr(COLORS.bar);
const HEAT_HIGH = hexToRgbStr(COLORS.line);

function heatColor(value, max) {
  if (!value || !max) return HEAT_LOW;
  const t = Math.max(0, Math.min(1, value / max));
  return t < 0.5 ? lerpColor(HEAT_LOW, HEAT_MID, t / 0.5) : lerpColor(HEAT_MID, HEAT_HIGH, (t - 0.5) / 0.5);
}

function ringToXY(ring, cosLat) {
  const x = [], y = [];
  for (const [lon, lat] of ring) { x.push(lon * cosLat); y.push(lat); }
  return { x, y };
}

function buildStateTraces(ufValues) {
  const max = Math.max(0, ...Object.values(ufValues));
  const cosLat = Math.cos((-14 * Math.PI) / 180); // correção de aspecto p/ latitude média do Brasil
  const traces = [];
  for (const feature of GEOJSON.features) {
    const sigla = feature.properties.sigla;
    if (!sigla) continue;
    const value = ufValues[sigla] || 0;
    const geom = feature.geometry;
    const polygons = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    const xs = [], ys = [];
    for (const poly of polygons) {
      for (const ring of poly) {
        const { x, y } = ringToXY(ring, cosLat);
        if (xs.length) { xs.push(null); ys.push(null); }
        xs.push(...x, x[0]);
        ys.push(...y, y[0]);
      }
    }
    traces.push({
      type: "scatter", mode: "lines", x: xs, y: ys,
      fill: "toself", fillcolor: heatColor(value, max),
      line: { color: "#0a0c14", width: 0.7 },
      name: sigla, customdata: [sigla],
      text: `${sigla}: ${value ? fmtBRL(value) : "sem dado"}`,
      hoverinfo: "text", hoveron: "fills",
    });
  }
  return traces;
}

function renderMapa() {
  if (!GEOJSON) return;
  const camada = document.getElementById("f3-camada").value;
  const anoEdital = document.getElementById("f3-ano-edital").value;

  const ufValues = camada === "editais" ? ufRecursoEditais(anoEdital) : ufRecursoAprovado();
  const title = camada === "editais"
    ? "Recurso disponível em editais por estado"
    : "Recurso aprovado por estado (onde já atuamos)";

  document.getElementById("map-title").textContent = title;

  const traces = buildStateTraces(ufValues);

  Plotly.newPlot("chart-mapa", traces, {
    ...PLOTLY_LAYOUT_BASE,
    showlegend: false,
    xaxis: { visible: false, scaleanchor: "y", scaleratio: 1, constrain: "domain" },
    yaxis: { visible: false },
    margin: { t: 10, r: 10, l: 10, b: 10 },
    plot_bgcolor: "transparent",
    dragmode: "pan",
  }, PLOTLY_CONFIG);

  const gd = document.getElementById("chart-mapa");
  gd.removeAllListeners && gd.removeAllListeners("plotly_click");
  gd.on("plotly_click", (evt) => {
    const pt = evt.points && evt.points[0];
    const sigla = pt && pt.data && pt.data.customdata && pt.data.customdata[0];
    if (sigla) showDrilldown(sigla, camada);
  });
}

function showDrilldown(uf, camada) {
  const panel = document.getElementById("drilldown");
  const title = document.getElementById("drilldown-title");
  const tbody = document.querySelector("#tabela-drilldown tbody");
  const thead = document.querySelector("#tabela-drilldown thead tr");

  if (camada === "editais") {
    const anoEdital = document.getElementById("f3-ano-edital").value;
    const rows = EDITAIS.filter(e => e.uf === uf && (!anoEdital || String(e.ano_chamada) === String(anoEdital)));
    thead.innerHTML = "<th>Distribuidora</th><th>Tipologia</th><th>Recurso Total</th><th>Min/Projeto</th><th>Max/Projeto</th><th>Status</th><th>Ano</th>";
    tbody.innerHTML = rows.map(e => `
      <tr>
        <td>${e.distribuidora}</td><td>${e.tipologia}</td>
        <td>${fmtBRL(e.recurso_total_tipologia)}</td><td>${fmtBRL(e.recurso_minimo_projeto)}</td>
        <td>${fmtBRL(e.recurso_maximo_projeto)}</td>
        <td><span class="tag ${resultadoTagClass(e.status)}">${e.status || "—"}</span></td>
        <td>${e.ano_chamada ?? "—"}</td>
      </tr>
    `).join("") || `<tr><td colspan="7">Nenhum edital encontrado para este estado.</td></tr>`;
    title.textContent = `Editais em ${uf}`;
  } else {
    const rows = RESULTADOS.filter(r => r.uf === uf);
    thead.innerHTML = "<th>Cliente / Município</th><th>Tipologia</th><th>Empresa</th><th>RCB</th><th>Valor Solicitado</th><th>Contrapartida</th><th>Resultado</th><th>Ano</th>";
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.cliente || "—"}</td><td>${r.tipologia || "—"}</td><td>${r.empresa_proponente || "—"}</td>
        <td>${fmtNum(r.rcb_pee)}</td><td>${fmtBRL(r.valor_solicitado_pee)}</td><td>${fmtBRL(r.contrapartida)}</td>
        <td><span class="tag ${resultadoTagClass(r.resultado)}">${r.resultado || "—"}</span></td>
        <td>${r.ano ?? "—"}</td>
      </tr>
    `).join("") || `<tr><td colspan="8">Nenhum projeto encontrado para este estado.</td></tr>`;
    title.textContent = `Projetos em ${uf} (${rows.length})`;
  }

  panel.classList.add("show");
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function hideDrilldown() {
  document.getElementById("drilldown").classList.remove("show");
}

function renderEditaisTable() {
  const anoEdital = document.getElementById("f3-ano-edital").value;
  const data = EDITAIS.filter(e => !anoEdital || String(e.ano_chamada) === String(anoEdital));
  const tbody = document.querySelector("#tabela-editais tbody");
  tbody.innerHTML = data.map(e => `
    <tr>
      <td>${e.distribuidora}</td>
      <td>${e.estado}</td>
      <td>${e.tipologia}</td>
      <td>${fmtBRL(e.recurso_total_tipologia)}</td>
      <td>${fmtBRL(e.recurso_minimo_projeto)}</td>
      <td>${fmtBRL(e.recurso_maximo_projeto)}</td>
      <td>${e.ano_chamada ?? "—"}</td>
      <td>${e.data_abertura ?? "—"}</td>
      <td>${e.data_entrega ?? "—"}</td>
      <td><span class="tag ${resultadoTagClass(e.status)}">${e.status || "—"}</span></td>
      <td>${e.link_edital ? `<a href="${e.link_edital}" target="_blank" style="color:${COLORS.bar}">edital</a>` : "—"}</td>
    </tr>
  `).join("");
}

function renderEstrategicoView() {
  hideDrilldown();
  renderMapa();
  renderEditaisTable();
}

// ---------- view: Tabela de Projetos ----------

let tableSort = { key: "valor_solicitado_pee", dir: "desc" };

function renderTabelaProjetos() {
  const busca = document.getElementById("busca-texto").value.trim().toLowerCase();
  const filters = currentFilters("f4");
  let data = applyFilters(RESULTADOS, filters);

  if (busca) {
    data = data.filter(d =>
      [d.cliente, d.empresa_proponente, d.tipologia, d.usos_finais, d.distribuidora]
        .some(v => v && v.toLowerCase().includes(busca))
    );
  }

  data = data.slice().sort((a, b) => {
    const va = a[tableSort.key], vb = b[tableSort.key];
    let cmp;
    if (typeof va === "number" || typeof vb === "number") cmp = (va ?? -Infinity) - (vb ?? -Infinity);
    else cmp = String(va ?? "").localeCompare(String(vb ?? ""));
    return tableSort.dir === "asc" ? cmp : -cmp;
  });

  const tbody = document.querySelector("#tabela-projetos tbody");
  tbody.innerHTML = data.map(d => `
    <tr>
      <td>${d.distribuidora}</td>
      <td>${d.cliente || "—"}</td>
      <td>${d.tipologia || "—"}</td>
      <td>${d.usos_finais || "—"}</td>
      <td>${d.empresa_proponente || "—"}</td>
      <td>${fmtNum(d.rcb_pee)}</td>
      <td>${fmtNum(d.pontuacao_alcancada, 1)}</td>
      <td>${fmtBRL(d.valor_solicitado_pee)}</td>
      <td>${fmtBRL(d.contrapartida)}</td>
      <td><span class="tag ${resultadoTagClass(d.resultado)}">${d.resultado || "—"}</span></td>
      <td>${d.ano ?? "—"}</td>
    </tr>
  `).join("");
}

// ---------- navegação pela sidebar ----------

const PAGE_TITLES = {
  "visao-geral": ["Visão Geral", "Panorama nacional dos Programas de Eficiência Energética"],
  "resultados": ["Resultados por Dimensão", "Comparativos por usos finais, tipologia, empresa e cliente"],
  "estrategico": ["Mapa do Brasil", "Mapa estratégico de atuação e chamadas públicas (CPPs)"],
  "dados": ["Histórico Completo", "Todos os projetos cadastrados, com busca e filtros"],
};

function setActiveView(view) {
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll("main .view").forEach(v => v.classList.remove("active"));
  document.getElementById(`view-${view}`).classList.add("active");
  const [title, subtitle] = PAGE_TITLES[view] || ["", ""];
  document.getElementById("page-title").textContent = title;
  document.getElementById("page-subtitle").textContent = subtitle;
  renderActiveView(view);
}

function setupSidebarNav() {
  document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
    btn.addEventListener("click", () => setActiveView(btn.dataset.view));
  });
}

function renderConcessionariasNav() {
  const distribuidoras = uniqueSorted(RESULTADOS, "distribuidora");
  const container = document.getElementById("nav-concessionarias");
  container.innerHTML = distribuidoras.map(d =>
    `<button class="nav-item nav-item-sub" data-distribuidora="${d}">${d}</button>`
  ).join("");
  container.querySelectorAll("[data-distribuidora]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("f-distribuidora").value = btn.dataset.distribuidora;
      setActiveView("visao-geral");
      container.querySelectorAll(".nav-item-sub").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

function renderActiveView(view) {
  if (view === "visao-geral") renderVisaoGeral();
  else if (view === "resultados") renderResultadosView();
  else if (view === "estrategico") renderEstrategicoView();
  else if (view === "dados") renderTabelaProjetos();
}

// ---------- inicialização ----------

function setupFilters() {
  const distribuidoras = uniqueSorted(RESULTADOS, "distribuidora");
  const anos = uniqueSorted(RESULTADOS, "ano");
  const resultadosVals = uniqueSorted(RESULTADOS, "resultado");
  const tipologias = uniqueSorted(RESULTADOS, "tipologia");
  const usosFinais = uniqueSorted(RESULTADOS, "usos_finais");
  const empresas = uniqueSorted(RESULTADOS, "empresa_proponente");
  const anosEdital = uniqueSorted(EDITAIS, "ano_chamada");

  populateSelect(document.getElementById("f-distribuidora"), distribuidoras, "Todas");
  populateSelect(document.getElementById("f-ano"), anos, "Todos");
  populateSelect(document.getElementById("f-resultado"), resultadosVals, "Todos");
  populateSelect(document.getElementById("f-tipologia"), tipologias, "Todas");
  populateSelect(document.getElementById("f-usos"), usosFinais, "Todos");

  populateSelect(document.getElementById("f2-distribuidora"), distribuidoras, "Todas");
  populateSelect(document.getElementById("f2-ano"), anos, "Todos");

  populateSelect(document.getElementById("f3-ano-edital"), anosEdital, "Todos");

  populateSelect(document.getElementById("f4-distribuidora"), distribuidoras, "Todas");
  populateSelect(document.getElementById("f4-tipologia"), tipologias, "Todas");
  populateSelect(document.getElementById("f4-empresa"), empresas, "Todas");

  ["f-distribuidora", "f-ano", "f-resultado", "f-tipologia", "f-usos"].forEach(id =>
    document.getElementById(id).addEventListener("change", renderVisaoGeral));
  document.getElementById("f-clear").addEventListener("click", () =>
    clearFilters("f", ["f-distribuidora", "f-ano", "f-resultado", "f-tipologia", "f-usos"], renderVisaoGeral));

  ["f2-distribuidora", "f2-ano"].forEach(id =>
    document.getElementById(id).addEventListener("change", renderResultadosView));
  document.getElementById("f2-clear").addEventListener("click", () =>
    clearFilters("f2", ["f2-distribuidora", "f2-ano"], renderResultadosView));

  ["f3-camada", "f3-ano-edital"].forEach(id =>
    document.getElementById(id).addEventListener("change", renderEstrategicoView));
  document.getElementById("f3-clear").addEventListener("click", () => {
    document.getElementById("f3-ano-edital").value = "";
    hideDrilldown();
    renderMapa();
  });
  document.getElementById("drilldown-close").addEventListener("click", hideDrilldown);

  ["f4-distribuidora", "f4-tipologia", "f4-empresa"].forEach(id =>
    document.getElementById(id).addEventListener("change", renderTabelaProjetos));
  document.getElementById("busca-texto").addEventListener("input", renderTabelaProjetos);
  document.getElementById("f4-clear").addEventListener("click", () =>
    clearFilters("f4", ["f4-distribuidora", "f4-tipologia", "f4-empresa", "busca-texto"], renderTabelaProjetos));

  document.querySelectorAll("#tabela-projetos thead th").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (tableSort.key === key) tableSort.dir = tableSort.dir === "asc" ? "desc" : "asc";
      else tableSort = { key, dir: "asc" };
      renderTabelaProjetos();
    });
  });
}

async function init() {
  await loadAll();
  renderPartnerLogos();
  renderConcessionariasNav();
  setupFilters();
  setupSidebarNav();
  renderVisaoGeral();
}

init();
