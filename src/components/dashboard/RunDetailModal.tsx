import React, { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { getRun, type AnalystRunDetail } from '../../services/analystService';
import {
  METRIC_LABEL,
  VERDICT_LABEL,
  GAP_REASON_LABEL,
  isFiiAsset,
  isPriceOnlyAsset,
  CORPORATE_STOCK_METRICS,
  RUN_TRIGGER_LABEL,
  RUN_OUTCOME_LABEL,
} from './marketLabels';
import { ThesisCard, THESIS_CARD_PUBLISHED } from './ThesisCard';
import { ExecutiveFlagsPanel } from './ExecutiveFlagsPanel';
import { FormulasCard } from './FormulasCard';
import { FiiDossierView } from './FiiDossierView';
import { PriceDossierView } from './PriceDossierView';

const DISCLAIMER = 'Análise, não recomendação de investimento.';

function mapDetailError(err: unknown): string {
  const status = (err as { status?: number }).status;
  if (status === 404) return 'Esta análise não existe mais ou não pertence a esta organização.';
  if (status === 502 || status === 503 || status === 504) {
    return 'Não foi possível falar com o analista agora. Tente de novo.';
  }
  return err instanceof Error ? err.message : 'Falha ao carregar a análise';
}

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

interface Props {
  runId: string;
  onClose: () => void;
}

/** Mostra o dossiê já gravado de um run (GET /runs/{id}) — não dispara nova análise. */
export const RunDetailModal: React.FC<Props> = ({ runId, onClose }) => {
  const [run, setRun] = useState<AnalystRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setRun(null);
    getRun(runId)
      .then((res) => { if (!cancelled) setRun(res); })
      .catch((err) => { if (!cancelled) setError(mapDetailError(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [runId]);

  const failed = run?.outcome === 'FAILED';

  const gaps = (() => {
    if (!run || failed || run.gaps.length === 0) return [];
    const priceOnly = isPriceOnlyAsset(run.assetType, run.ticker);
    const seen = new Set<string>();
    return run.gaps.filter((g) => {
      if (priceOnly && CORPORATE_STOCK_METRICS.has(g.metric)) return false;
      if (seen.has(g.metric)) return false;
      seen.add(g.metric);
      return true;
    });
  })();

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Análise · ${run?.displayName || runId}`}
      subtitle={run ? `${run.ticker} · ${RUN_TRIGGER_LABEL[run.trigger] || run.trigger} · ${formatDateTime(run.analyzedAt)}` : undefined}
      maxWidth="1100px"
      footer={<button type="button" className="btn btn-secondary btn-pill" onClick={onClose}>Fechar</button>}
    >
      {loading ? (
        <div className="market-signals" aria-busy="true" aria-live="polite">
          <div className="market-skeleton" />
          <div className="market-skeleton" />
          <div className="market-skeleton" />
        </div>
      ) : null}

      {error ? (
        <div className="agent-test-result is-error" role="alert"><p>{error}</p></div>
      ) : null}

      {run && failed ? (
        <div className="agent-test-result is-error" role="alert">
          <p style={{ margin: 0 }}>
            <strong>{RUN_OUTCOME_LABEL.FAILED}</strong> — {run.fallbackReason || 'Motivo não registrado.'}
          </p>
        </div>
      ) : null}

      {run && !failed ? (
        <div className="market-analysis-card">
          {run.outcome === 'DEGRADED' ? (
            <p className="text-muted market-catalog-hint" role="status">
              Narrativa degradada: {run.fallbackReason || 'motivo não registrado'}. Os números em signals/formulas continuam confiáveis.
            </p>
          ) : null}
          {THESIS_CARD_PUBLISHED && run.thesis ? <ThesisCard thesis={run.thesis} /> : null}
          {run.flags ? <ExecutiveFlagsPanel flags={run.flags} /> : null}
          {isFiiAsset(run.assetType, run.ticker) ? (
            <FiiDossierView
              ticker={run.ticker}
              displayName={run.displayName}
              fiiDetails={run.fiiDetails}
              signals={run.signals}
            />
          ) : isPriceOnlyAsset(run.assetType, run.ticker) ? (
            <PriceDossierView
              assetType={run.assetType || 'ETF'}
              ticker={run.ticker}
              displayName={run.displayName}
              priceDetails={run.priceDetails}
              etfDetails={run.etfDetails}
              creditDetails={run.creditDetails}
              bdrDetails={run.bdrDetails}
            />
          ) : run.formulas ? (
            <FormulasCard formulas={run.formulas} />
          ) : null}
          <div className="market-signals">
            {run.signals.map((signal) => (
              <article className="market-signal" key={signal.metric}>
                <span className={`market-verdict ${signal.verdict}`}>
                  {VERDICT_LABEL[signal.verdict] || signal.verdict}
                </span>
                <h3>{METRIC_LABEL[signal.metric] || signal.metric}</h3>
                <p>{signal.explanation}</p>
                {signal.grounding?.dataSource ? (
                  <p className="text-muted">Fonte: {signal.grounding.dataSource}</p>
                ) : null}
              </article>
            ))}
          </div>
          {gaps.length > 0 ? (
            <p className="text-muted">
              Lacunas: {gaps
                .map((g) => `${METRIC_LABEL[g.metric] || g.metric} (${GAP_REASON_LABEL[g.reason] || g.reason})`)
                .join(', ')}
            </p>
          ) : null}
          <div className="market-narrative" aria-live="polite">{run.narrative}</div>
          {run.sources.length > 0 ? (
            <p className="text-muted">Fontes: {run.sources.map((s) => s.dataSource).join(', ')}</p>
          ) : null}
          <p className="market-disclaimer">{run.disclaimer || DISCLAIMER}</p>
        </div>
      ) : null}
    </Modal>
  );
};
