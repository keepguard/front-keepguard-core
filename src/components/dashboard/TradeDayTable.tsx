import { Link } from 'react-router-dom';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { PATHS } from '../../navigation/routes';
import type { TradeDayRow } from '../../hooks/useTradeDay';
import { ageLabel, formatMoney, formatSignedPct } from './dossierFormat';

const SETUP_LABEL: Record<string, string> = {
  turtle_soup: 'Turtle Soup',
  wyckoff_spring_upthrust: 'Wyckoff Spring/Upthrust',
  wyckoff_sos_lps: 'Wyckoff SOS/LPS',
  holy_grail: 'Holy Grail',
  dow_pullback_media_movel: 'Dow — Pullback na Média',
  dow_rompimento_confirmado: 'Dow — Rompimento Confirmado',
  rsi2_mean_reversion: 'RSI(2) Mean Reversion',
};

function tone(value?: number): 'up' | 'down' | 'flat' {
  if (value == null || value === 0) return 'flat';
  return value > 0 ? 'up' : 'down';
}

/** Onde o fechamento está entre a mínima e a máxima do candle (0–100) — mesma conta de TradeAssetCard. */
function closePosition(low: number, high: number, close: number): number {
  if (high <= low) return 50;
  return Math.min(100, Math.max(0, ((close - low) / (high - low)) * 100));
}

/**
 * R múltiplo da operação: distância do preço atual à entrada, em unidades do risco inicial
 * (|entrada - stopInicial|). Sem stopInicial (setup legado ou sem noção de trailing), cai pro
 * risco contra o stop ATUAL — "risco remanescente", não o original (ver spec da feature).
 */
function rMultiplo(
  direcao: string,
  entrada: number,
  stopInicial: number | undefined,
  stopAtual: number,
  precoAtual: number,
): { valor: number; baseadoEmStopAtual: boolean } | null {
  const stopBase = stopInicial ?? stopAtual;
  const risco = Math.abs(entrada - stopBase);
  if (risco === 0) return null;
  const valor = direcao === 'compra' ? (precoAtual - entrada) / risco : (entrada - precoAtual) / risco;
  return { valor, baseadoEmStopAtual: stopInicial == null };
}

/** Clampa a barra visualmente em [-1R, +2R] — cobre a maioria dos desfechos do Turtle Soup;
 * o número exato (não clampado) sempre acompanha ao lado. */
