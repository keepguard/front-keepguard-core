import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type {
  AnalystSectorSnapshot,
  AnalystSectorSummary,
  AnalystSectorTickerDetail,
} from '../../services/analystService';
import {
  businessDateBRT,
  formatIsoDatePt,
} from '../../services/analystService';
import { Tooltip } from '../common/Tooltip';
import { LockedNotice, LockedPlaceholder, LockedTicker } from './LockedAsset';
import { THESIS_LABEL, thesisDisplayLabel, thesisTone } from './marketLabels';

const COLUMN_HELP = {
  var3m: {
    label: 'Var 3M',
    description: 'Variação mediana de preço do setor nos últimos 3 meses (~63 pregões) e contagem de ativos em alta vs baixa.',
  },
  pl: {
    label: 'P/L vs histórico',
    description: 'P/L mediano atual do setor comparado contra a mediana histórica das próprias empresas do setor.',
  },
  pvp: {
    label: 'P/VP vs histórico',
    description: 'P/VP mediano atual do setor comparado contra a mediana histórica do setor.',
  },
  teses: {
    label: 'Distribuição de teses',
    description: 'Total de ativos do setor em cada veredito proprietário emitido pelo motor analítico.',
  },
} as const;

type SortKey = 'count' | 'm3' | 'pl' | 'name';

const SORT_LABEL: Record<SortKey, string> = {
  count: 'Mais ativos',
  m3: 'Maior alta em 3M',
  pl: 'Menor P/L vs histórico',
  name: 'Ordem alfabética',
};

function ColumnHint({ help, align = 'start' }: { help: (typeof COLUMN_HELP)[keyof typeof COLUMN_HELP]; align?: 'start' | 'center' | 'end' }) {
  return (
    <Tooltip label={help.label} description={help.description} align={align}>
      <span tabIndex={0} className="market-magic-th-tip">{help.label}</span>
    </Tooltip>
  );
}

function compactThesisLabel(code?: string): string {
  if (!code) return 'Sem tese';
  if (code.endsWith('_COM_RISCO')) {
    const base = code.slice(0, -'_COM_RISCO'.length);
    const baseLabel = THESIS_LABEL[base] || base;
    return `${baseLabel} (c/ risco)`;
  }
  return THESIS_LABEL[code] || thesisDisplayLabel(code);
}

