import { useId } from 'react';
import { Activity, Info, LineChart, MoveVertical } from 'lucide-react';
import type { AnalystCreditFundDetails, AnalystEtfDetails, AnalystPriceDetails } from '../../services/analystService';
import { CreditFundCards } from './CreditFundCards';
import {
  dash,
  formatCompactBrl,
  formatCompactCount,
  formatMoney,
  formatPct,
  formatRatio,
  formatSignedPct,
} from './dossierFormat';
import { MetricRow } from './DossierMetricRow';

/** Mesmas faixas da regra PriceVs52w (RFC-008 RN-ETF-04). */
const RANGE_LOW_END = 30;
const RANGE_HIGH_START = 70;

const INSUFFICIENT = 'histórico insuficiente';

type PriceOnlyClass = 'ETF' | 'BDR' | 'FIAGRO' | 'FI_INFRA';

const CLASS_COPY: Record<PriceOnlyClass, { kicker: string; name: string; pending?: string }> = {
  ETF: {
    kicker: 'Dossiê do fundo de índice',
    name: 'Fundo de índice (ETF)',
  },
  BDR: {
    kicker: 'Dossiê do BDR',
    name: 'BDR',
    pending: 'Múltiplos da empresa estrangeira (P/L, P/L projetado, P/Receita) e efeito do câmbio ainda não estão disponíveis.',
  },
  FIAGRO: {
    kicker: 'Dossiê do fundo de crédito',
    name: 'Fiagro',
  },
  FI_INFRA: {
    kicker: 'Dossiê do fundo de crédito',
    name: 'FI-Infra',
  },
};

const VOLATILITY_TONE: Record<string, { label: string; tone: string }> = {
  BAIXA: { label: 'Baixa', tone: 'HEALTHY' },
  MODERADA: { label: 'Moderada', tone: 'NEUTRAL' },
  ALTA: { label: 'Alta', tone: 'RISKY' },
};

function rangeZoneLabel(position: number): string {
  if (position < RANGE_LOW_END) return 'Perto da mínima';
  if (position > RANGE_HIGH_START) return 'Perto da máxima';
  return 'Meio da faixa';
}

function RangeGauge({ position }: { position: number }) {
  const marker = Math.min(100, Math.max(0, position));
  const shown = formatPct(position, 0);
  return (
    <div className="fii-pvp-gauge">
      <div
        className="fii-pvp-meter"
        role="meter"
        aria-label={`Cotação em ${shown} da faixa de 52 semanas, entre a mínima (0%) e a máxima (100%)`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(marker)}
        aria-valuetext={`${shown}, ${rangeZoneLabel(position).toLowerCase()}`}
      >
        <div className="fii-pvp-track" aria-hidden="true">
          <span className="fii-pvp-zone fii-pvp-zone--discount" style={{ width: `${RANGE_LOW_END}%` }} />
          <span className="fii-pvp-zone fii-pvp-zone--fair" style={{ width: `${RANGE_HIGH_START - RANGE_LOW_END}%` }} />
          <span className="fii-pvp-zone fii-pvp-zone--premium" style={{ width: `${100 - RANGE_HIGH_START}%` }} />
          <span className="fii-pvp-marker" style={{ left: `${marker}%` }}>
            <span className="fii-pvp-marker-value">{shown}</span>
            <span className="fii-pvp-marker-stem" />
          </span>
        </div>
      </div>
      <ul className="fii-pvp-legend">
        <li>
          <span className="fii-pvp-swatch fii-pvp-swatch--discount" aria-hidden="true" />
          Perto da mínima &lt; 30%
        </li>
        <li>
          <span className="fii-pvp-swatch fii-pvp-swatch--fair" aria-hidden="true" />
          Meio 30%–70%
        </li>
        <li>
          <span className="fii-pvp-swatch fii-pvp-swatch--premium" aria-hidden="true" />
          Perto da máxima &gt; 70%
        </li>
      </ul>
    </div>
  );
}

function returnValue(value?: number): string {
  return value != null ? formatSignedPct(value) : INSUFFICIENT;
}

export interface PriceDossierViewProps {
  assetType: string;
  ticker?: string;
  displayName?: string;
  segment?: string;
  priceDetails?: AnalystPriceDetails | null;
  etfDetails?: AnalystEtfDetails | null;
  creditDetails?: AnalystCreditFundDetails | null;
}

/**
 * Dossiê das classes avaliadas só por preço (ETF, BDR, Fiagro, FI-Infra — RFC-008 Bloco 4):
 * faixa de 52 semanas, retornos, risco e liquidez, sem métricas corporativas.
 */