function rBarPercent(r: number): number {
  const clamped = Math.min(2, Math.max(-1, r));
  return ((clamped + 1) / 3) * 100;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

interface TradeDayTableProps {
  rows: TradeDayRow[];
  emptyMessage: string;
}

export function TradeDayTable({ rows, emptyMessage }: TradeDayTableProps) {
  if (rows.length === 0) {
    return <div className="trade-state"><p>{emptyMessage}</p></div>;
  }

  return (
    <>
      <div className="hpanel-table-card desktop-table-view has-row-action-menus">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Último</th>
              <th>Abertura</th>
              <th>Máxima</th>
              <th>Mínima</th>
              <th>Fechamento</th>
              <th>Candle</th>
              <th>Setup</th>
              <th>Entrada</th>
              <th>Stop inicial</th>
              <th>Stop atual</th>
              <th>Saída</th>
              <th>Risco/retorno</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ ticker, item, opportunity }) => {
              const { quote, candle, stale } = item;
              const changeTone = tone(candle?.changePct);
              const ChangeIcon = changeTone === 'up' ? TrendingUp : changeTone === 'down' ? TrendingDown : Minus;
              const age = item.ageSeconds;
              const r = opportunity && quote
                ? rMultiplo(opportunity.direcao, opportunity.entrada, opportunity.stopInicial, opportunity.stop, quote.last)
                : null;

              return (
                <tr key={ticker} className={stale ? 'is-stale' : undefined}>
                  <td>
                    <div className="table-cell-title">
                      <Link to={`${PATHS.market}?ticker=${encodeURIComponent(ticker)}`} title="Abrir o dossiê no Mercado">
                        {ticker}
                      </Link>
                      {stale ? <span className="trade-chip is-warn">Defasado</span> : null}
                    </div>
                  </td>
                  <td>
                    {quote ? (
                      <div className="trade-day-last">
                        <ChangeIcon size={13} className={`trade-day-trend is-${changeTone}`} aria-hidden="true" />
                        <strong>{formatMoney(quote.last)}</strong>
                        <span className="table-cell-muted">{age != null ? ageLabel(age) : timeLabel(quote.collectedAt)}</span>
                      </div>
                    ) : (
                      <span className="table-cell-muted">—</span>
                    )}
                  </td>
                  <td>{candle ? formatMoney(candle.open) : '—'}</td>
                  <td>{candle ? formatMoney(candle.high) : '—'}</td>
                  <td>{candle ? formatMoney(candle.low) : '—'}</td>
                  <td>{candle ? formatMoney(candle.close) : '—'}</td>
                  <td>
                    {candle ? (
                      <div className="trade-day-candle-cell" title={`Fechamento no range do candle · ${timeLabel(candle.ts)}`}>
                        <div className="trade-range" aria-hidden="true">
                          <span className="trade-range-marker" style={{ left: `${closePosition(candle.low, candle.high, candle.close)}%` }} />
                        </div>
                        {candle.changePct != null ? (
                          <span className={`trade-delta is-${changeTone}`}>{formatSignedPct(candle.changePct)}</span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="table-cell-muted">—</span>
                    )}
                  </td>
                  <td>
                    {opportunity ? (
                      <span className={`portfolio-tx-badge is-${opportunity.direcao === 'compra' ? 'buy' : 'sell'}`}>
                        {SETUP_LABEL[opportunity.setup] ?? opportunity.setup}
                      </span>
                    ) : (
                      <span className="table-cell-muted">—</span>
                    )}
                  </td>
                  <td>{opportunity ? formatMoney(opportunity.entrada) : '—'}</td>
                  <td>{opportunity ? (opportunity.stopInicial != null ? formatMoney(opportunity.stopInicial) : '—') : '—'}</td>
                  <td>{opportunity ? formatMoney(opportunity.stop) : '—'}</td>
                  <td>
                    {opportunity ? (
                      opportunity.alvo != null ? formatMoney(opportunity.alvo) : 'Trailing'
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {r ? (
                      <div
                        className={`trade-r-bar-wrap${r.valor >= 0 ? ' is-positive' : ' is-negative'}`}
                        title={r.baseadoEmStopAtual
                          ? `Risco remanescente (sem stop inicial): ${r.valor >= 0 ? '+' : ''}${r.valor.toFixed(2)}R`
                          : `Risco/retorno desde a entrada: ${r.valor >= 0 ? '+' : ''}${r.valor.toFixed(2)}R`}
                      >
                        <div className="trade-r-bar" aria-hidden="true">
                          <span className="trade-r-bar-zero" />
                          <span className="trade-r-bar-fill" style={{ width: `${rBarPercent(r.valor)}%` }} />
                        </div>
                        <span
                          className={r.valor >= 0 ? 'portfolio-pl-positive' : 'portfolio-pl-negative'}
                          aria-label={`Risco e retorno: ${r.valor >= 0 ? 'mais' : 'menos'} ${Math.abs(r.valor).toFixed(2)} R`}
                        >
                          {r.valor >= 0 ? '+' : ''}{r.valor.toFixed(2)}R
                        </span>
                      </div>
                    ) : (
                      <span className="table-cell-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards-container">
        {rows.map(({ ticker, item, opportunity }) => {
          const { quote, candle, stale } = item;
          const changeTone = tone(candle?.changePct);
          const ChangeIcon = changeTone === 'up' ? TrendingUp : changeTone === 'down' ? TrendingDown : Minus;
          const r = opportunity && quote
            ? rMultiplo(opportunity.direcao, opportunity.entrada, opportunity.stopInicial, opportunity.stop, quote.last)
            : null;

          return (
            <div key={ticker} className="mobile-domain-card">
              <div className="mobile-card-top">
                <div className="mobile-card-identity">
                  <ChangeIcon size={15} className={`trade-day-trend is-${changeTone}`} />
                  <span className="mobile-domain-name">{ticker}</span>
                </div>
                {stale ? <span className="trade-chip is-warn">Defasado</span> : null}
              </div>
              <div className="mobile-card-subinfo">
                {quote ? `${formatMoney(quote.last)}` : 'Sem cotação'}
                {candle ? ` · O ${formatMoney(candle.open)} / F ${formatMoney(candle.close)}` : ''}
              </div>
              {opportunity ? (
                <div className="mobile-card-meta">
                  <span>{SETUP_LABEL[opportunity.setup] ?? opportunity.setup} · Entrada {formatMoney(opportunity.entrada)}</span>
                  <span>Stop atual {formatMoney(opportunity.stop)}</span>
                  {r ? (
                    <span className={r.valor >= 0 ? 'portfolio-pl-positive' : 'portfolio-pl-negative'}>
                      {r.valor >= 0 ? '+' : ''}{r.valor.toFixed(2)}R
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="mobile-card-meta"><span className="table-cell-muted">Sem oportunidade ativa</span></div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
