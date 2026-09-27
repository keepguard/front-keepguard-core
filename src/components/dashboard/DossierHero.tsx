import type { AnalystMarketContext, AnalystThesis } from '../../services/analystService';
import { formatMoney, formatSignedPct } from './dossierFormat';
import { riskLevelLabel, thesisDisplayLabel, thesisTone } from './marketLabels';
import { formatDayFull } from '../../utils/dataFreshnessText';

export interface DossierHeroProps {
  context?: AnalystMarketContext | null;
  /** Preço do run quando não há contexto de mercado (ETF, BDR e demais classes só preço). */
  fallbackPrice?: number;
  thesis?: AnalystThesis | null;
  riskLevel?: string;
  analyzedAtLabel: string;
  collectedAtLabel?: string;
}

function tone(value?: number): 'up' | 'down' | 'flat' {
  if (value == null || value === 0) return 'flat';
  return value > 0 ? 'up' : 'down';
}

/**
 * Faixa de leitura rápida do dossiê: cotação, variação do dia, tese e risco. É o que o trader
 * precisa ver antes de rolar a página. Descreve, não recomenda.
 */
export function DossierHero({ context, fallbackPrice, thesis, riskLevel, analyzedAtLabel, collectedAtLabel }: DossierHeroProps) {
  const price = context?.lastClose ?? fallbackPrice;
  const day = context?.return1D;
  const thesisToneClass = thesis ? thesisTone(thesis.code) : null;

  return (
    <section className="dossier-hero" aria-label="Resumo do ativo">
      <div className="dossier-hero-price">
        <span className="dossier-hero-label">Cotação</span>
        <strong className="dossier-hero-value">{price != null ? formatMoney(price) : '—'}</strong>
        <span className="dossier-hero-sub">
          {context ? `Fechamento de ${formatDayFull(context.asOfDay)}` : 'Último preço da análise'}
          {day != null ? (
            <span className={`dossier-delta is-${tone(day)}`} aria-label={`Variação de um dia ${formatSignedPct(day)}`}>
              {formatSignedPct(day)}
            </span>
          ) : null}
        </span>
      </div>

      <div className="dossier-hero-read">
        {thesis && thesisToneClass ? (
          <div className={`dossier-hero-thesis is-${thesisToneClass}`}>
            <span className="dossier-hero-label">Tese</span>
            <strong>{thesisDisplayLabel(thesis.code)}</strong>
          </div>
        ) : null}
        {riskLevel ? (
          <div className="dossier-hero-thesis is-risk">
            <span className="dossier-hero-label">Risco</span>
            <strong>{riskLevelLabel(riskLevel)}</strong>
          </div>
        ) : null}
      </div>

      <p className="dossier-hero-meta">
        Analisado em <time>{analyzedAtLabel}</time>
        {collectedAtLabel ? <> · dado coletado em <time>{collectedAtLabel}</time></> : null}
        {' · '}Análise, não recomendação de investimento.
      </p>
    </section>
  );
}
