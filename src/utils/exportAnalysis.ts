import type {
  AnalystDataFreshness,
  AnalystInputPoint,
  AnalystMarketContext,
  AnalystRun,
  AnalystRunDetail,
} from '../services/analystService';
import {
  formatCompactBrl,
  formatCompactCount,
  formatMoney,
  formatPct,
  formatRatio,
  formatSignedPct,
  titleWithTicker,
} from '../components/dashboard/dossierFormat';
import {
  FRESHNESS_SOURCE_LABEL,
  FRESHNESS_STATUS_COPY,
  formatDayFull,
  freshnessDetail,
} from './dataFreshnessText';
import { parseNarrative, type NarrativeInline } from './narrativeMarkdown';
import {
  GAP_REASON_LABEL,
  METRIC_LABEL,
  RISK_LEVEL_LABEL,
  SEVERITY_LABEL,
  SOURCE_LABEL,
  VERDICT_LABEL,
  AXIS_LABEL,
  flagCategoryLabel,
  isFiiAsset,
  thesisDisplayLabel,
  thesisTone,
} from '../components/dashboard/marketLabels';

/**
 * Exporta a análise já carregada na tela (nenhuma chamada extra à API).
 * O HTML é autocontido (CSS/JS inline, gráficos em SVG) e todo texto vindo da
 * análise passa por `esc()` antes de entrar no template.
 */

const ESC_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

function formatWhen(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
}

function formatNum(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function sourceLabel(id?: string): string {
  return (id && SOURCE_LABEL[id]) || id || '—';
}

const PERIOD_UNIT: Record<string, string> = { DAY: 'pregões', MONTH: 'meses', YEAR: 'anos' };

function pointDay(p?: AnalystInputPoint): string {
  return formatDayFull(p?.periodStart || p?.observedAt);
}

function sparkline(title: string, points?: AnalystInputPoint[]): string {
  const values = (points ?? []).map((p) => p.valueNum).filter((v) => Number.isFinite(v));
  if (values.length < 2) return '';
  const w = 240;
  const h = 64;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = values
    .map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - min) / span) * (h - 8)).toFixed(1)}`)
    .join(' ');
  const last = values[values.length - 1];
  const first = pointDay(points?.[0]);
  const end = pointDay(points?.[points.length - 1]);
  const unit = PERIOD_UNIT[points?.[0]?.periodType ?? ''] ?? 'pontos';
  const period = first !== '—' && end !== '—' ? `${first} → ${end} · ${values.length} ${unit}` : `${values.length} ${unit}`;
  return `<figure class="chart">
    <figcaption>${esc(title)} <strong>${esc(formatNum(last))}</strong></figcaption>
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(`${title}: de ${formatNum(values[0])} a ${formatNum(last)}, ${period}`)}" preserveAspectRatio="none">
      <polyline points="${coords}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/>
    </svg>
    <small>mín ${esc(formatNum(min))} · máx ${esc(formatNum(max))}</small>
    <small>${esc(period)}</small>
  </figure>`;
}

function inlineHtml(items: NarrativeInline[]): string {
  return items
    .map((part) => {
      if (part.bold) return `<strong>${esc(part.text)}</strong>`;
      if (part.italic) return `<em>${esc(part.text)}</em>`;
      return esc(part.text);
    })
    .join('');
}

/** Narrativa (markdown mínimo do modelo) em HTML; todo texto passa por esc(). */
function narrativeHtml(text?: string): string {
  return `<div class="narrative">${parseNarrative(text)
    .map((block) => {
      switch (block.type) {
        case 'heading':
          return `<h3 class="narr-heading">${inlineHtml(block.inlines)}</h3>`;
        case 'list':
          return `<ul>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</ul>`;
        case 'rule':
          return '<hr>';
        default:
          return `<p>${inlineHtml(block.inlines)}</p>`;
      }
    })
    .join('')}</div>`;
}

const NO_DATA = 'sem dado';

function kpi(label: string, value: string): string {
  return `<div class="kpi"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
}

function signedOrNone(value?: number): string {
  return value != null ? formatSignedPct(value) : NO_DATA;
}

