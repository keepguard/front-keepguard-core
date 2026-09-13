import React, { useState } from 'react';
import type {
  AnalystSectorSnapshot,
  AnalystSectorTickerDetail,
} from '../../services/analystService';
import {
  businessDateBRT,
  formatIsoDatePt,
} from '../../services/analystService';
import { Tooltip } from '../common/Tooltip';
import { THESIS_LABEL, thesisDisplayLabel, thesisTone } from './marketLabels';

const COLUMN_HELP = {
  setor: {
    label: 'Setor',
    description: 'Classificação setorial de risco compartilhado da B3.',
  },
  var3m: {
    label: 'Var 3M',
    description: 'Variação mediana de preço do setor nos últimos 3 meses (~63 pregões) e contagem de ativos em alta vs baixa.',
  },
  pl: {
    label: 'P/L (vs hist.)',
    description: 'P/L mediano atual do setor comparado contra a mediana histórica das próprias empresas do setor.',
  },
  pvp: {
    label: 'P/VP (vs hist.)',
    description: 'P/VP mediano atual do setor comparado contra a mediana histórica do setor.',
  },
  teses: {
    label: 'Distribuição de Teses',
    description: 'Total de ativos do setor em cada veredito proprietário emitido pelo motor analítico.',
  },
} as const;

function ColumnHint({
  help,
  align = 'center',
}: {
  help: (typeof COLUMN_HELP)[keyof typeof COLUMN_HELP];
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <Tooltip label={help.label} description={help.description} align={align}>
      <span tabIndex={0} className="market-magic-th-tip">
        {help.label}
      </span>
    </Tooltip>
  );
}

