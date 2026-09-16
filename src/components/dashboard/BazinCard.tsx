import { useState, useEffect, useRef } from 'react';
import type { AnalystBazinFormula } from '../../services/analystService';
import { Check, X, Info, HelpCircle, Coins, AlertCircle } from 'lucide-react';

interface BazinCardProps {
  bazin?: AnalystBazinFormula;
  isBank?: boolean;
  loading?: boolean;
}

function formatBRL(value?: number): string {
  if (value == null || isNaN(value)) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPct(value?: number): string {
  if (value == null || isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function BazinCard({ bazin, isBank = false, loading = false }: BazinCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && showTooltip) {
        setShowTooltip(false);
        triggerRef.current?.focus();
      }
    }
    if (showTooltip) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showTooltip]);

  // Fecha o popover ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        showTooltip &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setShowTooltip(false);
      }
    }
    if (showTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTooltip]);

  // Estado de Carregamento (Skeleton)
  if (loading) {
    return (
      <article
        className="bazin-card bazin-card--loading"
        aria-label="Carregando Preço Teto de Bazin"
        aria-busy="true"
      >
        <div className="bazin-skeleton-header" />
        <div className="bazin-grid">
          <div className="bazin-skeleton-metric" />
          <div className="bazin-skeleton-metric" />
          <div className="bazin-skeleton-metric" />
          <div className="bazin-skeleton-metric" />
        </div>
        <div className="bazin-skeleton-checklist" />
      </article>
    );
  }

  // Estado Sem Dados ou Indisponível
  if (!bazin) {
    return null;
  }

  const isAvailable = bazin.available && bazin.ceilingPrice != null;
  const verdict = (bazin.verdict || 'NEUTRAL').toUpperCase();
  const verdictClass = `bazin-verdict--${verdict.toLowerCase()}`;

  const verdictLabelMap: Record<string, string> = {
    CHEAP: 'Barato (Abaixo do Teto)',
    FAIR: 'Preço Justo (Próximo do Teto)',
    EXPENSIVE: 'Caro (Acima do Teto)',
  };
  const verdictLabel = verdictLabelMap[verdict] || verdict;

  const checklist = bazin.checklist;
  const isBankCompany = isBank || checklist?.healthyDebt?.isBank || false;

  return (
    <article
      className={`bazin-card ${isAvailable ? `bazin-card--${verdict.toLowerCase()}` : 'bazin-card--gap'}`}
      aria-label="Preço Teto de Décio Bazin e Checklist de Dividendos"
      tabIndex={0}
    >
      {/* Cabeçalho */}
      <header className="bazin-card-header">
        <div className="bazin-title-container">
          <Coins className="bazin-icon" aria-hidden="true" size={20} />
          <div>
            <h4 className="bazin-title">Preço Teto de Bazin</h4>
            <span className="bazin-subtitle">Método do Yield Mínimo de 6%</span>
          </div>
        </div>

        <div className="bazin-header-actions">
          {isAvailable ? (
            <span
              className={`bazin-verdict-badge ${verdictClass}`}
              role="status"
              aria-label={`Veredito da Margem: ${verdictLabel}`}
            >
              {verdictLabel}
            </span>
          ) : (
            <span className="bazin-verdict-badge bazin-verdict--gap" role="status">
              Histórico Insuficiente
            </span>
          )}

          <div className="bazin-popover-wrapper">
            <button
              ref={triggerRef}
              type="button"
              className="bazin-help-btn"
              onClick={() => setShowTooltip((prev) => !prev)}
              aria-expanded={showTooltip}
              aria-controls="bazin-methodology-popover"
              aria-label="Informações sobre o método de Décio Bazin"
              title="Como funciona o cálculo de Bazin?"
            >
              <HelpCircle size={16} aria-hidden="true" />
            </button>

            {showTooltip && (
              <div
                id="bazin-methodology-popover"
                ref={popoverRef}
                className="bazin-popover"
                role="tooltip"
              >
                <div className="bazin-popover-arrow" aria-hidden="true" />
                <h5 className="bazin-popover-title">Metodologia Décio Bazin</h5>
                <p className="bazin-popover-text">
                  O <strong>Preço Teto</strong> é obtido dividindo os proventos médios por ação dos
                  últimos 3 anos por 0,06 (retorno de 6% ao ano).
                </p>
                <p className="bazin-popover-text">
                  O <strong>Checklist</strong> filtra empresas sólidas pagadoras de proventos com
                  endividamento equilibrado (Dívida Líquida / EBITDA &lt; 2.5x) e regularidade de proventos.
                </p>
                <p className="bazin-popover-footnote">
                  Pressione <kbd>Esc</kbd> para fechar este aviso.
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Caso Gap / Histórico menor que 3 anos */}
      {!isAvailable ? (
        <div className="bazin-gap-state" role="alert">
          <AlertCircle className="bazin-gap-icon" size={22} aria-hidden="true" />
          <div className="bazin-gap-content">
            <p className="bazin-gap-message">
              {bazin.reason === 'SERIES_TOO_SHORT'
                ? 'Histórico de proventos menor que 3 anos para cálculo do Preço Teto Bazin.'
                : 'Dados insuficientes de proventos ou cotação para calcular a metodologia de Bazin.'}
            </p>
            <p className="bazin-gap-hint text-muted">
              Bazin exige no mínimo 3 anos de histórico comprovado para calcular a média de DPA com segurança.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Métricas Principais (Grid 2x2 ou 4 cols) */}
          <dl className="bazin-metrics-grid">
            <div className="bazin-metric-item">
              <dt className="bazin-metric-label">Preço Teto (6%)</dt>
              <dd className="bazin-metric-value bazin-metric-value--primary">
                {formatBRL(bazin.ceilingPrice)}
              </dd>
            </div>

            <div className="bazin-metric-item">
              <dt className="bazin-metric-label">Cotação Atual</dt>
              <dd className="bazin-metric-value">{formatBRL(bazin.currentPrice)}</dd>
            </div>

            <div className="bazin-metric-item">
              <dt className="bazin-metric-label">Margem de Segurança</dt>
              <dd className={`bazin-metric-value bazin-mos-value bazin-mos-value--${verdict.toLowerCase()}`}>
                {formatPct(bazin.marginOfSafetyPct)}
              </dd>
            </div>

            <div className="bazin-metric-item">
              <dt className="bazin-metric-label">DPA Médio (3 anos)</dt>
              <dd className="bazin-metric-value">{formatBRL(bazin.averageDpa)}</dd>
            </div>
          </dl>

          {/* Histórico de Proventos Utilizados (Linha com tags dos 3 anos) */}
          {bazin.historyYears && bazin.historyYears.length > 0 && (
            <div className="bazin-history-strip" aria-label="Série de proventos utilizada">
              <span className="bazin-history-label">Proventos anuais:</span>
              <div className="bazin-history-tags">
                {bazin.historyYears.map((h) => (
                  <span key={h.year} className="bazin-history-tag">
                    <strong>{h.year}:</strong> {formatBRL(h.dpa)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Checklist de Renda Passiva */}
          {checklist && (
            <section className="bazin-checklist-section" aria-labelledby="bazin-checklist-heading">
              <div className="bazin-checklist-header">
                <h5 id="bazin-checklist-heading" className="bazin-checklist-title">
                  Checklist de Renda Passiva
                </h5>
                {bazin.checklistScore && (
                  <span
                    className="bazin-checklist-score"
                    aria-label={`Pontuação do checklist: ${bazin.checklistScore}`}
                  >
                    Score: <strong>{bazin.checklistScore}</strong>
                  </span>
                )}
              </div>

              <ul className="bazin-checklist-list">
                {/* 1. Yield Atual */}
                <li className="bazin-checklist-item">
                  <span
                    className={`bazin-check-status ${checklist.currentYieldAdequate.pass ? 'is-pass' : 'is-fail'}`}
                    aria-hidden="true"
                  >
                    {checklist.currentYieldAdequate.pass ? <Check size={14} /> : <X size={14} />}
                  </span>
                  <div className="bazin-check-details">
                    <span className="bazin-check-name">Dividend Yield 12M ≥ 6.0%</span>
                    <span className="bazin-check-value text-muted">
                      (Atual: {checklist.currentYieldAdequate.valuePct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)
                    </span>
                  </div>
                </li>

                {/* 2. Yield Médio */}
                <li className="bazin-checklist-item">
                  <span
                    className={`bazin-check-status ${checklist.averageYieldAdequate.pass ? 'is-pass' : 'is-fail'}`}
                    aria-hidden="true"
                  >
                    {checklist.averageYieldAdequate.pass ? <Check size={14} /> : <X size={14} />}
                  </span>
                  <div className="bazin-check-details">
                    <span className="bazin-check-name">Dividend Yield Médio (3a) ≥ 6.0%</span>
                    <span className="bazin-check-value text-muted">
                      (Médio: {checklist.averageYieldAdequate.valuePct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)
                    </span>
                  </div>
                </li>

                {/* 3. Dívida Líquida / EBITDA */}
                <li className="bazin-checklist-item">
                  {isBankCompany ? (
                    <>
                      <span className="bazin-check-status is-exempt" aria-hidden="true">
                        <Info size={14} />
                      </span>
                      <div className="bazin-check-details">
                        <span className="bazin-check-name">Dívida Líquida / EBITDA &lt; 2.5x</span>
                        <span className="bazin-bank-badge">
                          Não se aplica (Setor Financeiro)
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <span
                        className={`bazin-check-status ${checklist.healthyDebt.pass ? 'is-pass' : 'is-fail'}`}
                        aria-hidden="true"
                      >
                        {checklist.healthyDebt.pass ? <Check size={14} /> : <X size={14} />}
                      </span>
                      <div className="bazin-check-details">
                        <span className="bazin-check-name">Dívida Líquida / EBITDA &lt; 2.5x</span>
                        <span className="bazin-check-value text-muted">
                          (Atual:{' '}
                          {checklist.healthyDebt.valueRatio != null
                            ? `${checklist.healthyDebt.valueRatio.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x`
                            : 'N/D'}
                          )
                        </span>
                      </div>
                    </>
                  )}
                </li>

                {/* 4. Regularidade */}
                <li className="bazin-checklist-item">
                  <span
                    className={`bazin-check-status ${checklist.dividendRegularity.pass ? 'is-pass' : 'is-fail'}`}
                    aria-hidden="true"
                  >
                    {checklist.dividendRegularity.pass ? <Check size={14} /> : <X size={14} />}
                  </span>
                  <div className="bazin-check-details">
                    <span className="bazin-check-name">Regularidade de Dividendos</span>
                    <span className="bazin-check-value text-muted">
                      (Pagou em {checklist.dividendRegularity.yearsPaid} de{' '}
                      {checklist.dividendRegularity.yearsRequired} anos)
                    </span>
                  </div>
                </li>
              </ul>
            </section>
          )}
        </>
      )}
    </article>
  );
}
