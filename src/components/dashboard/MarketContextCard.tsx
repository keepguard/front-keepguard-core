import { useId } from 'react';
import { Activity, Info, LineChart } from 'lucide-react';
import type { AnalystMarketContext } from '../../services/analystService';
import { GAP_REASON_LABEL, METRIC_LABEL } from './marketLabels';
import { formatCompactBrl, formatPct, formatRatio, formatSignedPct } from './dossierFormat';
import { formatDayFull } from '../../utils/dataFreshnessText';

const NO_DATA = 'sem dado';

function signed(value?: number): string {
  return value != null ? formatSignedPct(value) : NO_DATA;
}

function tone(value?: number): 'up' | 'down' | 'flat' {
  if (value == null || value === 0) return 'flat';
  return value > 0 ? 'up' : 'down';
}

/** Volume do último pregão contra a média dos 20 anteriores — descreve, não recomenda. */
function volumeReading(ratio: number): string {
  if (ratio >= 1.5) return 'acima da média';
  if (ratio <= 0.7) return 'abaixo da média';
  return 'perto da média';
}

/**
 * Onde o fechamento está entre a mínima (0) e a máxima (1) de 20 pregões. As distâncias vêm em %:
 * mínima = fechamento ÷ (1 + distMín), máxima = fechamento ÷ (1 + distMáx).
 */
function rangePosition(distFromLow?: number, distFromHigh?: number): number | null {
  if (distFromLow == null || distFromHigh == null) return null;
  const low = 1 / (1 + distFromLow / 100);
  const high = 1 / (1 + distFromHigh / 100);
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) return null;
  return Math.min(1, Math.max(0, (1 - low) / (high - low)));
}

function Tile({ label, value, sub, valueTone }: { label: string; value: string; sub?: string; valueTone?: 'up' | 'down' | 'flat' }) {
  return (
    <article className="dossier-tile">
      <span className="dossier-tile-label">{label}</span>
      <strong className={`dossier-tile-value${valueTone ? ` is-${valueTone}` : ''}`}>{value}</strong>
      {sub ? <span className="dossier-tile-sub">{sub}</span> : null}
    </article>
  );
}

function Row({ label, value, valueTone }: { label: string; value: string; valueTone?: 'up' | 'down' | 'flat' }) {
  return (
    <div className="dossier-row">
      <dt>{label}</dt>
      <dd className={valueTone ? `is-${valueTone}` : undefined}>{value}</dd>
    </div>
  );
}

export interface MarketContextCardProps {
  context?: AnalystMarketContext | null;
}

/**
 * Contexto de mercado de curto prazo de ações e FIIs: movimento, posição no preço, volume e
 * risco. Informativo: fica fora da tese e dos sinais, e não é recomendação.
 */