function num(value: number | undefined | null, suffix = ''): string {
  if (value == null || isNaN(value)) {
    return '—';
  }
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${suffix}`;
}

function formatPercent(value: number | undefined | null): string {
  if (value == null || isNaN(value)) {
    return '—';
  }
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function PendingTodayNotice({ asOfDate }: { asOfDate: string }) {
  return (
    <p className="market-magic-pending" role="status">
      Visão setorial de {formatIsoDatePt(asOfDate)}. O lote diário de hoje roda às 21:30 (dias úteis).
    </p>
  );
}

export interface SectorsPanelProps {
  snapshot: AnalystSectorSnapshot;
  onSelectTicker?: (ticker: string) => void;
}

export const SectorsPanel: React.FC<SectorsPanelProps> = ({ snapshot, onSelectTicker }) => {
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());

  const toggleSector = (sectorID: string) => {
    setExpandedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(sectorID)) {
        next.delete(sectorID);
      } else {
        next.add(sectorID);
      }
      return next;
    });
  };

  const pendingToday = snapshot.asOfDate !== businessDateBRT();
  const asOfLabel = formatIsoDatePt(snapshot.asOfDate);
  const meta = `${asOfLabel} · ${snapshot.sectors.length} setores monitorados · ${snapshot.totalTickers} ativos na base`;

  return (
    <section className="market-sectors" aria-label="Visão por Setor">
      <div className="hpanel-table-card desktop-table-view market-table-card market-sectors-panel">
        {pendingToday ? <PendingTodayNotice asOfDate={snapshot.asOfDate} /> : null}
        <header className="market-table-header">
          <h2 className="market-table-title">Visão por Setor</h2>
          <p className="text-muted market-table-subtitle">{meta}</p>
        </header>

        <div className="market-table-wrap">
          <table className="market-table market-sectors-table" aria-label="Tabela de Setores">
            <thead>
              <tr>
                <th scope="col" className="text-left" style={{ width: '26%' }}>
                  <ColumnHint help={COLUMN_HELP.setor} align="start" />
                </th>
                <th scope="col" className="text-center" style={{ width: '16%' }}>
                  <ColumnHint help={COLUMN_HELP.var3m} align="center" />
                </th>
                <th scope="col" className="text-right" style={{ width: '16%' }}>
                  <ColumnHint help={COLUMN_HELP.pl} align="end" />
                </th>
                <th scope="col" className="text-right" style={{ width: '16%' }}>
                  <ColumnHint help={COLUMN_HELP.pvp} align="end" />
                </th>
                <th scope="col" className="text-center" style={{ width: '20%' }}>
                  <ColumnHint help={COLUMN_HELP.teses} align="center" />
                </th>
                <th scope="col" style={{ width: '6%' }}>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {snapshot.sectors.map((row) => {
                const isExpanded = expandedSectors.has(row.sector);
                const hasSufficient = row.hasSufficientSample;

                return (
                  <React.Fragment key={row.sector}>
                    <tr
                      className={`market-sector-row${isExpanded ? ' is-expanded' : ''}`}
                      onClick={() => toggleSector(row.sector)}
                      tabIndex={0}
                      role="button"
                      aria-expanded={isExpanded}
                      aria-controls={`sector-details-${row.sector}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleSector(row.sector);
                        }
                      }}
                    >
                      <td className="text-left">
                        <div className="market-sector-label-cell">
                          <span className="market-sector-name">{row.sectorLabel}</span>
                          <span className="market-sector-count-badge" title={`${row.tickerCount} ativos`}>
                            {row.tickerCount} {row.tickerCount === 1 ? 'ativo' : 'ativos'}
                          </span>
                        </div>
                      </td>

                      <td className="text-center">
                        {hasSufficient && row.performance.m3 != null ? (
                          <div className="market-sector-return-wrap">
                            <span
                              className={`market-sector-return ${
                                row.performance.m3 > 0 ? 'is-positive' : row.performance.m3 < 0 ? 'is-negative' : ''
                              }`}
                            >
                              {formatPercent(row.performance.m3)}
                            </span>
                            <span className="market-sector-dispersion" title="Dispersão do setor">
                              {row.performance.upCount}↑ · {row.performance.downCount}↓
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted" title="Amostragem insuficiente para mediana">
                            —
                          </span>
                        )}
                      </td>

                      <td className="text-right num-cell">
                        {hasSufficient && row.valuation.plMedian != null ? (
                          <div className="market-sector-val-cell">
                            <span className="market-val-current">{num(row.valuation.plMedian)}x</span>
                            {row.valuation.plHistMedian != null ? (
                              <span className="market-val-hist text-muted">
                                hist. {num(row.valuation.plHistMedian)}x
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      <td className="text-right num-cell">
                        {hasSufficient && row.valuation.pvpMedian != null ? (
                          <div className="market-sector-val-cell">
                            <span className="market-val-current">{num(row.valuation.pvpMedian)}x</span>
                            {row.valuation.pvpHistMedian != null ? (
                              <span className="market-val-hist text-muted">
                                hist. {num(row.valuation.pvpHistMedian)}x
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      <td className="text-center">
                        <div className="market-theses-bar-wrap">
                          <div className="market-theses-tags">
                            {row.theses.OPORTUNIDADE > 0 ? (
                              <span className="market-thesis-tag is-positive" title="Oportunidade">
                                {row.theses.OPORTUNIDADE} Oport.
                              </span>
                            ) : null}
                            {row.theses.QUALIDADE_A_PRECO_JUSTO > 0 ? (
                              <span className="market-thesis-tag is-neutral" title="Qualidade a Preço Justo">
                                {row.theses.QUALIDADE_A_PRECO_JUSTO} Justo
                              </span>
                            ) : null}
                            {row.theses.NEUTRO > 0 ? (
                              <span className="market-thesis-tag is-muted" title="Neutro">
                                {row.theses.NEUTRO} Neutro
                              </span>
                            ) : null}
                            {row.theses.OUTROS > 0 ? (
                              <span className="market-thesis-tag is-caution" title="Outras teses ou com risco">
                                {row.theses.OUTROS} Outros
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      <td className="text-center">
                        <button
                          type="button"
                          className="market-sector-toggle-btn"
                          aria-label={isExpanded ? 'Recolher detalhes' : 'Expandir detalhes'}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSector(row.sector);
                          }}
                        >
                          <svg
                            className={`market-chevron-icon${isExpanded ? ' is-rotated' : ''}`}
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                      </td>
                    </tr>

                    {isExpanded ? (
                      <tr id={`sector-details-${row.sector}`} className="market-sector-expanded-row">
                        <td colSpan={6}>
                          <div className="market-sector-details-container">
                            {!hasSufficient ? (
                              <p className="market-sector-sample-alert">
                                ℹ️ Amostra reduzida ({row.tickerCount} {row.tickerCount === 1 ? 'ativo' : 'ativos'}). As medianas agregadas são omitidas para evitar indução estatística distorcida.
                              </p>
                            ) : null}

                            <div className="market-sector-tickers-grid">
                              {(row.tickerDetails ?? []).map((t: AnalystSectorTickerDetail) => {
                                const tone = t.thesisCode ? thesisTone(t.thesisCode) : 'muted';
                                const label = t.thesisCode
                                  ? THESIS_LABEL[t.thesisCode] || thesisDisplayLabel(t.thesisCode)
                                  : 'Sem tese';

                                return (
                                  <div
                                    key={t.ticker}
                                    className="market-ticker-card"
                                    onClick={() => onSelectTicker?.(t.ticker)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        onSelectTicker?.(t.ticker);
                                      }
                                    }}
                                  >
                                    <div className="market-ticker-card-top">
                                      <span className="market-ticker-badge">{t.ticker}</span>
                                      <span className={`market-ticker-thesis-chip market-thesis-${tone}`}>
                                        {label}
                                      </span>
                                    </div>
                                    {t.displayName ? (
                                      <p className="market-ticker-company text-muted">{t.displayName}</p>
                                    ) : null}
                                    <div className="market-ticker-metrics">
                                      {t.price != null ? (
                                        <span>R$ {t.price.toFixed(2)}</span>
                                      ) : null}
                                      {t.pl != null ? <span>P/L {t.pl.toFixed(1)}x</span> : null}
                                      {t.pvp != null ? <span>P/VP {t.pvp.toFixed(2)}x</span> : null}
                                    </div>
                                    <span className="market-ticker-goto">Ver no dossiê →</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="mobile-cards-view market-sectors-mobile">
          {snapshot.sectors.map((row) => {
            const isExpanded = expandedSectors.has(row.sector);
            const hasSufficient = row.hasSufficientSample;

            return (
              <article key={row.sector} className="market-sector-card-mobile">
                <header
                  className="market-sector-mobile-header"
                  onClick={() => toggleSector(row.sector)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                >
                  <div className="market-sector-mobile-title-wrap">
                    <h3 className="market-sector-mobile-name">{row.sectorLabel}</h3>
                    <span className="market-sector-count-badge">
                      {row.tickerCount} {row.tickerCount === 1 ? 'ativo' : 'ativos'}
                    </span>
                  </div>
                  <svg
                    className={`market-chevron-icon${isExpanded ? ' is-rotated' : ''}`}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </header>

                <div className="market-sector-mobile-metrics">
                  <div>
                    <span className="text-muted">Var 3M:</span>{' '}
                    {hasSufficient && row.performance.m3 != null ? (
                      <span
                        className={`market-sector-return ${
                          row.performance.m3 > 0 ? 'is-positive' : row.performance.m3 < 0 ? 'is-negative' : ''
                        }`}
                      >
                        {formatPercent(row.performance.m3)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </div>
                  <div>
                    <span className="text-muted">P/L:</span>{' '}
                    {hasSufficient && row.valuation.plMedian != null
                      ? `${num(row.valuation.plMedian)}x`
                      : '—'}
                  </div>
                  <div>
                    <span className="text-muted">P/VP:</span>{' '}
                    {hasSufficient && row.valuation.pvpMedian != null
                      ? `${num(row.valuation.pvpMedian)}x`
                      : '—'}
                  </div>
                </div>

                {isExpanded ? (
                  <div className="market-sector-mobile-expanded">
                    <div className="market-sector-tickers-grid">
                      {(row.tickerDetails ?? []).map((t) => (
                        <button
                          type="button"
                          key={t.ticker}
                          className="market-ticker-chip-mobile"
                          onClick={() => onSelectTicker?.(t.ticker)}
                        >
                          <strong>{t.ticker}</strong>
                          <span className="text-muted">
                            {t.thesisCode ? THESIS_LABEL[t.thesisCode] || t.thesisCode : '—'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        <footer className="market-table-footer">
          <p className="market-magic-disclaimer text-muted">
            {snapshot.disclaimer || 'Agregação factual e determinística dos ativos acompanhados. Não constitui recomendação ou alocação setorial.'}
          </p>
        </footer>
      </div>
    </section>
  );
};
