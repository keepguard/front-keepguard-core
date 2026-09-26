import { useId } from 'react';
import { Activity, Gauge, Info, LineChart } from 'lucide-react';
import type { AnalystMarketContext } from '../../services/analystService';
import { GAP_REASON_LABEL, METRIC_LABEL } from './marketLabels';
import { dash, formatCompactBrl, formatPct, formatRatio, formatSignedPct } from './dossierFormat';
import { MetricRow } from './DossierMetricRow';

const NO_DATA = 'sem dado';

function signed(value?: number): string {
  return value != null ? formatSignedPct(value) : NO_DATA;
}

/** Volume do último pregão contra a média dos 20 anteriores — descreve, não recomenda. */
function volumeReading(ratio: number): string {
  if (ratio >= 1.5) return 'acima da média';
  if (ratio <= 0.7) return 'abaixo da média';
  return 'perto da média';
}

/** dd/MM/aaaa a partir da parte de data do ISO, sem passar pelo fuso do navegador. */
function formatDay(iso?: string): string {
  const match = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—';
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
      <p className="text-muted fii-dossier-empty" role="status">
        O contexto de mercado de curto prazo aparece a partir da próxima análise deste ativo.
      </p>
    );
  }

  const gaps = context.gaps ?? [];

  return (
    <section className="fii-dossier" aria-labelledby={`${sectionId}-title`}>
      <header className="fii-dossier-header">
        <div className="fii-dossier-heading">
          <span className="market-thesis-kicker">Contexto de mercado</span>
          <h3 id={`${sectionId}-title`} className="market-section-title">
            Curto prazo
          </h3>
          <p className="text-muted fii-dossier-identity">Base: fechamento de {formatDay(context.asOfDay)}</p>
        </div>
      </header>

      <dl className="fii-dossier-kpis">
        <div>
          <dt>1 dia</dt>
          <dd>{signed(context.return1D)}</dd>
        </div>
        <div>
          <dt>5 dias</dt>
          <dd>{signed(context.return5D)}</dd>
        </div>
        <div>
          <dt>1 mês</dt>
          <dd>{signed(context.return1M)}</dd>
        </div>
        <div>
          <dt>Volume relativo</dt>
          <dd>{dash(context.relativeVolume != null ? formatRatio(context.relativeVolume) : null)}</dd>
        </div>
      </dl>

      <div className="fii-dossier-cards">
        <article className="fii-dossier-card" aria-labelledby={`${sectionId}-position`}>
          <h4 id={`${sectionId}-position`} className="fii-dossier-card-title">
            <LineChart size={16} aria-hidden="true" />
            Posição no preço
          </h4>
          <dl className="fii-dossier-metrics">
            <MetricRow label="Distância da máxima de 20 pregões" value={signed(context.distFromHigh20DPct)} />
            <MetricRow label="Distância da mínima de 20 pregões" value={signed(context.distFromLow20DPct)} />
            <MetricRow label="Queda desde a máxima de 52 semanas" value={signed(context.drawdown52WPct)} />
            <MetricRow label="Cotação vs média de 20 pregões" value={signed(context.priceVsMA20Pct)} />
            <MetricRow label="Cotação vs média de 50 pregões" value={signed(context.priceVsMA50Pct)} />
          </dl>
          <p className="text-muted fii-dossier-empty">Máximas e mínimas são de fechamento.</p>
        </article>

        <article className="fii-dossier-card" aria-labelledby={`${sectionId}-volume`}>
          <h4 id={`${sectionId}-volume`} className="fii-dossier-card-title">
            <Activity size={16} aria-hidden="true" />
            Volume e risco
          </h4>
          <dl className="fii-dossier-metrics">
            <div className="fii-dossier-metric">
              <dt>Volume do último pregão</dt>
              <dd>
                {context.relativeVolume != null
                  ? `${formatRatio(context.relativeVolume)} a média`
                  : NO_DATA}
                {context.relativeVolume != null ? (
                  <span className="text-muted">{volumeReading(context.relativeVolume)}</span>
                ) : null}
              </dd>
            </div>
            <MetricRow
              label="Valor negociado por dia"
              value={context.averageDailyTradedValue != null ? formatCompactBrl(context.averageDailyTradedValue) : NO_DATA}
            />
            <MetricRow
              label="Volatilidade 30 dias"
              value={context.volatility30D != null ? formatPct(context.volatility30D, 1) : NO_DATA}
            />
          </dl>
          <p className="text-muted fii-dossier-empty">
            <Gauge size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: '0.3rem' }} />
            Média dos 20 pregões anteriores ao último.
          </p>
        </article>
      </div>

      {gaps.length > 0 ? (
        <p className="text-muted fii-dossier-empty">
          Sem dado: {gaps
            .map((g) => `${METRIC_LABEL[g.metric] || g.metric} (${GAP_REASON_LABEL[g.reason] || g.reason})`)
            .join(', ')}
        </p>
      ) : null}

      <p className="text-muted fii-dossier-empty">
        <Info size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: '0.3rem' }} />
        Contexto de mercado, não recomendação: não entra na tese nem nos sinais.
      </p>
    </section>
  );
}
