import { ArrowLeftRight, Gauge, TrendingUp } from 'lucide-react';
import type { AnalystBdrDetails } from '../../services/analystService';
import { dash, formatCompactBrl, formatPct, formatRatio, formatSignedPct } from './dossierFormat';
import { MetricRow } from './DossierMetricRow';

/** Mesmas faixas das regras BdrPE / BdrPriceToSales (RFC-008, parecer 6.0.2). */
const PE_BANDS = { cheapBelow: 15, fairUpTo: 35 };
const PS_BANDS = { cheapBelow: 3, fairUpTo: 12 };

function multipleBand(value: number, bands: { cheapBelow: number; fairUpTo: number }): { label: string; tone: string } {
  if (value < bands.cheapBelow) return { label: 'Barato', tone: 'fii-tone-pill--discount' };
  if (value <= bands.fairUpTo) return { label: 'Justo', tone: 'fii-tone-pill--fair' };
  return { label: 'Caro', tone: 'fii-tone-pill--premium' };
}

function MultipleRow({ label, value, bands }: { label: string; value?: number; bands: { cheapBelow: number; fairUpTo: number } }) {
  if (value == null) return <MetricRow label={label} value="—" />;
  if (value <= 0) return <MetricRow label={label} value="sem lucro/receita positivos" />;
  const band = multipleBand(value, bands);
  return (
    <div className="fii-dossier-metric">
      <dt>{label}</dt>
      <dd>
        {formatRatio(value)}
        <span className={`fii-tone-pill ${band.tone}`}>{band.label}</span>
      </dd>
    </div>
  );
}

function pct(value?: number): string {
  return dash(value != null ? formatPct(value, 1) : null);
}

export interface BdrCardsProps {
  sectionId: string;
  details: AnalystBdrDetails;
}

/** Cartões de múltiplos, qualidade e câmbio dos BDRs (RFC-008 Bloco 6). */
export function BdrCards({ sectionId, details: d }: BdrCardsProps) {
  const windows = d.fxWindows ?? [];
  return (
    <>
      <article className="fii-dossier-card" aria-labelledby={`${sectionId}-multiples`}>
        <h4 id={`${sectionId}-multiples`} className="fii-dossier-card-title">
          <Gauge size={16} aria-hidden="true" />
          Múltiplos da empresa
        </h4>
        <dl className="fii-dossier-metrics">
          <MultipleRow label="P/L" value={d.pe} bands={PE_BANDS} />
          <MultipleRow label="P/Receita" value={d.priceToSales} bands={PS_BANDS} />
          <MetricRow label="EV/EBIT" value={dash(d.evEbit != null ? formatRatio(d.evEbit) : null)} />
          <MetricRow label="Valor de mercado" value={dash(d.marketValue != null ? formatCompactBrl(d.marketValue) : null)} />
          <MetricRow label="Dividend yield" value={pct(d.dividendYield)} />
        </dl>
        <p className="text-muted fii-dossier-empty">
          P/L dos últimos 12 meses (a fonte não divulga P/L projetado). Faixas: P/L barato abaixo de 15 e caro acima de
          35; P/Receita barato abaixo de 3 e caro acima de 12.
        </p>
      </article>

      <article className="fii-dossier-card" aria-labelledby={`${sectionId}-quality`}>
        <h4 id={`${sectionId}-quality`} className="fii-dossier-card-title">
          <TrendingUp size={16} aria-hidden="true" />
          Qualidade &amp; crescimento
        </h4>
        <dl className="fii-dossier-metrics">
          <MetricRow label="ROIC" value={pct(d.roic)} />
          <MetricRow label="ROE" value={pct(d.roe)} />
          <MetricRow label="Margem líquida" value={pct(d.netMargin)} />
          <MetricRow label="Margem bruta" value={pct(d.grossMargin)} />
          <MetricRow label="Receita (5 anos, a.a.)" value={pct(d.revenueCagr5)} />
          <MetricRow label="Lucro (5 anos, a.a.)" value={pct(d.earningsCagr5)} />
          <MetricRow
            label="Dív. líquida/EBIT"
            value={dash(d.netDebtToEbit != null ? formatRatio(d.netDebtToEbit) : null)}
          />
        </dl>
        {d.sector ? (
          <p className="text-muted fii-dossier-empty">
            {d.sector}
            {d.segment && d.segment !== d.sector ? ` · ${d.segment}` : ''}
          </p>
        ) : null}
      </article>

      <article className="fii-dossier-card" aria-labelledby={`${sectionId}-fx`}>
        <h4 id={`${sectionId}-fx`} className="fii-dossier-card-title">
          <ArrowLeftRight size={16} aria-hidden="true" />
          Efeito do câmbio
        </h4>
        {windows.length > 0 ? (
          <div className="fii-dossier-fx-scroll">
            <table className="fii-dossier-fx-table">
              <caption className="text-muted">
                Dólar hoje: {d.usdBrl != null ? `R$ ${d.usdBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—'}.
                "Em dólar" ≈ retorno do BDR descontada a variação do câmbio. Informativo.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Janela</th>
                  <th scope="col">BDR (R$)</th>
                  <th scope="col">Dólar</th>
                  <th scope="col">Em dólar</th>
                </tr>
              </thead>
              <tbody>
                {windows.map((w) => (
                  <tr key={w.window}>
                    <th scope="row">{w.window}</th>
                    <td>{formatSignedPct(w.bdrReturnPct)}</td>
                    <td>{formatSignedPct(w.usdReturnPct)}</td>
                    <td>{formatSignedPct(w.usdTermsReturnPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted fii-dossier-empty">Histórico do dólar insuficiente para comparar neste run.</p>
        )}
      </article>
    </>
  );
}