export function MarketContextCard({ context }: MarketContextCardProps) {
  const sectionId = useId();

  if (!context) {
    return (
      <p className="text-muted dossier-ctx-empty" role="status">
        O contexto de mercado de curto prazo aparece a partir da próxima análise deste ativo.
      </p>
    );
  }

  const gaps = context.gaps ?? [];
  const position = rangePosition(context.distFromLow20DPct, context.distFromHigh20DPct);
  const volume = context.relativeVolume;

  return (
    <section className="dossier-ctx" aria-labelledby={`${sectionId}-title`}>
      <header className="dossier-ctx-head">
        <div>
          <span className="dossier-kicker">Contexto de mercado</span>
          <h3 id={`${sectionId}-title`} className="dossier-ctx-title">Curto prazo</h3>
        </div>
        <span className="dossier-ctx-base">Base: fechamento de {formatDayFull(context.asOfDay)}</span>
      </header>

      <div className="dossier-tiles">
        <Tile label="1 dia" value={signed(context.return1D)} valueTone={tone(context.return1D)} />
        <Tile label="5 dias" value={signed(context.return5D)} valueTone={tone(context.return5D)} />
        <Tile label="1 mês" value={signed(context.return1M)} valueTone={tone(context.return1M)} />
        <Tile
          label="Volume relativo"
          value={volume != null ? formatRatio(volume) : NO_DATA}
          sub={volume != null ? volumeReading(volume) : undefined}
        />
        <Tile
          label="Volatilidade 30 dias"
          value={context.volatility30D != null ? formatPct(context.volatility30D, 1) : NO_DATA}
        />
        <Tile
          label="Negociado por dia"
          value={context.averageDailyTradedValue != null ? formatCompactBrl(context.averageDailyTradedValue) : NO_DATA}
          sub="média de 20 pregões"
        />
      </div>

      <div className="dossier-ctx-grid">
        <article className="dossier-card" aria-labelledby={`${sectionId}-range`}>
          <h4 id={`${sectionId}-range`} className="dossier-card-title">
            <LineChart size={16} aria-hidden="true" />
            Onde o preço está
          </h4>
          {position != null ? (
            <div className="dossier-range">
              <div className="dossier-range-track" role="img" aria-label={`Fechamento a ${Math.round(position * 100)}% do intervalo entre a mínima e a máxima de 20 pregões`}>
                <span className="dossier-range-marker" style={{ left: `${position * 100}%` }} />
              </div>
              <div className="dossier-range-ends">
                <span>Mínima de 20 pregões</span>
                <span>Máxima de 20 pregões</span>
              </div>
            </div>
          ) : null}
          <dl className="dossier-rows">
            <Row label="Distância da máxima de 20 pregões" value={signed(context.distFromHigh20DPct)} valueTone={tone(context.distFromHigh20DPct)} />
            <Row label="Distância da mínima de 20 pregões" value={signed(context.distFromLow20DPct)} valueTone={tone(context.distFromLow20DPct)} />
            <Row label="Queda desde a máxima de 52 semanas" value={signed(context.drawdown52WPct)} valueTone={tone(context.drawdown52WPct)} />
            <Row label="Cotação vs média de 20 pregões" value={signed(context.priceVsMA20Pct)} valueTone={tone(context.priceVsMA20Pct)} />
            <Row label="Cotação vs média de 50 pregões" value={signed(context.priceVsMA50Pct)} valueTone={tone(context.priceVsMA50Pct)} />
          </dl>
          <p className="dossier-note">Máximas e mínimas são de fechamento.</p>
        </article>

        <article className="dossier-card" aria-labelledby={`${sectionId}-liq`}>
          <h4 id={`${sectionId}-liq`} className="dossier-card-title">
            <Activity size={16} aria-hidden="true" />
            Liquidez e risco
          </h4>
          <dl className="dossier-rows">
            <Row
              label="Volume do último pregão"
              value={volume != null ? `${formatRatio(volume)} a média (${volumeReading(volume)})` : NO_DATA}
            />
            <Row
              label="Valor negociado por dia"
              value={context.averageDailyTradedValue != null ? formatCompactBrl(context.averageDailyTradedValue) : NO_DATA}
            />
            <Row
              label="Volatilidade 30 dias"
              value={context.volatility30D != null ? formatPct(context.volatility30D, 1) : NO_DATA}
            />
          </dl>
          <p className="dossier-note">Média dos 20 pregões anteriores ao último.</p>
        </article>
      </div>

      {gaps.length > 0 ? (
        <p className="dossier-note">
          Sem dado: {gaps
            .map((g) => `${METRIC_LABEL[g.metric] || g.metric} (${GAP_REASON_LABEL[g.reason] || g.reason})`)
            .join(', ')}
        </p>
      ) : null}

      <p className="dossier-note">
        <Info size={14} aria-hidden="true" className="dossier-note-icon" />
        Contexto de mercado, não recomendação: não entra na tese nem nos sinais.
      </p>
    </section>
  );
}
