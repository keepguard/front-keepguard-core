import { Link } from 'react-router-dom';
import { Check, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { TradeItem, TradeOpportunity } from '../../services/tradeService';
import { PATHS } from '../../navigation/routes';
import { ageLabel, formatCompactCount, formatMoney, formatSignedPct } from './dossierFormat';

/** Nome de exibição do setup — só `turtle_soup` ativo em produção hoje, mas o mapa já cobre
 * o catálogo inteiro pra quando outro setup for promovido (ver srv-mt5-analytics/catalogo.go). */
const SETUP_LABEL: Record<string, string> = {
  turtle_soup: 'Turtle Soup',
  wyckoff_spring_upthrust: 'Wyckoff Spring/Upthrust',
  wyckoff_sos_lps: 'Wyckoff SOS/LPS',
  holy_grail: 'Holy Grail',
  dow_pullback_media_movel: 'Dow — Pullback na Média',
  dow_rompimento_confirmado: 'Dow — Rompimento Confirmado',
  rsi2_mean_reversion: 'RSI(2) Mean Reversion',
};

/** Hora de Brasília, sempre: o pregão é da B3 e o fuso do navegador não pode mudar o que o candle diz. */
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
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

export function TradeAssetCard({
  item,
  ageSeconds,
  opportunity,
}: {
  item: TradeItem;
  ageSeconds?: number;
  /** Ausente = sem sinal ativo agora para este ativo (o normal, na maior parte do tempo). */
  opportunity?: TradeOpportunity;
}) {
  const { ticker, quote, candle, stale } = item;
  const dossierLink = `${PATHS.market}?ticker=${encodeURIComponent(ticker)}`;
  const age = ageSeconds ?? item.ageSeconds;
  const changeTone = tone(candle?.changePct);
  const ChangeIcon = changeTone === 'up' ? TrendingUp : changeTone === 'down' ? TrendingDown : Minus;

  return (
    <article
      className={`trade-card${stale ? ' is-stale' : ''}${quote ? '' : ' is-empty'}${opportunity ? ' has-signal' : ''}`}
      aria-label={`Cotação de ${ticker}`}
    >
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

      {opportunity ? (
        <section className="trade-signal" aria-label={`Oportunidade identificada em ${ticker}`}>
          <div className="trade-signal-head">
            <span className="trade-signal-badge">
              <Check size={12} aria-hidden="true" />
              {opportunity.direcao === 'compra' ? 'Compra' : opportunity.direcao === 'venda' ? 'Venda' : opportunity.direcao}
            </span>
            <span className="trade-signal-setup">{SETUP_LABEL[opportunity.setup] ?? opportunity.setup}</span>
          </div>
          <dl className="trade-signal-levels">
            <div className="entrada"><dt>Entrada</dt><dd>{formatMoney(opportunity.entrada)}</dd></div>
            <div className="stop"><dt>Stop</dt><dd>{formatMoney(opportunity.stop)}</dd></div>
            <div className="alvo"><dt>Alvo</dt><dd>{formatMoney(opportunity.alvo)}</dd></div>
          </dl>
        </section>
      ) : null}
    </article>
  );
}
