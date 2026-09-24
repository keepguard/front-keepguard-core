import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Tooltip } from '../common/Tooltip';
import { analyzeTicker, type AnalystAnalysis } from '../../services/analystService';
import { METRIC_LABEL, VERDICT_LABEL, GAP_REASON_LABEL, isFiiAsset, isPriceOnlyAsset, CORPORATE_STOCK_METRICS } from './marketLabels';
import { ThesisCard, THESIS_CARD_PUBLISHED } from './ThesisCard';
import { ExecutiveFlagsPanel } from './ExecutiveFlagsPanel';
import { FormulasCard } from './FormulasCard';
import { FiiDossierView } from './FiiDossierView';
import { PriceDossierView } from './PriceDossierView';

const DISCLAIMER = 'Análise, não recomendação de investimento.';

function mapAnalystError(err: unknown): string {
  const status = (err as { status?: number }).status;
  const data = (err as { data?: { error?: string; message?: string } }).data;
  if (data?.error === 'NO_MARKET_DATA' || status === 404) {
    return 'Ainda não há fatos deste ticker nesta organização. Confira os agents de coleta.';
  }
  if (data?.error === 'ASSET_NOT_FOUND') {
    return 'Ticker não está no catálogo (market_assets).';
  }
  if (status === 402 || status === 403 || status === 429) {
    return data?.message || 'Sem permissão ou cota para analisar este ticker agora.';
  }
  if (status === 502 || status === 503 || status === 504) {
    return 'Não foi possível falar com o analista agora. Tente de novo.';
  }
  return err instanceof Error ? err.message : 'Falha ao analisar';
}

interface Props {
  ticker: string;
  onClose: () => void;
}

/** Processa e exibe o dossiê de um ticker. Cada abertura dispara uma análise (POST /analyze). */
export const AssetAnalysisModal: React.FC<Props> = ({ ticker, onClose }) => {
  const [analysis, setAnalysis] = useState<AnalystAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const run = useCallback(async (refreshDerived: boolean) => {
    setLoading(true);
    setError('');
    setAnalysis(null);
    try {
      setAnalysis(await analyzeTicker(ticker, { refreshDerived }));
    } catch (err) {
      setError(mapAnalystError(err));
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    void run(false);
  }, [run]);

  const footer = (
    <>
      <Tooltip label="Reanalisar" description="Roda de novo e regenera a memória derivada do ativo.">
        <button
          type="button"
          className="btn-table-icon"
          disabled={loading}
          onClick={() => { void run(true); }}
          aria-label={`Reanalisar ${ticker} regenerando a memória derivada`}
        >
          <RefreshCw size={15} className={loading ? 'spin' : undefined} />
        </button>
      </Tooltip>
      <button type="button" className="btn btn-secondary btn-pill" onClick={onClose}>Fechar</button>
    </>
  );

  const gaps = (() => {
    if (!analysis || analysis.gaps.length === 0) return [];
    const priceOnly = isPriceOnlyAsset(analysis.assetType, analysis.ticker);
    const seen = new Set<string>();
    return analysis.gaps.filter((g) => {
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
      title={`Análise · ${analysis?.displayName || ticker}`}
      subtitle={analysis ? analysis.ticker : ticker}
      maxWidth="1100px"
      footer={footer}
    >
      {loading ? (
        <div className="market-signals" aria-busy="true" aria-live="polite">
          <ExecutiveFlagsPanel loading={true} />
          {isFiiAsset(undefined, ticker) ? (
            <FiiDossierView loading />
          ) : (
            <>
              <div className="market-skeleton" />
              <div className="market-skeleton" />
              <div className="market-skeleton" />
            </>
          )}
        </div>
      ) : null}

      {error ? (
        <div className="agent-test-result is-error" role="alert"><p>{error}</p></div>
      ) : null}

      {analysis ? (
        <div className="market-analysis-card">
          {THESIS_CARD_PUBLISHED && analysis.thesis ? <ThesisCard thesis={analysis.thesis} /> : null}
          {analysis.flags ? <ExecutiveFlagsPanel flags={analysis.flags} /> : null}
          {isFiiAsset(analysis.assetType, analysis.ticker) ? (
            <FiiDossierView
              ticker={analysis.ticker}
              displayName={analysis.displayName}
              fiiDetails={analysis.fiiDetails}
              signals={analysis.signals}
            />
          ) : isPriceOnlyAsset(analysis.assetType, analysis.ticker) ? (
            <PriceDossierView
              assetType={analysis.assetType || 'ETF'}
              ticker={analysis.ticker}
              displayName={analysis.displayName}
              priceDetails={analysis.priceDetails}
              etfDetails={analysis.etfDetails}
              creditDetails={analysis.creditDetails}
              bdrDetails={analysis.bdrDetails}
            />
          ) : analysis.formulas ? (
            <FormulasCard formulas={analysis.formulas} />
          ) : null}
          <div className="market-signals">
            {analysis.signals.map((signal) => (
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
          <div className="market-narrative" aria-live="polite">{analysis.narrative}</div>
          {analysis.sources.length > 0 ? (
            <p className="text-muted">Fontes: {analysis.sources.map((s) => s.dataSource).join(', ')}</p>
          ) : null}
          <p className="market-disclaimer">{analysis.disclaimer || DISCLAIMER}</p>
        </div>
      ) : null}
    </Modal>
  );
};