export function PriceDossierView({
  assetType,
  ticker,
  displayName,
  segment,
  priceDetails,
  etfDetails,
  creditDetails,
}: PriceDossierViewProps) {
  const sectionId = useId();
  const copy = CLASS_COPY[assetType as PriceOnlyClass] ?? CLASS_COPY.ETF;
  const d = priceDetails;
  const name = displayName || ticker || copy.name;
  const volatility = d?.volatilityClass ? VOLATILITY_TONE[d.volatilityClass] : undefined;
  const benchmark = etfDetails?.benchmark;
  const badge = benchmark ? `Replica: ${benchmark}` : segment;
  const credit = assetType === 'FIAGRO' || assetType === 'FI_INFRA' ? creditDetails : null;

  return (
    <section className="fii-dossier" aria-labelledby={`${sectionId}-title`}>
      <header className="fii-dossier-header">
        <div className="fii-dossier-heading">
          <span className="market-thesis-kicker">{copy.kicker}</span>
          <h3 id={`${sectionId}-title`} className="market-section-title">
            Preço, risco e liquidez
          </h3>
          {ticker ? (
            <p className="text-muted fii-dossier-identity">
              {name}
              {name !== ticker ? ` · ${ticker}` : ''}
              {` · ${copy.name}`}
            </p>
          ) : null}
        </div>
        {badge ? (
          <p className="fii-segment-badge">
            <LineChart size={14} aria-hidden="true" />
            <span>{badge}</span>
          </p>
        ) : null}
      </header>

      {d ? (
        <dl className="fii-dossier-kpis">
          <div>
            <dt>Cotação</dt>
            <dd>{dash(d.currentPrice != null ? formatMoney(d.currentPrice) : null)}</dd>
          </div>
          {credit ? (
            <>
              <div>
                <dt>DY 12M</dt>
                <dd>{dash(credit.dividendYield12M != null ? formatPct(credit.dividendYield12M) : null)}</dd>
              </div>
              <div>
                <dt>P/VP</dt>
                <dd>
                  {credit.pvpPublished
                    ? dash(credit.pvp != null ? formatRatio(credit.pvp) : null)
                    : 'não divulgado'}
                </dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt>Retorno 12M</dt>
                <dd>{dash(d.return12M != null ? formatSignedPct(d.return12M) : null)}</dd>
              </div>
              <div>
                <dt>Volatilidade 30D</dt>
                <dd>{dash(d.volatility30D != null ? formatPct(d.volatility30D, 1) : null)}</dd>
              </div>
            </>
          )}
          <div>
            <dt>Negociado/dia</dt>
            <dd>{dash(d.averageDailyTradedValue != null ? formatCompactBrl(d.averageDailyTradedValue) : null)}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-muted fii-dossier-empty" role="status">
          Métricas de preço, risco e liquidez aparecem a partir da próxima análise deste ativo.
        </p>
      )}

      {d || credit ? (
        <div className="fii-dossier-cards">
          {credit ? <CreditFundCards sectionId={sectionId} details={credit} /> : null}
          {d ? (
            <>
              <article className="fii-dossier-card" aria-labelledby={`${sectionId}-range`}>
                <h4 id={`${sectionId}-range`} className="fii-dossier-card-title">
                  <MoveVertical size={16} aria-hidden="true" />
                  Faixa de 52 semanas
                </h4>
                {d.range52WPositionPct != null ? (
                  <>
                    <p className="fii-dossier-card-lead">
                      <strong>{formatPct(d.range52WPositionPct, 0)}</strong>
                      <span className="text-muted">{rangeZoneLabel(d.range52WPositionPct)}</span>
                    </p>
                    <RangeGauge position={d.range52WPositionPct} />
                  </>
                ) : (
                  <p className="text-muted fii-dossier-empty">Preço estável no período: sem faixa para comparar.</p>
                )}
                <dl className="fii-dossier-metrics">
                  <MetricRow label="Mínima" value={dash(d.low52W != null ? formatMoney(d.low52W) : null)} />
                  <MetricRow label="Máxima" value={dash(d.high52W != null ? formatMoney(d.high52W) : null)} />
                  <MetricRow
                    label="Queda desde a máxima"
                    value={dash(d.drawdown52W != null ? formatSignedPct(d.drawdown52W) : null)}
                  />
                </dl>
              </article>

              <article className="fii-dossier-card" aria-labelledby={`${sectionId}-returns`}>
                <h4 id={`${sectionId}-returns`} className="fii-dossier-card-title">
                  <LineChart size={16} aria-hidden="true" />
                  Retornos
                </h4>
                <dl className="fii-dossier-metrics">
                  <MetricRow label="1 mês" value={returnValue(d.return1M)} />
                  <MetricRow label="6 meses" value={returnValue(d.return6M)} />
                  <MetricRow label="12 meses" value={returnValue(d.return12M)} />
                </dl>
                <p className="text-muted fii-dossier-empty">
                  Variação da cota em {d.tradingDays} pregões coletados.
                  {benchmark ? ' Comparação com o índice ainda não disponível.' : ''}
                </p>
              </article>

              <article className="fii-dossier-card" aria-labelledby={`${sectionId}-risk`}>
                <h4 id={`${sectionId}-risk`} className="fii-dossier-card-title">
                  <Activity size={16} aria-hidden="true" />
                  Risco &amp; liquidez
                </h4>
                <dl className="fii-dossier-metrics">
                  <div className="fii-dossier-metric">
                    <dt>Volatilidade 30 dias</dt>
                    <dd>
                      {d.volatility30D != null ? formatPct(d.volatility30D, 1) : INSUFFICIENT}
                      {volatility ? (
                        <span className={`fii-tone-pill ${volatility.tone}`}>{volatility.label}</span>
                      ) : null}
                    </dd>
                  </div>
                  <MetricRow
                    label="Volatilidade 12 meses"
                    value={d.volatility1Y != null ? formatPct(d.volatility1Y, 1) : INSUFFICIENT}
                  />
                  <MetricRow
                    label="Valor negociado/dia"
                    value={d.averageDailyTradedValue != null ? formatCompactBrl(d.averageDailyTradedValue) : INSUFFICIENT}
                  />
                  <MetricRow
                    label="Volume médio/dia"
                    value={d.averageDailyVolume != null ? `${formatCompactCount(d.averageDailyVolume)} cotas` : INSUFFICIENT}
                  />
                </dl>
              </article>
            </>
          ) : null}
        </div>
      ) : null}

      <p className="text-muted fii-dossier-empty">
        <Info size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: '0.3rem' }} />
        {assetType === 'ETF'
          ? 'Um ETF replica uma carteira de índice: P/L, ROE, margens, Graham e Bazin não se aplicam.'
          : `Métricas de empresa brasileira (P/L, ROE, Graham, Bazin) não se aplicam a ${copy.name}. ${copy.pending ?? ''}`}
      </p>
    </section>
  );
}
