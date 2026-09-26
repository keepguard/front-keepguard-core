import type { AnalystInputPoint, AnalystRun, AnalystRunDetail } from '../services/analystService';
import {
  GAP_REASON_LABEL,
  METRIC_LABEL,
  RISK_LEVEL_LABEL,
  SEVERITY_LABEL,
  SOURCE_LABEL,
  VERDICT_LABEL,
  AXIS_LABEL,
  flagCategoryLabel,
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
  return `<figure class="chart">
    <figcaption>${esc(title)} <strong>${esc(formatNum(last))}</strong></figcaption>
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(`${title}: de ${formatNum(values[0])} a ${formatNum(last)}`)}" preserveAspectRatio="none">
      <polyline points="${coords}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/>
    </svg>
    <small>mín ${esc(formatNum(min))} · máx ${esc(formatNum(max))}</small>
  </figure>`;
}

function paragraphs(text?: string): string {
  return (text ?? '')
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join('');
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
:root{--bg:#f6f7f9;--card:#fff;--text:#1d2330;--muted:#5d6678;--border:#e2e5ec;--primary:#5b3df5;--good:#0b7a46;--good-bg:#e4f6ec;--bad:#b3261e;--bad-bg:#fdeceb;--warn:#8a5a00;--warn-bg:#fff4e0}
:root[data-theme=dark]{--bg:#12151c;--card:#1b2029;--text:#e8ebf2;--muted:#9aa3b5;--border:#2b3240;--primary:#9d8cff;--good:#5fd39a;--good-bg:#12291f;--bad:#ff8a80;--bad-bg:#2f1917;--warn:#ffc266;--warn-bg:#2d2312}
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
.badge{display:inline-block;padding:.15rem .6rem;border-radius:999px;font-size:.78rem;font-weight:600;background:var(--warn-bg);color:var(--warn)}
.badge.good,.v-CHEAP,.v-HEALTHY{background:var(--good-bg);color:var(--good)}
.badge.bad,.v-EXPENSIVE,.v-RISKY{background:var(--bad-bg);color:var(--bad)}
.grid{display:grid;gap:.75rem;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))}
.card{border:1px solid var(--border);border-radius:.6rem;padding:.7rem .85rem}
.card p{margin:.2rem 0;color:var(--muted);font-size:.88rem}
.chart{margin:0;border:1px solid var(--border);border-radius:.6rem;padding:.6rem .75rem;color:var(--primary)}
.chart figcaption{color:var(--text);font-size:.85rem}.chart svg{width:100%;height:4rem}.chart small{color:var(--muted)}
.axes{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem}
.filters{display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.75rem}
.disclaimer{color:var(--muted);font-size:.8rem;margin-top:1.25rem}
[hidden]{display:none!important}
@media print{
  :root,:root[data-theme=dark]{--bg:#fff;--card:#fff;--text:#111;--muted:#444;--border:#ccc}
  body{font-size:12px}.tools,.filters{display:none}main{padding:0;max-width:none}
  details{break-inside:avoid;border-color:#ccc}summary::after{content:""}
  .card,.chart{break-inside:avoid}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
@page{margin:14mm}`;

function section(title: string, content: string): string {
  if (!content.trim()) return '';
  return `<details open><summary><h2>${esc(title)}</h2></summary><div class="body">${content}</div></details>`;
}

export function buildAnalysisHtml(run: AnalystRun, detail?: AnalystRunDetail | null): string {
  const name = run.displayName || run.ticker;
  const merged: AnalystRunDetail = { ...run, ...(detail ?? {}) };
  const series = merged.inputs?.series;

  const thesis = merged.thesis;
  const thesisHtml = thesis
    ? `<span class="badge ${thesisTone(thesis.code) === 'warn' ? '' : thesisTone(thesis.code)}">${esc(thesisDisplayLabel(thesis.code))}</span>
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
    ? `<p><span class="badge">Risco: ${esc(RISK_LEVEL_LABEL[flags.riskLevel] || flags.riskLevel)}</span>
       <span class="badge good">${esc(flags.totalGreenFlags)} positivos</span>
       <span class="badge bad">${esc(flags.totalRedFlags)} alertas</span></p>
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
      <h1>${esc(name)} · ${esc(run.ticker)}</h1>
      <p class="meta">Analisado em ${esc(formatWhen(run.analyzedAt))} · Exportado em ${esc(formatWhen(new Date().toISOString()))}</p>
    </div>
    <div class="tools">
      <button type="button" id="toggle-all">Expandir/recolher</button>
      <button type="button" id="theme">Tema claro/escuro</button>
      <button type="button" onclick="window.print()">Imprimir / PDF</button>
    </div>
  </header>
  ${section('Tese', thesisHtml)}
  ${section('Resumo', paragraphs(merged.narrative))}
  ${section('Alertas e pontos positivos', flagsHtml)}
  ${section('Trajetória', charts ? `<div class="grid">${charts}</div>` : '')}
  ${section('Sinais', signalsHtml)}
  ${section('Dados indisponíveis', gapsHtml)}
  ${section('Fontes', sourcesHtml)}
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
