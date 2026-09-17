import { useId } from 'react';
import { Building2, Droplets, Scale, Wallet } from 'lucide-react';
import type {
  AnalystFiiDetails,
  AnalystInputPoint,
  AnalystSignal,
} from '../../services/analystService';
import { dash, formatCompactBrl, formatCount, formatMoney, formatPct } from './dossierFormat';
import { MetricRow } from './DossierMetricRow';

const PVP_SCALE_MIN = 0.7;
const PVP_JUSTO_START = 0.9;
const PVP_AGIO_START = 1.05;
const PVP_SCALE_MAX = 1.2;

function fiiSegmentLabel(details?: AnalystFiiDetails | null): string | null {
  const sector = details?.sectorType?.trim() || '';
  const segment = details?.segment?.trim() || '';
  if (sector && segment) {
    if (segment.toLowerCase().includes(sector.toLowerCase())) return segment;
    if (sector.toLowerCase().includes(segment.toLowerCase())) return sector;
    return `${sector} · ${segment}`;
  }
  return sector || segment || null;
}

export interface FiiDossierViewProps {
  loading?: boolean;
  ticker?: string;
  displayName?: string;
  fiiDetails?: AnalystFiiDetails | null;
  signals?: AnalystSignal[];
  currentInputs?: Record<string, AnalystInputPoint>;
  macroInputs?: Record<string, AnalystInputPoint>;
}

