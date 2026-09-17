import { Landmark, Wallet } from 'lucide-react';
import type { AnalystCreditFundDetails } from '../../services/analystService';
import { dash, formatCompactBrl, formatCount, formatMoney, formatPct, formatRatio } from './dossierFormat';
import { MetricRow } from './DossierMetricRow';

/** Mesmas faixas da regra CreditFundPVP (RFC-008 RN-CRED-01). */
const PVP_CHEAP_BELOW = 0.9;
const PVP_FAIR_UP_TO = 1.05;
/** Mesmas faixas da regra CreditFundDividendYield (spread do yield equivalente vs referência). */
const SPREAD_HEALTHY_FROM = 2;
const SPREAD_NEUTRAL_FROM = -2;

function pvpBand(pvp: number): { label: string; tone: string } {
  if (pvp < PVP_CHEAP_BELOW) return { label: 'Desconto', tone: 'fii-tone-pill--discount' };
  if (pvp <= PVP_FAIR_UP_TO) return { label: 'Justo', tone: 'fii-tone-pill--fair' };
  return { label: 'Ágio', tone: 'fii-tone-pill--premium' };
}

function yieldBand(spread: number): { label: string; tone: string } {
  if (spread >= SPREAD_HEALTHY_FROM) return { label: 'Acima da referência', tone: 'HEALTHY' };
  if (spread >= SPREAD_NEUTRAL_FROM) return { label: 'Em linha', tone: 'NEUTRAL' };
  return { label: 'Abaixo da referência', tone: 'RISKY' };
}

export interface CreditFundCardsProps {
  sectionId: string;
  details: AnalystCreditFundDetails;
}

/** Cartões de renda e patrimônio dos fundos de crédito (Fiagro, FI-Infra — RFC-008 Bloco 5). */
export function CreditFundCards({ sectionId, details: d }: CreditFundCardsProps) {
  const spread = d.grossUpYield12M != null ? d.grossUpYield12M - d.referenceRatePct : undefined;
  const yieldTone = spread != null ? yieldBand(spread) : null;
  const band = d.pvp != null ? pvpBand(d.pvp) : null;
  const taxRate = formatPct(d.grossUpTaxRatePct, 0);

  return (
    <>
      <article className="fii-dossier-card" aria-labelledby={`${sectionId}-income`}>
        <h4 id={`${sectionId}-income`} className="fii-dossier-card-title">
          <Wallet size={16} aria-hidden="true" />
          Renda &amp; yield
        </h4>
        {d.dividendYield12M != null ? (
          <>
            <p className="fii-dossier-card-lead">
              <strong>{formatPct(d.dividendYield12M)}</strong>
              <span className="text-muted">DY 12M, isento de IR</span>
            </p>
            <dl className="fii-dossier-metrics">
              <div className="fii-dossier-metric">
                <dt>Equivalente tributado</dt>
                <dd>
                  {dash(d.grossUpYield12M != null ? formatPct(d.grossUpYield12M) : null)}
                  {yieldTone ? <span className={`fii-tone-pill ${yieldTone.tone}`}>{yieldTone.label}</span> : null}
                </dd>
              </div>
              <MetricRow label="Taxa de referência" value={formatPct(d.referenceRatePct)} />
              <MetricRow
                label="Proventos 12M"
                value={
                  d.dividends12M != null
                    ? `${formatMoney(d.dividends12M)} em ${d.payments12M} pagamento${d.payments12M === 1 ? '' : 's'}`
                    : '—'
                }
              />
              <MetricRow
                label="Último rendimento"
                value={dash(d.lastDividendValue != null ? formatMoney(d.lastDividendValue) : null)}
              />
            </dl>
            <p className="text-muted fii-dossier-empty">
              Equivalente a uma aplicação tributada com IR de {taxRate} (prazo acima de 720 dias). A isenção vale para
              pessoa física e depende de o fundo cumprir os requisitos legais.
            </p>
          </>
        ) : (
          <p className="text-muted fii-dossier-empty">Proventos indisponíveis neste run.</p>
        )}
      </article>

      <article className="fii-dossier-card" aria-labelledby={`${sectionId}-book`}>
        <h4 id={`${sectionId}-book`} className="fii-dossier-card-title">
          <Landmark size={16} aria-hidden="true" />
          Patrimônio
        </h4>
        {!d.pvpPublished ? (
          <p className="text-muted fii-dossier-empty">
            P/VP, valor patrimonial e patrimônio não são divulgados pela fonte para FI-Infra.
          </p>
        ) : (
          <>
            {d.pvp != null && band ? (
              <p className="fii-dossier-card-lead">
                <strong>{formatRatio(d.pvp)}</strong>
                <span className={`fii-tone-pill ${band.tone}`}>{band.label}</span>
              </p>
            ) : (
              <p className="text-muted fii-dossier-empty">P/VP indisponível neste run.</p>
            )}
            <dl className="fii-dossier-metrics">
              <MetricRow label="VP por cota" value={dash(d.vpPerShare != null ? formatMoney(d.vpPerShare) : null)} />
              <MetricRow label="Patrimônio" value={dash(d.netWorth != null ? formatCompactBrl(d.netWorth) : null)} />
              <MetricRow label="Reserva em caixa" value={dash(d.cashPercentage != null ? formatPct(d.cashPercentage) : null)} />
              <MetricRow
                label="Base de cotistas"
                value={dash(d.shareholderCount != null ? formatCount(d.shareholderCount) : null)}
              />
            </dl>
          </>
        )}
      </article>
    </>
  );
}