function freshnessHtml(f?: AnalystDataFreshness): string {
  if (!f) return '';
  const stale = f.sources.some((s) => s.status === 'STALE' && s.source !== 'news');
  return `<ul class="fresh">${f.sources
    .map((s) => {
      const status = FRESHNESS_STATUS_COPY[s.status] ?? FRESHNESS_STATUS_COPY.MISSING;
      return `<li><span class="fresh-head"><strong>${esc(FRESHNESS_SOURCE_LABEL[s.source] || s.source)}</strong> <span class="badge ${status.cls}">${esc(status.label)}</span></span><span class="fresh-detail">${esc(freshnessDetail(s, f.expectedSession))}</span></li>`;
    })
    .join('')}</ul>${stale ? '<p class="note">Há fonte defasada: este dossiê pode não refletir o pregão mais recente.</p>' : ''}<p class="note">Análise feita em ${esc(formatWhen(f.asOf))}.</p>`;
}

function marketContextHtml(mc?: AnalystMarketContext | null): string {
  if (!mc) return '';
  const rv = mc.relativeVolume;
  const volume =
    rv != null
      ? `${formatRatio(rv)} a média (${rv >= 1.5 ? 'acima da média' : rv <= 0.7 ? 'abaixo da média' : 'perto da média'})`
      : NO_DATA;
  const gaps = (mc.gaps ?? [])
    .map((g) => `${METRIC_LABEL[g.metric] || g.metric} (${GAP_REASON_LABEL[g.reason] || g.reason})`)
    .join(', ');
  return `<p class="note">Base: fechamento de ${esc(formatDayFull(mc.asOfDay))}. Máximas e mínimas são de fechamento.</p>
    <dl class="kpis">
      ${kpi('1 dia', signedOrNone(mc.return1D))}
      ${kpi('5 dias', signedOrNone(mc.return5D))}
      ${kpi('1 mês', signedOrNone(mc.return1M))}
      ${kpi('Volume do último pregão', volume)}
      ${kpi('Distância da máxima de 20 pregões', signedOrNone(mc.distFromHigh20DPct))}
      ${kpi('Distância da mínima de 20 pregões', signedOrNone(mc.distFromLow20DPct))}
      ${kpi('Queda desde a máxima de 52 semanas', signedOrNone(mc.drawdown52WPct))}
      ${kpi('Cotação vs média de 20 pregões', signedOrNone(mc.priceVsMA20Pct))}
      ${kpi('Cotação vs média de 50 pregões', signedOrNone(mc.priceVsMA50Pct))}
      ${kpi('Valor negociado por dia', mc.averageDailyTradedValue != null ? formatCompactBrl(mc.averageDailyTradedValue) : NO_DATA)}
      ${kpi('Volatilidade 30 dias', mc.volatility30D != null ? formatPct(mc.volatility30D, 1) : NO_DATA)}
    </dl>
    ${gaps ? `<p class="note">Sem dado: ${esc(gaps)}.</p>` : ''}
    <p class="note">Contexto de mercado, não recomendação: não entra na tese nem nos sinais.</p>`;
}

function signalNum(run: AnalystRunDetail, metric: string): number | undefined {
  return run.signals.find((sig) => sig.metric === metric)?.grounding?.valueNum;
}

/** Indicadores imobiliários (mesmos números do dossiê da tela). Só o que existir entra. */
function fiiHtml(run: AnalystRunDetail): string {
  if (!isFiiAsset(run.assetType, run.ticker)) return '';
  const cur = run.inputs?.current;
  const d = run.fiiDetails;
  const price = cur?.price?.valueNum;
  const pvp = cur?.pvp?.valueNum ?? signalNum(run, 'fii_pvp');
  const dy = cur?.dy_pct?.valueNum ?? signalNum(run, 'fii_dividend_yield');
  const liquidity = signalNum(run, 'fii_daily_liquidity');
  const cells: string[] = [];
  if (price != null) cells.push(kpi('Cotação', formatMoney(price)));
  if (d?.vpPerShare != null) cells.push(kpi('VP por cota', formatMoney(d.vpPerShare)));
  if (pvp != null) cells.push(kpi('P/VP', formatRatio(pvp)));
  if (price != null && d?.vpPerShare) cells.push(kpi('Desconto/ágio sobre o VP', formatSignedPct(((price - d.vpPerShare) / d.vpPerShare) * 100, 1)));
  if (dy != null) cells.push(kpi('DY 12M', formatPct(dy)));
  if (d?.lastDividendValue != null) cells.push(kpi('Último rendimento', formatMoney(d.lastDividendValue)));
  if (liquidity != null) cells.push(kpi('Liquidez média', `${formatCompactBrl(liquidity)}/dia`));
  if (d?.netWorth != null) cells.push(kpi('Patrimônio', formatCompactBrl(d.netWorth)));
  if (d?.shareholderCount != null) cells.push(kpi('Base de cotistas', formatCompactCount(d.shareholderCount)));
  if (d?.cashPercentage != null) cells.push(kpi('Reserva em caixa', formatPct(d.cashPercentage)));
  if (!cells.length) return '';
  return `${d?.segment ? `<p class="note">Segmento: ${esc(d.segment)}</p>` : ''}<dl class="kpis">${cells.join('')}</dl>`;
}

