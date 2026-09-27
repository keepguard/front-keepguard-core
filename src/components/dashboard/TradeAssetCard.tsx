import { Link } from 'react-router-dom';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { TradeItem } from '../../services/tradeService';
import { PATHS } from '../../navigation/routes';
import { ageLabel, formatCompactCount, formatMoney, formatSignedPct } from './dossierFormat';

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function tone(value?: number): 'up' | 'down' | 'flat' {
  if (value == null || value === 0) return 'flat';
  return value > 0 ? 'up' : 'down';
}

/** Onde o fechamento está entre a mínima e a máxima do candle (0–100). */
function closePosition(low: number, high: number, close: number): number {
  if (high <= low) return 50;
  return Math.min(100, Math.max(0, ((close - low) / (high - low)) * 100));
}

export function TradeAssetCard({ item, ageSeconds }: { item: TradeItem; ageSeconds?: number }) {
  const { ticker, quote, candle, stale } = item;
  const dossierLink = `${PATHS.market}?ticker=${encodeURIComponent(ticker)}`;
  const age = ageSeconds ?? item.ageSeconds;
  const changeTone = tone(candle?.changePct);
  const ChangeIcon = changeTone === 'up' ? TrendingUp : changeTone === 'down' ? TrendingDown : Minus;

  return (
    <article className={`trade-card${stale ? ' is-stale' : ''}${quote ? '' : ' is-empty'}`} aria-label={`Cotação de ${ticker}`}>
      <header className="trade-card-head">
        <Link to={dossierLink} className="trade-card-ticker" title="Abrir o dossiê no Mercado">
          {ticker}
        </Link>
        {stale ? <span className="trade-chip is-warn">Defasado</span> : null}
      </header>

      {!quote ? (
        <p className="trade-card-empty">Sem cotação coletada para este ativo.</p>
      ) : (
        <>
          <div className="trade-card-price">
            <strong>{formatMoney(quote.last)}</strong>
            <span className="trade-card-age" title={`Coletado às ${timeLabel(quote.collectedAt)}`}>
              {age != null ? ageLabel(age) : timeLabel(quote.collectedAt)}
            </span>
          </div>
          <dl className="trade-card-quote">
            <div><dt>Compra</dt><dd>{formatMoney(quote.bid)}</dd></div>
            <div><dt>Venda</dt><dd>{formatMoney(quote.ask)}</dd></div>
            <div><dt>Volume</dt><dd>{formatCompactCount(quote.volume)}</dd></div>
          </dl>
        </>
      )}

      {candle ? (
        <section className="trade-candle" aria-label={`Último candle de ${ticker}`}>
          <div className="trade-candle-head">
            <span className="trade-candle-title">Último candle · {timeLabel(candle.ts)}</span>
            {candle.changePct != null ? (
              <span className={`trade-delta is-${changeTone}`} aria-label={`Variação do candle ${formatSignedPct(candle.changePct)}`}>
                <ChangeIcon size={12} aria-hidden="true" />
                {formatSignedPct(candle.changePct)}
              </span>
            ) : null}
          </div>
          <div className="trade-range" aria-hidden="true">
            <span className="trade-range-marker" style={{ left: `${closePosition(candle.low, candle.high, candle.close)}%` }} />
          </div>
          <dl className="trade-candle-ohlc">
            <div><dt>Abertura</dt><dd>{formatMoney(candle.open)}</dd></div>
            <div><dt>Máxima</dt><dd>{formatMoney(candle.high)}</dd></div>
            <div><dt>Mínima</dt><dd>{formatMoney(candle.low)}</dd></div>
            <div><dt>Fechamento</dt><dd>{formatMoney(candle.close)}</dd></div>
          </dl>
        </section>
      ) : quote ? (
        <p className="trade-card-empty">Sem candle fechado ainda.</p>
      ) : null}
    </article>
  );
}