function num(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return '—';
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function formatPercent(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return '—';
  const abs = Math.abs(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (value > 0) return `+${abs}%`;
  if (value < 0) return `−${abs}%`;
  return `${abs}%`;
}

/** Atual ÷ histórico − 1, em %. Só existe com os dois valores positivos. */
function versusHistory(current?: number | null, hist?: number | null): number | null {
  if (current == null || hist == null || current <= 0 || hist <= 0) return null;
  return (current / hist - 1) * 100;
}

function plGap(row: AnalystSectorSummary): number | null {
  if (!row.hasSufficientSample) return null;
  return versusHistory(row.valuation.plMedian, row.valuation.plHistMedian);
}

function m3Of(row: AnalystSectorSummary): number | null {
  return row.hasSufficientSample && row.performance.m3 != null ? row.performance.m3 : null;
}

/** Raiz quadrada da razão: uma alta de 30% não esmaga as de 2%. */
function barWidth(value: number, max: number): number {
  return 4 + Math.sqrt(Math.min(1, Math.abs(value) / max)) * 96;
}

function PendingTodayNotice({ asOfDate }: { asOfDate: string }) {
  return (
    <p className="market-magic-pending" role="status">
      Visão setorial de {formatIsoDatePt(asOfDate)}. O lote diário de hoje roda às 21:30 (dias úteis).
    </p>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <article className="sc-tile">
      <span className="sc-tile-label">{label}</span>
      <strong className="sc-tile-value">{value}</strong>
      {sub ? <span className="sc-tile-sub">{sub}</span> : null}
    </article>
  );
}

function HistChip({ gap }: { gap: number | null }) {
  if (gap == null) return null;
  const tone = Math.abs(gap) < 5 ? 'flat' : gap < 0 ? 'below' : 'above';
  const label = tone === 'flat' ? 'em linha' : `${formatPercent(gap)} vs hist.`;
  return <span className={`sc-hist is-${tone}`}>{label}</span>;
}

function Multiple({ current, hist }: { current?: number | null; hist?: number | null }) {
  if (current == null) return <span className="text-muted">—</span>;
  return (
    <span className="sc-multiple">
      <strong>{num(current)}x</strong>
      {hist != null ? <small>hist. {num(hist)}x</small> : null}
      <HistChip gap={versusHistory(current, hist)} />
    </span>
  );
}

function TickerCard({ t, onSelect }: { t: AnalystSectorTickerDetail; onSelect?: (ticker: string) => void }) {
  if (t.locked) {
    return (
      <div className="sc-ticker is-locked" aria-label="Ativo fora do seu plano">
        <span className="sc-ticker-top">
          <LockedTicker />
        </span>
        <span className="sc-ticker-name"><LockedPlaceholder>Nome da empresa</LockedPlaceholder></span>
        <span className="sc-ticker-metrics">
          <LockedPlaceholder>R$ 00,00</LockedPlaceholder>
          <LockedPlaceholder>P/L 0,0x</LockedPlaceholder>
          <LockedPlaceholder>P/VP 0,00x</LockedPlaceholder>
        </span>
      </div>
    );
  }
  const tone = t.thesisCode ? thesisTone(t.thesisCode) : 'muted';
  return (
    <button type="button" className="sc-ticker" onClick={() => onSelect?.(t.ticker)} disabled={!onSelect}>
      <span className="sc-ticker-top">
        <strong>{t.ticker}</strong>
        <span className={`market-ticker-thesis-chip market-thesis-${tone}`}>{compactThesisLabel(t.thesisCode)}</span>
      </span>
      {t.displayName ? <span className="sc-ticker-name">{t.displayName}</span> : null}
      <span className="sc-ticker-metrics">
        {t.price != null ? <span>R$ {t.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> : null}
        {t.pl != null ? <span>P/L {t.pl.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x</span> : null}
        {t.pvp != null ? <span>P/VP {t.pvp.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}x</span> : null}
      </span>
    </button>
  );
}

function ThesesBar({ theses }: { theses: AnalystSectorSummary['theses'] }) {
  const parts = [
    { key: 'op', count: theses.OPORTUNIDADE, label: 'Oport.', title: 'Oportunidade', cls: 'is-op' },
    { key: 'ju', count: theses.QUALIDADE_A_PRECO_JUSTO, label: 'Justo', title: 'Qualidade a preço justo', cls: 'is-ju' },
    { key: 'ne', count: theses.NEUTRO, label: 'Neutro', title: 'Neutro', cls: 'is-ne' },
    { key: 'ou', count: theses.OUTROS, label: 'Outros', title: 'Outras teses ou com risco', cls: 'is-ou' },
  ].filter((p) => p.count > 0);
  const total = parts.reduce((sum, p) => sum + p.count, 0);
  if (total === 0) return <span className="text-muted">—</span>;
  return (
    <div className="sc-theses">
      <div className="sc-theses-bar" aria-hidden="true">
        {parts.map((p) => (
          <span key={p.key} className={p.cls} style={{ flexGrow: p.count }} title={`${p.title}: ${p.count}`} />
        ))}
      </div>
      <ul className="sc-theses-legend">
        {parts.map((p) => (
          <li key={p.key} title={p.title}><i className={p.cls} aria-hidden="true" />{p.count} {p.label}</li>
        ))}
      </ul>
    </div>
  );
}

export interface SectorsPanelProps {
  snapshot: AnalystSectorSnapshot;
  onSelectTicker?: (ticker: string) => void;
}

export const SectorsPanel: React.FC<SectorsPanelProps> = ({ snapshot, onSelectTicker }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>('count');

  const toggle = (sector: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sector)) next.delete(sector);
      else next.add(sector);
      return next;
    });
  };

  const pendingToday = snapshot.asOfDate !== businessDateBRT();
  const asOfLabel = formatIsoDatePt(snapshot.asOfDate);

  const sorted = useMemo(() => {
    const rows = [...snapshot.sectors];
    // Setor sem medianas (amostra pequena) sempre no fim quando o critério depende delas.
    const missingLast = (a: number | null, b: number | null, dir: 1 | -1) => {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return (a - b) * dir;
    };
    switch (sort) {
      case 'm3':
        return rows.sort((a, b) => missingLast(m3Of(a), m3Of(b), -1));
      case 'pl':
        return rows.sort((a, b) => missingLast(plGap(a), plGap(b), 1));
      case 'name':
        return rows.sort((a, b) => a.sectorLabel.localeCompare(b.sectorLabel, 'pt-BR'));
      default:
        return rows.sort((a, b) => b.tickerCount - a.tickerCount);
    }
  }, [snapshot.sectors, sort]);

  const withM3 = snapshot.sectors.filter((r) => m3Of(r) != null);
  const bestM3 = withM3.reduce<AnalystSectorSummary | null>((acc, r) => (!acc || (m3Of(r) as number) > (m3Of(acc) as number) ? r : acc), null);
  const worstM3 = withM3.reduce<AnalystSectorSummary | null>((acc, r) => (!acc || (m3Of(r) as number) < (m3Of(acc) as number) ? r : acc), null);
  const withGap = snapshot.sectors.filter((r) => plGap(r) != null);
  const cheapest = withGap.reduce<AnalystSectorSummary | null>((acc, r) => (!acc || (plGap(r) as number) < (plGap(acc) as number) ? r : acc), null);
  const hasLocked = snapshot.sectors.some((r) => (r.lockedCount ?? 0) > 0);
  const maxM3 = Math.max(...withM3.map((r) => Math.abs(m3Of(r) as number)), 0.0001);

  return (
    <section className="sc" aria-label="Visão por Setor">
      {pendingToday ? <PendingTodayNotice asOfDate={snapshot.asOfDate} /> : null}

      <header className="sc-head">
        <div>
          <span className="sc-kicker">Visão por setor</span>
          <h2 className="sc-title">Setores · {asOfLabel}</h2>
        </div>
        <label className="sc-sort">
          <span>Ordenar por</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
              <option key={key} value={key}>{SORT_LABEL[key]}</option>
            ))}
          </select>
        </label>
      </header>

      {hasLocked ? (
        <LockedNotice text="Os números do setor consideram todos os ativos. Você vê em detalhe só os do seu plano; os demais aparecem bloqueados." />
      ) : null}

      <div className="sc-tiles">
        <Tile label="Setores" value={snapshot.sectors.length} sub="monitorados" />
        <Tile label="Ativos" value={snapshot.totalTickers} sub="na base" />
        {bestM3 ? <Tile label="Maior alta em 3M" value={formatPercent(m3Of(bestM3))} sub={bestM3.sectorLabel} /> : null}
        {worstM3 ? <Tile label="Maior queda em 3M" value={formatPercent(m3Of(worstM3))} sub={worstM3.sectorLabel} /> : null}
        {cheapest ? <Tile label="Menor P/L vs histórico" value={formatPercent(plGap(cheapest))} sub={cheapest.sectorLabel} /> : null}
      </div>

      <div className="sc-card">
        <div className="sc-row sc-row-head" role="presentation">
          <span>Setor</span>
          <span><ColumnHint help={COLUMN_HELP.var3m} /></span>
          <span><ColumnHint help={COLUMN_HELP.pl} /></span>
          <span><ColumnHint help={COLUMN_HELP.pvp} /></span>
          <span><ColumnHint help={COLUMN_HELP.teses} /></span>
          <span />
        </div>

        <ul className="sc-list">
          {sorted.map((row) => {
            const isOpen = expanded.has(row.sector);
            const m3 = m3Of(row);
            const tone = m3 == null ? 'flat' : m3 >= 0 ? 'up' : 'down';
            const detailsId = `sector-details-${row.sector}`;
            return (
              <li key={row.sector} className={`sc-item${isOpen ? ' is-open' : ''}`}>
                <div className="sc-row">
                  <span className="sc-name">
                    <strong>{row.sectorLabel}</strong>
                    <small>
                      {row.tickerCount} {row.tickerCount === 1 ? 'ativo' : 'ativos'}
                      {row.lockedCount ? ` · ${row.lockedCount} fora do seu plano` : ''}
                    </small>
                  </span>

                  <span className="sc-perf" data-label="Var 3M">
                    {m3 != null ? (
                      <>
                        <span className="sc-bar" aria-hidden="true">
                          <span className={`sc-bar-fill is-${tone}`} style={{ width: `${barWidth(m3, maxM3)}%` }} />
                        </span>
                        <strong className={`sc-perf-value is-${tone}`}>{formatPercent(m3)}</strong>
                        <small>{row.performance.upCount}↑ · {row.performance.downCount}↓</small>
                      </>
                    ) : (
                      <span className="text-muted" title="Amostra insuficiente para mediana">—</span>
                    )}
                  </span>

                  <span data-label="P/L">
                    {row.hasSufficientSample ? <Multiple current={row.valuation.plMedian} hist={row.valuation.plHistMedian} /> : <span className="text-muted">—</span>}
                  </span>
                  <span data-label="P/VP">
                    {row.hasSufficientSample ? <Multiple current={row.valuation.pvpMedian} hist={row.valuation.pvpHistMedian} /> : <span className="text-muted">—</span>}
                  </span>

                  <span data-label="Teses"><ThesesBar theses={row.theses} /></span>

                  <button
                    type="button"
                    className="sc-toggle"
                    aria-expanded={isOpen}
                    aria-controls={detailsId}
                    aria-label={`${isOpen ? 'Recolher' : 'Ver'} ativos de ${row.sectorLabel}`}
                    onClick={() => toggle(row.sector)}
                  >
                    <ChevronDown size={18} aria-hidden="true" />
                  </button>
                </div>

                {isOpen ? (
                  <div id={detailsId} className="sc-details">
                    {!row.hasSufficientSample ? (
                      <p className="sc-sample">
                        Amostra reduzida ({row.tickerCount} {row.tickerCount === 1 ? 'ativo' : 'ativos'}): as medianas do setor ficam ocultas para não distorcer a leitura.
                      </p>
                    ) : null}
                    <div className="sc-tickers">
                      {(row.tickerDetails ?? []).map((t) => (
                        <TickerCard key={t.ticker} t={t} onSelect={onSelectTicker} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="market-disclaimer">
        {snapshot.disclaimer || 'Agregação factual e determinística dos ativos acompanhados. Não constitui recomendação ou alocação setorial.'}
      </p>
    </section>
  );
};