const MACRO_ROWS: [string, string][] = [
  ['cdi_pct', 'CDI (dia)'],
  ['selic_meta_pct', 'Selic meta (a.a.)'],
  ['ipca_mensal_pct', 'IPCA mensal (mês)'],
];

function macroHtml(run: AnalystRunDetail): string {
  const macro = run.inputs?.macro;
  if (!macro) return '';
  const cells = MACRO_ROWS.filter(([key]) => macro[key]).map(([key, label]) => kpi(label, formatPct(macro[key].valueNum)));
  return cells.length ? `<dl class="kpis">${cells.join('')}</dl>` : '';
}

const SCRIPT = `
(function () {
  var root = document.documentElement;
  var btn = document.getElementById('theme');
  if (btn) btn.addEventListener('click', function () {
    root.setAttribute('data-theme', root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
  var chips = document.querySelectorAll('[data-filter]');
  var cards = document.querySelectorAll('[data-verdict]');
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var f = chip.getAttribute('data-filter');
      chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c === chip)); });
      cards.forEach(function (card) {
        card.hidden = f !== 'ALL' && card.getAttribute('data-verdict') !== f;
      });
    });
  });
  var all = document.getElementById('toggle-all');
  if (all) all.addEventListener('click', function () {
    var ds = document.querySelectorAll('details');
    var open = Array.prototype.some.call(ds, function (d) { return !d.open; });
    ds.forEach(function (d) { d.open = open; });
  });
  window.addEventListener('beforeprint', function () {
    document.querySelectorAll('details').forEach(function (d) { d.open = true; });
    cards.forEach(function (c) { c.hidden = false; });
  });
})();`;

const STYLE = `
:root{--bg:#f6f7f9;--card:#fff;--text:#1d2330;--muted:#5d6678;--border:#e2e5ec;--primary:#5b3df5;--good:#0b7a46;--good-bg:#e4f6ec;--bad:#b3261e;--bad-bg:#fdeceb;--warn:#8a5a00;--warn-bg:#fff4e0;--chip-bg:#eceff4}
:root[data-theme=dark]{--bg:#12151c;--card:#1b2029;--text:#e8ebf2;--muted:#9aa3b5;--border:#2b3240;--primary:#9d8cff;--good:#5fd39a;--good-bg:#12291f;--bad:#ff8a80;--bad-bg:#2f1917;--warn:#ffc266;--warn-bg:#2d2312;--chip-bg:#262d3a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:64rem;margin:0 auto;padding:1.5rem 1rem 3rem}
header.top{display:flex;flex-wrap:wrap;gap:1rem;justify-content:space-between;align-items:flex-start;margin-bottom:1rem}
h1{margin:0;font-size:1.6rem}h2{font-size:1.05rem;margin:0}h3{font-size:.95rem;margin:.4rem 0 .2rem}
.meta{color:var(--muted);font-size:.85rem;margin:.25rem 0 0}
.tools{display:flex;gap:.5rem;flex-wrap:wrap}
button{font:inherit;cursor:pointer;border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:999px;padding:.35rem .85rem}
button:hover,button[aria-pressed=true]{border-color:var(--primary);color:var(--primary)}
button:focus-visible,summary:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
details{background:var(--card);border:1px solid var(--border);border-radius:.75rem;margin:0 0 1rem;padding:.9rem 1rem}
summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center}
summary::-webkit-details-marker{display:none}summary::after{content:"▾";color:var(--muted)}details:not([open]) summary::after{content:"▸"}
.body{margin-top:.75rem}
.badge{display:inline-block;padding:.15rem .6rem;border-radius:999px;font-size:.78rem;font-weight:600;background:var(--chip-bg);color:var(--muted)}
.badge.warn{background:var(--warn-bg);color:var(--warn)}
.badge.good,.v-CHEAP,.v-HEALTHY{background:var(--good-bg);color:var(--good)}
.badge.bad,.v-EXPENSIVE,.v-RISKY{background:var(--bad-bg);color:var(--bad)}
.grid{display:grid;gap:.75rem;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))}
.card{border:1px solid var(--border);border-radius:.6rem;padding:.7rem .85rem}
.card p{margin:.2rem 0;color:var(--muted);font-size:.88rem}
.chart{margin:0;border:1px solid var(--border);border-radius:.6rem;padding:.6rem .75rem;color:var(--primary)}
.chart figcaption{color:var(--text);font-size:.85rem}.chart svg{width:100%;height:4rem}.chart small{color:var(--muted)}
.axes{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem}
.chart small{display:block}
.kpis{display:grid;gap:.6rem .9rem;grid-template-columns:repeat(auto-fill,minmax(13rem,1fr));margin:.4rem 0 0}
.kpi{border:1px solid var(--border);border-radius:.6rem;padding:.5rem .75rem;margin:0}
.kpi dt{color:var(--muted);font-size:.75rem;margin:0}.kpi dd{margin:.15rem 0 0;font-weight:700}
.note{color:var(--muted);font-size:.82rem;margin:.5rem 0 0}
.fresh{display:grid;gap:.6rem .9rem;grid-template-columns:repeat(auto-fill,minmax(14rem,1fr));margin:0;padding:0;list-style:none}
.fresh li{display:flex;flex-direction:column;gap:.15rem}.fresh-detail{color:var(--muted);font-size:.8rem}
.narrative p,.narrative ul{margin:0 0 .75rem}.narrative ul{padding-left:1.2rem}.narrative li{margin:0 0 .4rem}
.narr-heading{font-size:.98rem;margin:1rem 0 .4rem}.narrative hr{border:0;border-top:1px solid var(--border);margin:1rem 0}
.filters{display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.75rem}
.disclaimer{color:var(--muted);font-size:.8rem;margin-top:1.25rem}
[hidden]{display:none!important}
@media print{
  :root,:root[data-theme=dark]{--bg:#fff;--card:#fff;--text:#111;--muted:#444;--border:#ccc;--chip-bg:#eceff4}
  body{font-size:12px}.tools,.filters{display:none}main{padding:0;max-width:none}
  details{break-inside:avoid;border-color:#ccc}summary::after{content:""}
  .card,.chart,.kpi{break-inside:avoid}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
@page{margin:14mm}`;

