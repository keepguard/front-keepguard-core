import {
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  Info,
  Sparkles,
} from 'lucide-react';
import type { AnalystFlagsSummary, AnalystFlagItem } from '../../services/analystService';
import { flagCategoryLabel, riskLevelLabel, SEVERITY_LABEL } from './marketLabels';

export interface ExecutiveFlagsPanelProps {
  flags?: AnalystFlagsSummary;
  loading?: boolean;
}

export function ExecutiveFlagsPanel({ flags, loading = false }: ExecutiveFlagsPanelProps) {
  // Estado de Carregamento (Skeleton)
  if (loading) {
    return (
      <section
        className="executive-flags-panel executive-flags-panel--loading"
        aria-label="Carregando síntese executiva de oportunidades e riscos"
        aria-busy="true"
        aria-live="polite"
      >
        <header className="executive-flags-header">
          <div className="executive-flags-skeleton-title" />
          <div className="executive-flags-skeleton-badge" />
        </header>
        <div className="executive-flags-grid">
          <div className="executive-flags-col">
            <div className="executive-flags-skeleton-col-header" />
            <div className="executive-flags-skeleton-card" />
            <div className="executive-flags-skeleton-card" />
          </div>
          <div className="executive-flags-col">
            <div className="executive-flags-skeleton-col-header" />
            <div className="executive-flags-skeleton-card" />
          </div>
        </div>
      </section>
    );
  }

  // Se flags não foram fornecidas ou não há dados sintetizados
  if (!flags || (!flags.greenFlags && !flags.redFlags && !flags.riskLevel)) {
    return null;
  }

  const greenFlags = flags.greenFlags ?? [];
  const redFlags = flags.redFlags ?? [];
  const riskLevel = flags.riskLevel || 'LOW';
  const riskLabel = riskLevelLabel(riskLevel);

  const riskToneClass =
    riskLevel === 'HIGH'
      ? 'risk-badge--high'
      : riskLevel === 'MEDIUM'
      ? 'risk-badge--medium'
      : 'risk-badge--low';

  return (
    <section
      className="executive-flags-panel"
      aria-label="Síntese executiva de oportunidades e fatores de risco"
    >
      <header className="executive-flags-header">
        <div className="executive-flags-title-group">
          <span className="executive-flags-kicker" aria-hidden="true">
            <Sparkles size={14} className="executive-flags-sparkle-icon" />
            Síntese Executiva
          </span>
          <h3 className="executive-flags-title">Oportunidades & Riscos</h3>
        </div>

        <div
          className={`executive-risk-badge ${riskToneClass}`}
          role="status"
          aria-label={`Nível de risco geral da empresa: ${riskLabel}`}
        >
          <span className="risk-badge-dot" aria-hidden="true" />
          <span className="risk-badge-label">Nível de Risco:</span>
          <strong className="risk-badge-value">{riskLabel}</strong>
        </div>
      </header>

      <div className="executive-flags-grid">
        {/* Coluna de Green Flags (Oportunidades) */}
        <div
          className="executive-flags-col executive-flags-col--green"
          aria-labelledby="green-flags-title"
        >
          <div className="executive-flags-col-header">
            <div className="executive-flags-col-title-wrap">
              <span className="col-header-icon col-header-icon--green" aria-hidden="true">
                <TrendingUp size={16} />
              </span>
              <h4 id="green-flags-title" className="executive-flags-col-title">
                Oportunidades & Pontos Fortes
              </h4>
            </div>
            <span
              className="flags-count-chip flags-count-chip--green"
              aria-label={`${flags.totalGreenFlags} oportunidades identificadas`}
            >
              {flags.totalGreenFlags}
            </span>
          </div>

          {greenFlags.length > 0 ? (
            <ul className="flags-list" role="list">
              {greenFlags.map((flag) => (
                <FlagCard key={flag.code} flag={flag} type="green" />
              ))}
            </ul>
          ) : (
            <div
              className="flag-empty-state flag-empty-state--neutral"
              role="status"
              tabIndex={0}
              aria-label={
                flags.emptyGreenState ||
                'Nenhuma oportunidade evidente nos múltiplos e rentabilidade atuais.'
              }
            >
              <Info size={20} className="flag-empty-icon flag-empty-icon--neutral" aria-hidden="true" />
              <div className="flag-empty-body">
                <h5 className="flag-empty-title">Sem oportunidades destacadas</h5>
                <p className="flag-empty-desc">
                  {flags.emptyGreenState ||
                    'Nenhuma oportunidade evidente nos múltiplos e rentabilidade atuais.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Coluna de Red Flags (Riscos) */}
        <div
          className="executive-flags-col executive-flags-col--red"
          aria-labelledby="red-flags-title"
        >
          <div className="executive-flags-col-header">
            <div className="executive-flags-col-title-wrap">
              <span className="col-header-icon col-header-icon--red" aria-hidden="true">
                <AlertTriangle size={16} />
              </span>
              <h4 id="red-flags-title" className="executive-flags-col-title">
                Riscos & Pontos de Atenção
              </h4>
            </div>
            <span
              className="flags-count-chip flags-count-chip--red"
              aria-label={`${flags.totalRedFlags} riscos identificados`}
            >
              {flags.totalRedFlags}
            </span>
          </div>

          {redFlags.length > 0 ? (
            <ul className="flags-list" role="list">
              {redFlags.map((flag) => (
                <FlagCard key={flag.code} flag={flag} type="red" />
              ))}
            </ul>
          ) : (
            <div
              className="flag-empty-state flag-empty-state--positive"
              role="status"
              tabIndex={0}
              aria-label={
                flags.emptyRedState ||
                'Nenhum risco crítico identificado nos demonstrativos contábeis e de endividamento analisados.'
              }
            >
              <ShieldCheck size={22} className="flag-empty-icon flag-empty-icon--positive" aria-hidden="true" />
              <div className="flag-empty-body">
                <h5 className="flag-empty-title">Nenhum risco crítico identificado</h5>
                <p className="flag-empty-desc">
                  {flags.emptyRedState ||
                    'Os indicadores contábeis, endividamento e valuation estão dentro dos parâmetros de segurança da metodologia.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

interface FlagCardProps {
  flag: AnalystFlagItem;
  type: 'green' | 'red';
}

function FlagCard({ flag, type }: FlagCardProps) {
  const categoryLabel = flagCategoryLabel(flag.category);
  const severityLabel = SEVERITY_LABEL[flag.severity] || flag.severity;
  const isGreen = type === 'green';
  const typePrefix = isGreen ? 'Oportunidade' : 'Risco';

  const fullAccessibleLabel = `${typePrefix} em ${categoryLabel}, criticidade ${severityLabel}: ${flag.title}. ${flag.description}`;

  return (
    <li
      className={`flag-card flag-card--${type}`}
      tabIndex={0}
      role="article"
      aria-label={fullAccessibleLabel}
    >
      <div className="flag-card-header">
        <span className={`flag-category-badge flag-category-badge--${type}`}>
          {categoryLabel}
        </span>
        {flag.severity && (
          <span
            className={`flag-severity-badge flag-severity-badge--${flag.severity.toLowerCase()}`}
            title={`Severidade: ${severityLabel}`}
          >
            {severityLabel}
          </span>
        )}
      </div>
      <h5 className="flag-card-title">{flag.title}</h5>
      <p className="flag-card-description">{flag.description}</p>
    </li>
  );
}