function inputNum(
  inputs: Record<string, AnalystInputPoint> | undefined,
  key: string,
): number | undefined {
  const value = inputs?.[key]?.valueNum;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function signalOf(signals: AnalystSignal[] | undefined, ...metrics: string[]): AnalystSignal | undefined {
  if (!signals?.length) return undefined;
  const wanted = new Set(metrics);
  return signals.find((signal) => wanted.has(signal.metric) || (signal.code != null && wanted.has(signal.code)));
}

function signalNum(signal?: AnalystSignal): number | undefined {
  if (typeof signal?.valueNum === 'number' && Number.isFinite(signal.valueNum)) return signal.valueNum;
  if (typeof signal?.grounding?.valueNum === 'number' && Number.isFinite(signal.grounding.valueNum)) {
    return signal.grounding.valueNum;
  }
  return undefined;
}

function formatRatio(value: number): string {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
}

function formatPlainRatio(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSpreadPp(value: number): string {
  const abs = Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (value > 0) return `+${abs} pp`;
  if (value < 0) return `−${abs} pp`;
  return `${abs} pp`;
}

function formatVsBookPct(pvp: number): string {
  const pct = Math.abs((1 - pvp) * 100);
  const digits = Math.abs(pct - Math.round(pct)) < 0.05 ? 0 : 1;
  return pct.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

type PvpBand = 'discount' | 'fair' | 'premium';

function pvpBand(pvp: number): PvpBand {
  if (pvp < PVP_JUSTO_START) return 'discount';
  if (pvp <= PVP_AGIO_START) return 'fair';
  return 'premium';
}

function pvpBandLabel(band: PvpBand): string {
  if (band === 'discount') return 'Desconto';
  if (band === 'fair') return 'Justo';
  return 'Ágio';
}

function pvpPositionPct(pvp: number): number {
  const raw = ((pvp - PVP_SCALE_MIN) / (PVP_SCALE_MAX - PVP_SCALE_MIN)) * 100;
  return Math.min(100, Math.max(0, raw));
}

function pvpAriaLabel(pvp: number): string {
  const shown = formatPlainRatio(pvp);
  if (pvp < 1) {
    return `Preço sobre valor patrimonial em ${shown}, indicando ${formatVsBookPct(pvp)}% de desconto patrimonial`;
  }
  if (pvp > 1) {
    return `Preço sobre valor patrimonial em ${shown}, indicando ${formatVsBookPct(pvp)}% de ágio patrimonial`;
  }
  return `Preço sobre valor patrimonial em ${shown}, em linha com o valor patrimonial`;
}

function liquidityToneLabel(verdict?: string): { label: string; tone: string } | null {
  if (!verdict || verdict === 'MISSING') return null;
  if (verdict === 'HEALTHY') return { label: 'Alta', tone: 'HEALTHY' };
  if (verdict === 'RISKY') return { label: 'Baixa', tone: 'RISKY' };
  if (verdict === 'NEUTRAL' || verdict === 'FAIR') return { label: 'Moderada', tone: 'NEUTRAL' };
  return { label: verdict, tone: verdict };
}

function PvpGauge({ pvp }: { pvp: number }) {
  const band = pvpBand(pvp);
  const markerPct = pvpPositionPct(pvp);
  const justoStartPct = pvpPositionPct(PVP_JUSTO_START);
  const agioStartPct = pvpPositionPct(PVP_AGIO_START);
  const valuetext = `${formatRatio(pvp)}, ${pvpBandLabel(band).toLowerCase()}`;

  return (
    <div className="fii-pvp-gauge">
      <div
        className="fii-pvp-meter"
        role="meter"
        aria-label={pvpAriaLabel(pvp)}
        aria-valuemin={PVP_SCALE_MIN}
        aria-valuemax={PVP_SCALE_MAX}
        aria-valuenow={Number(pvp.toFixed(2))}
        aria-valuetext={valuetext}
      >
        <div className="fii-pvp-track" aria-hidden="true">
          <span className="fii-pvp-zone fii-pvp-zone--discount" style={{ width: `${justoStartPct}%` }} />
          <span className="fii-pvp-zone fii-pvp-zone--fair" style={{ width: `${agioStartPct - justoStartPct}%` }} />
          <span className="fii-pvp-zone fii-pvp-zone--premium" style={{ width: `${100 - agioStartPct}%` }} />
          <span className="fii-pvp-marker" style={{ left: `${markerPct}%` }}>
            <span className="fii-pvp-marker-value">{formatRatio(pvp)}</span>
            <span className="fii-pvp-marker-stem" />
          </span>
        </div>
      </div>
      <ul className="fii-pvp-legend">
        <li>
          <span className="fii-pvp-swatch fii-pvp-swatch--discount" aria-hidden="true" />
          Desconto &lt; 0,90x
        </li>
        <li>
          <span className="fii-pvp-swatch fii-pvp-swatch--fair" aria-hidden="true" />
          Justo 0,90x–1,05x
        </li>
        <li>
          <span className="fii-pvp-swatch fii-pvp-swatch--premium" aria-hidden="true" />
          Ágio &gt; 1,05x
        </li>
      </ul>
    </div>
  );
}

export function FiiDossierView({
  loading = false,
  ticker,
  displayName,
  fiiDetails,
  signals,
  currentInputs,
  macroInputs,
}: FiiDossierViewProps) {
  const sectionId = useId();

  if (loading) {
    return (
      <section
        className="fii-dossier fii-dossier--loading"
        aria-busy="true"
        aria-live="polite"
        aria-label="Carregando dossiê imobiliário"
      >
        <div className="fii-dossier-skeleton-badge" />
        <div className="fii-dossier-kpis">
          <div className="market-skeleton fii-dossier-skeleton-kpi" />
          <div className="market-skeleton fii-dossier-skeleton-kpi" />
          <div className="market-skeleton fii-dossier-skeleton-kpi" />
          <div className="market-skeleton fii-dossier-skeleton-kpi" />
        </div>
        <div className="fii-dossier-cards">
          <div className="market-skeleton fii-dossier-skeleton-card" />
          <div className="market-skeleton fii-dossier-skeleton-card" />
          <div className="market-skeleton fii-dossier-skeleton-card" />
        </div>
      </section>
    );
  }

  const pvpSignal = signalOf(signals, 'fii_pvp', 'pvp');
  const dySignal = signalOf(signals, 'fii_dividend_yield', 'dy_pct');
  const liqSignal = signalOf(signals, 'fii_daily_liquidity');
  const cashSignal = signalOf(signals, 'fii_cash_reserve');

  const pvp = signalNum(pvpSignal) ?? inputNum(currentInputs, 'pvp');
  const vpPerShare = fiiDetails?.vpPerShare ?? inputNum(currentInputs, 'valor_patrimonial_cota');
  const price =
    inputNum(currentInputs, 'price') ??
    (pvp != null && vpPerShare != null ? pvp * vpPerShare : undefined);
  const dy = signalNum(dySignal) ?? inputNum(currentInputs, 'dy_pct');
  const lastDividend = fiiDetails?.lastDividendValue ?? inputNum(currentInputs, 'ultimo_rendimento');
  const liquidity = signalNum(liqSignal) ?? inputNum(currentInputs, 'liquidez_media_diaria');
  const netWorth = fiiDetails?.netWorth ?? inputNum(currentInputs, 'patrimonio_liquido');
  const shareholders = fiiDetails?.shareholderCount ?? inputNum(currentInputs, 'numero_cotistas');
  const cash = fiiDetails?.cashPercentage ?? signalNum(cashSignal) ?? inputNum(currentInputs, 'percentual_caixa');
  const selic = inputNum(macroInputs, 'selic_meta_pct') ?? inputNum(macroInputs, 'cdi_pct');
  const spread = dy != null && selic != null ? dy - selic : undefined;
  const segment = fiiSegmentLabel(fiiDetails);
  const band = pvp != null ? pvpBand(pvp) : null;
  const vsBook =
    pvp != null && pvp !== 1
      ? `${pvp < 1 ? '−' : '+'}${formatVsBookPct(pvp)}%`
      : pvp === 1
        ? '0%'
        : null;
  const liquidityBadge = liquidityToneLabel(liqSignal?.verdict);
  const name = displayName || ticker || 'FII';

  return (
    <section className="fii-dossier" aria-labelledby={`${sectionId}-title`}>
      <header className="fii-dossier-header">
        <div className="fii-dossier-heading">
          <span className="market-thesis-kicker">Dossiê imobiliário</span>
          <h3 id={`${sectionId}-title`} className="market-section-title">
            Indicadores imobiliários
          </h3>
          {ticker ? (
            <p className="text-muted fii-dossier-identity">
              {name}
              {ticker && name !== ticker ? ` · ${ticker}` : ''}
              {fiiDetails?.adminName ? ` · ${fiiDetails.adminName}` : ''}
            </p>
          ) : null}
        </div>
        {segment ? (
          <p className="fii-segment-badge" aria-label={`Segmento do fundo: ${segment}`}>
            <Building2 size={14} aria-hidden="true" />
            <span>{segment}</span>
          </p>
        ) : (
          <p className="text-muted fii-segment-missing" role="status">
            Segmento não informado neste run
          </p>
        )}
      </header>

      <dl className="fii-dossier-kpis">
        <div>
          <dt>Cotação</dt>
          <dd>{dash(price != null ? formatMoney(price) : null)}</dd>
        </div>
        <div>
          <dt>VP/Cota</dt>
          <dd>{dash(vpPerShare != null ? formatMoney(vpPerShare) : null)}</dd>
        </div>
        <div>
          <dt>P/VP</dt>
          <dd>{dash(pvp != null ? formatRatio(pvp) : null)}</dd>
        </div>
        <div>
          <dt>DY 12M</dt>
          <dd>{dash(dy != null ? formatPct(dy) : null)}</dd>
        </div>
      </dl>

      <div className="fii-dossier-cards">
        <article className="fii-dossier-card" aria-labelledby={`${sectionId}-pvp`}>
          <h4 id={`${sectionId}-pvp`} className="fii-dossier-card-title">
            <Scale size={16} aria-hidden="true" />
            Desconto / Ágio (P/VP)
          </h4>
          {pvp != null ? (
            <>
              <p className="fii-dossier-card-lead">
                <strong>{formatRatio(pvp)}</strong>
                <span className={`fii-tone-pill fii-tone-pill--${band}`}>{pvpBandLabel(band!)}</span>
              </p>
              <PvpGauge pvp={pvp} />
              <dl className="fii-dossier-metrics">
                <MetricRow label="VP por cota" value={dash(vpPerShare != null ? formatMoney(vpPerShare) : null)} />
                <MetricRow
                  label={pvp < 1 ? 'Desconto real' : pvp > 1 ? 'Ágio real' : 'Vs. patrimônio'}
                  value={dash(vsBook)}
                />
              </dl>
            </>
          ) : (
            <p className="text-muted fii-dossier-empty">P/VP indisponível neste run.</p>
          )}
        </article>

        <article className="fii-dossier-card" aria-labelledby={`${sectionId}-yield`}>
          <h4 id={`${sectionId}-yield`} className="fii-dossier-card-title">
            <Wallet size={16} aria-hidden="true" />
            Renda &amp; Yield
          </h4>
          {dy != null || lastDividend != null ? (
            <dl className="fii-dossier-metrics">
              <MetricRow label="DY 12M" value={dash(dy != null ? formatPct(dy) : null)} />
              <MetricRow
                label="Último rendimento"
                value={dash(lastDividend != null ? formatMoney(lastDividend) : null)}
              />
              <MetricRow
                label="Spread vs Selic"
                value={dash(spread != null ? formatSpreadPp(spread) : null)}
              />
            </dl>
          ) : (
            <p className="text-muted fii-dossier-empty">Rendimentos indisponíveis neste run.</p>
          )}
        </article>

        <article className="fii-dossier-card" aria-labelledby={`${sectionId}-liq`}>
          <h4 id={`${sectionId}-liq`} className="fii-dossier-card-title">
            <Droplets size={16} aria-hidden="true" />
            Liquidez &amp; Porte
          </h4>
          {liquidity != null || netWorth != null || shareholders != null || cash != null ? (
            <dl className="fii-dossier-metrics">
              <div className="fii-dossier-metric">
                <dt>Liquidez</dt>
                <dd>
                  {liquidity != null ? `${formatCompactBrl(liquidity)}/dia` : '—'}
                  {liquidityBadge ? (
                    <span className={`fii-tone-pill ${liquidityBadge.tone}`}>
                      {liquidityBadge.label}
                    </span>
                  ) : null}
                </dd>
              </div>
              <MetricRow
                label="Patrimônio"
                value={dash(netWorth != null ? formatCompactBrl(netWorth) : null)}
              />
              <MetricRow
                label="Base de cotistas"
                value={dash(shareholders != null ? formatCount(shareholders) : null)}
              />
              <MetricRow
                label="Reserva em caixa"
                value={dash(cash != null ? formatPct(cash) : null)}
              />
            </dl>
          ) : (
            <p className="text-muted fii-dossier-empty">Porte e liquidez indisponíveis neste run.</p>
          )}
        </article>
      </div>
    </section>
  );
}