const RISK_TONE: Record<string, string> = { LOW: 'good', MEDIUM: 'warn', HIGH: 'bad' };

function section(title: string, content: string): string {
  if (!content.trim()) return '';
  return `<details open><summary><h2>${esc(title)}</h2></summary><div class="body">${content}</div></details>`;
}

export function buildAnalysisHtml(run: AnalystRun, detail?: AnalystRunDetail | null): string {
  const title = titleWithTicker(run.displayName, run.ticker);
  const merged: AnalystRunDetail = { ...run, ...(detail ?? {}) };
  const series = merged.inputs?.series;

  const thesis = merged.thesis;
  const thesisHtml = thesis
    ? `<span class="badge ${thesisTone(thesis.code)}">${esc(thesisDisplayLabel(thesis.code))}</span>
       <div class="axes">
         <span class="badge">Qualidade: ${esc(AXIS_LABEL[thesis.quality.level] || thesis.quality.level)}</span>
         <span class="badge">Preço: ${esc(AXIS_LABEL[thesis.price.level] || thesis.price.level)}</span>
         <span class="badge">Saúde: ${esc(AXIS_LABEL[thesis.health.level] || thesis.health.level)}</span>
       </div>`
    : '';

  const flags = merged.flags;
  const flagCard = (f: { category: string; severity: string; title: string; description: string }, tone: string) =>
    `<article class="card"><span class="badge ${tone}">${esc(flagCategoryLabel(f.category))} · ${esc(SEVERITY_LABEL[f.severity] || f.severity)}</span><h3>${esc(f.title)}</h3><p>${esc(f.description)}</p></article>`;
  const flagsHtml = flags
    ? `<p><span class="badge ${RISK_TONE[flags.riskLevel] ?? ''}">Risco: ${esc(RISK_LEVEL_LABEL[flags.riskLevel] || flags.riskLevel)}</span>
       <span class="badge ${flags.totalGreenFlags > 0 ? 'good' : ''}">${esc(flags.totalGreenFlags)} positivos</span>
       <span class="badge ${flags.totalRedFlags > 0 ? 'bad' : ''}">${esc(flags.totalRedFlags)} alertas</span></p>
       <div class="grid">${(flags.greenFlags ?? []).map((f) => flagCard(f, 'good')).join('')}${(flags.redFlags ?? []).map((f) => flagCard(f, 'bad')).join('')}</div>`
    : '';

  const charts = [
    sparkline('Preço', series?.price),
    sparkline('P/VP', series?.pvp),
    sparkline('P/L', series?.pl),
    sparkline('EV/EBITDA', series?.ev_ebitda),
  ].join('');

  const verdicts = Array.from(new Set(merged.signals.map((s) => s.verdict)));
  const filters =
    verdicts.length > 1
      ? `<div class="filters" role="group" aria-label="Filtrar sinais"><button type="button" data-filter="ALL" aria-pressed="true">Todos</button>${verdicts
          .map((v) => `<button type="button" data-filter="${esc(v)}" aria-pressed="false">${esc(VERDICT_LABEL[v] || v)}</button>`)
          .join('')}</div>`
      : '';
  const signalsHtml = merged.signals.length
    ? `${filters}<div class="grid">${merged.signals
        .map(
          (s) => `<article class="card" data-verdict="${esc(s.verdict)}">
            <span class="badge v-${esc(s.verdict)}">${esc(VERDICT_LABEL[s.verdict] || s.verdict)}</span>
            <h3>${esc(METRIC_LABEL[s.metric] || s.metric)}</h3>
            <p>${esc(s.explanation)}</p>
            ${s.grounding?.dataSource ? `<p>Fonte: ${esc(sourceLabel(s.grounding.dataSource))}</p>` : ''}
          </article>`,
        )
        .join('')}</div>`
    : '';

  const gapsHtml = merged.gaps?.length
    ? `<ul>${merged.gaps.map((g) => `<li>${esc(METRIC_LABEL[g.metric] || g.metric)}: ${esc(GAP_REASON_LABEL[g.reason] || g.reason)}</li>`).join('')}</ul>`
    : '';

  const sourcesHtml = merged.sources?.length
    ? `<ul>${merged.sources.map((s) => `<li>${esc(sourceLabel(s.dataSource))} — coletado em ${esc(formatWhen(s.collectedAt))}</li>`).join('')}</ul>`
    : '';

  return `<!doctype html>
<html lang="pt-BR" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(run.ticker)} — Análise KeepGuard</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <header class="top">
    <div>
      <h1>${esc(title)}</h1>
      <p class="meta">Analisado em ${esc(formatWhen(run.analyzedAt))} · Exportado em ${esc(formatWhen(new Date().toISOString()))}</p>
    </div>
    <div class="tools">
      <button type="button" id="toggle-all">Expandir/recolher</button>
      <button type="button" id="theme">Tema claro/escuro</button>
      <button type="button" onclick="window.print()">Imprimir / PDF</button>
    </div>
  </header>
  ${section('Fontes deste dossiê', freshnessHtml(merged.dataFreshness))}
  ${section('Tese', thesisHtml)}
  ${section('Resumo', merged.narrative ? narrativeHtml(merged.narrative) : '')}
  ${section('Alertas e pontos positivos', flagsHtml)}
  ${section('Indicadores imobiliários', fiiHtml(merged))}
  ${section('Contexto de mercado (curto prazo)', marketContextHtml(merged.marketContext))}
  ${section('Trajetória', charts ? `<div class="grid">${charts}</div>` : '')}
  ${section('Sinais', signalsHtml)}
  ${section('Contexto macro', macroHtml(merged))}
  ${section('Dados indisponíveis', gapsHtml)}
  ${section('Fontes consultadas', sourcesHtml)}
  <p class="disclaimer">${esc(merged.disclaimer || 'Conteúdo informativo. Não constitui recomendação de investimento.')}</p>
</main>
<script>${SCRIPT}</script>
</body>
</html>`;
}

function fileBase(run: AnalystRun): string {
  const day = new Date().toISOString().slice(0, 10);
  return `keepguard-${run.ticker.toLowerCase()}-${day}`;
}

export function downloadAnalysisHtml(run: AnalystRun, detail?: AnalystRunDetail | null): void {
  const blob = new Blob([buildAnalysisHtml(run, detail)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileBase(run)}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** PDF via impressão do navegador ("Salvar como PDF"), em iframe oculto para não cair em bloqueio de popup. */
export function printAnalysisPdf(run: AnalystRun, detail?: AnalystRunDetail | null): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  iframe.title = fileBase(run);
  iframe.srcdoc = buildAnalysisHtml(run, detail);
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) return;
    win.addEventListener('afterprint', () => iframe.remove());
    win.focus();
    win.print();
  };
  document.body.appendChild(iframe);
}
