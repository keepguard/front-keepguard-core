import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LineChart, Plus, Search } from 'lucide-react';
import { RefreshCombo } from '../common/RefreshCombo';
import { useToast } from '../../context/ToastContext';
import {
  analyzeTicker,
  getLatestMagicFormulaRanking,
  isValidTicker,
  listCatalogTickers,
  listChanges,
  updateCatalogAsset,
  type AnalystAnalysis,
  type AnalystMagicFormulaRanking,
  type AnalystVerdictChange,
  type MarketAssetItem,
} from '../../services/analystService';
import { METRIC_LABEL, VERDICT_LABEL, GAP_REASON_LABEL, deltaLabel, displayIsMaterial, isFiiAsset, isPriceOnlyAsset, CORPORATE_STOCK_METRICS } from './marketLabels';
import { ThesisCard, THESIS_CARD_PUBLISHED } from './ThesisCard';
import { ExecutiveFlagsPanel } from './ExecutiveFlagsPanel';
import { FormulasCard } from './FormulasCard';
import { FiiDossierView } from './FiiDossierView';
import { PriceDossierView } from './PriceDossierView';
import { MagicFormulaPanel } from './MagicFormulaPanel';

const DISCLAIMER = 'Análise, não recomendação de investimento.';

function tickerFromQuery(raw: string | null): string | null {
  const value = raw?.trim().toUpperCase() ?? '';
  return isValidTicker(value) ? value : null;
}

function mapAnalystError(err: unknown, fallback: string): string {
  const status = (err as { status?: number }).status;
  const data = (err as { data?: { error?: string; message?: string } }).data;
  if (data?.error === 'NO_MARKET_DATA' || status === 404) {
    return 'Ainda não há fatos deste ticker nesta organização. Confira os agents de coleta.';
  }
  if (data?.error === 'ASSET_NOT_FOUND') {
    return 'Ticker não está no catálogo (market_assets). Cadastre-o na aba Catálogo.';
  }
  if (data?.error === 'INVALID_TICKER' || status === 400) {
    return data?.message || 'Ticker inválido. Use 4 a 6 caracteres (ex.: PETR4, HGLG11).';
  }
  if (status === 502 || status === 503 || status === 504) {
    return 'Não foi possível falar com o analista agora. Tente de novo.';
  }
  return err instanceof Error ? err.message : fallback;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function materialStyle(isMaterial: boolean): React.CSSProperties {
  return isMaterial
    ? { background: '#fff4e5', color: '#b36b00', borderColor: '#ffe0b2' }
    : { background: '#eef1f4', color: '#5f6368', borderColor: '#e0e3e7' };
}

export const MarketAnalyzeView: React.FC = () => {
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromQuery = tickerFromQuery(searchParams.get('ticker'));
  const [ticker, setTicker] = useState(() => fromQuery || '');
  const [appliedQuery, setAppliedQuery] = useState(fromQuery);

  const [catalog, setCatalog] = useState<MarketAssetItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [refreshDerived, setRefreshDerived] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<AnalystAnalysis | null>(null);
  const [filterTicker, setFilterTicker] = useState<string | null>(fromQuery);
  const [changes, setChanges] = useState<AnalystVerdictChange[]>([]);
  const [changesLoading, setChangesLoading] = useState(true);
  const [ranking, setRanking] = useState<AnalystMagicFormulaRanking | null>(null);

  if (fromQuery !== appliedQuery) {
    setAppliedQuery(fromQuery);
    if (fromQuery) {
      setTicker(fromQuery);
      setFilterTicker(fromQuery);
    }
  }

  const batchTickers = useMemo(
    () => catalog.filter((item) => item.isActive !== false && item.hasRuns).map((item) => item.ticker),
    [catalog],
  );
  const catalogByTicker = useMemo(() => {
    const map = new Map<string, MarketAssetItem>();
    for (const item of catalog) {
      map.set(item.ticker.toUpperCase(), item);
    }
    return map;
  }, [catalog]);

  const busy = catalogLoading || saving || analyzing;
  const normalizedTicker = ticker.trim().toUpperCase();
  const tickerOk = isValidTicker(normalizedTicker);
  const catalogItem = catalogByTicker.get(normalizedTicker);
  const inBatch = Boolean(catalogItem?.hasRuns);
  const inCatalog = Boolean(catalogItem);

  const loadChanges = useCallback(async (nextTicker?: string | null) => {
    setChangesLoading(true);
    try {
      setChanges(await listChanges(20, nextTicker || undefined));
    } catch (err) {
      setError(mapAnalystError(err, 'Falha ao carregar mudanças'));
      setChanges([]);
    } finally {
      setChangesLoading(false);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const [res, magic] = await Promise.all([
        listCatalogTickers(),
        getLatestMagicFormulaRanking(),
      ]);
      setCatalog(res.items ?? []);
      setRanking(magic);
    } catch (err) {
      setError(mapAnalystError(err, 'Falha ao carregar o catálogo'));
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const refreshDesk = useCallback(async () => {
    setRefreshing(true);
    setError('');
    try {
      await Promise.all([loadCatalog(), loadChanges(filterTicker)]);
    } finally {
      setRefreshing(false);
    }
  }, [filterTicker, loadChanges, loadCatalog]);

  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void loadCatalog();
    void loadChanges(fromQuery);
  }, [fromQuery, loadCatalog, loadChanges]);

  function syncQuery(next: string | null) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('tab', 'analyze');
      if (next) {
        params.set('ticker', next);
      } else {
        params.delete('ticker');
      }
      return params;
    }, { replace: true });
  }

  function selectTicker(next: string | null) {
    const value = next?.trim().toUpperCase() || null;
    if (value && analysis && analysis.ticker !== value) {
      setAnalysis(null);
    }
    if (value) setTicker(value);
    setFilterTicker(value);
    syncQuery(value);
    void loadChanges(value);
  }

  async function onAnalyze(event: React.FormEvent) {
    event.preventDefault();
    if (!tickerOk) {
      setError('Ticker inválido. Use 4 a 6 caracteres (ex.: PETR4).');
      return;
    }
    setError('');
    setAnalysis(null);
    setAnalyzing(true);
    try {
      setAnalysis(await analyzeTicker(normalizedTicker, { refreshDerived }));
      syncQuery(normalizedTicker);
    } catch (err) {
      setError(mapAnalystError(err, 'Falha ao analisar'));
    } finally {
      setAnalyzing(false);
    }
  }

  async function onIncludeInBatch() {
    if (!tickerOk) {
      setError('Ticker inválido. Use 4 a 6 caracteres (ex.: PETR4).');
      return;
    }
    if (!inCatalog) {
      setError(`${normalizedTicker} não está no catálogo. Cadastre-o na aba Catálogo antes de incluir no lote.`);
      return;
    }
    if (inBatch) {
      setError(`${normalizedTicker} já está no lote diário (hasRuns).`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await updateCatalogAsset(normalizedTicker, { hasRuns: true });
      setCatalog((prev) => prev.map((item) => (item.ticker === updated.ticker ? updated : item)));
      addToast({
        type: 'success',
        title: `${normalizedTicker} no lote diário`,
        description: 'hasRuns=true em market_assets. Garanta collectors e use a aba Jobs para rodar o lote.',
      });
    } catch (err) {
      setError(mapAnalystError(err, 'Falha ao incluir no lote'));
    } finally {
      setSaving(false);
    }
  }

  async function onExcludeFromBatch() {
    if (!tickerOk || !inBatch) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateCatalogAsset(normalizedTicker, { hasRuns: false });
      setCatalog((prev) => prev.map((item) => (item.ticker === updated.ticker ? updated : item)));
      addToast({
        type: 'success',
        title: `${normalizedTicker} fora do lote`,
        description: 'hasRuns=false. O cron diário deixa de processar este ticker.',
      });
    } catch (err) {
      setError(mapAnalystError(err, 'Falha ao remover do lote'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="market-desk">
      <p className="text-muted" style={{ marginBottom: '1rem' }}>
        O lote diário usa apenas <code>market_assets</code> com <strong>hasRuns=true</strong>.
        Cadastro fica na aba Catálogo; collectors no srv-data-collector; disparo na aba Jobs.
      </p>

      <div className="client-system-create-row market-desk-create-row">
        <div className="client-system-create-actions">
          <button
            type="button"
            className="btn btn-primary btn-pill"
            onClick={() => { void onIncludeInBatch(); }}
            disabled={busy || !tickerOk || !inCatalog || inBatch}
            title={!inCatalog ? 'Cadastre o ticker no Catálogo primeiro' : 'Marca hasRuns=true no market_assets'}
          >
            <Plus size={15} />
            <span>Incluir no lote</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-pill"
            onClick={() => { void onExcludeFromBatch(); }}
            disabled={busy || !tickerOk || !inBatch}
            title="Marca hasRuns=false"
          >
            <span>Remover do lote</span>
          </button>
        </div>
      </div>

      <form className="audits-toolbar" onSubmit={onAnalyze}>
        <div className="audits-filter-row audits-filter-row-primary market-desk-toolbar-primary">
          <div className="search-input-wrapper audits-search-field">
            <Search size={16} className="search-icon" />
            <input
              id="market-ticker"
              className="search-input"
              name="ticker"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              maxLength={6}
              autoComplete="off"
              placeholder="Ticker ou ativo (ex.: PETR4, HGLG11)"
              aria-label="Ticker"
            />
          </div>
          <span className="connections-summary-chip is-wait" aria-live="polite">
            {batchTickers.length} no lote (hasRuns)
          </span>
          {tickerOk ? (
            <span className={`connections-summary-chip ${inBatch ? 'is-ok' : inCatalog ? 'is-wait' : 'is-error'}`}>
              {inBatch ? 'No lote' : inCatalog ? 'No catálogo' : 'Fora do catálogo'}
            </span>
          ) : null}
        </div>
        <div className="audits-filter-row audits-filter-row-sort market-desk-filter-actions">
          <label className="market-catalog-toggle">
            <input
              type="checkbox"
              checked={refreshDerived}
              onChange={(e) => setRefreshDerived(e.target.checked)}
            />
            <span>Regenerar memória derivada</span>
          </label>
          <button
            type="submit"
            className="btn btn-secondary btn-pill audits-filter-submit"
            disabled={analyzing || !tickerOk}
          >
            <Search size={15} />
            <span>{analyzing ? 'Analisando…' : 'Analisar agora'}</span>
          </button>
          <RefreshCombo
            onRefresh={() => { void refreshDesk(); }}
            disabled={busy}
            refreshing={refreshing || changesLoading}
          />
        </div>
      </form>

      {error ? (
        <div className="agent-test-result is-error" role="alert" style={{ marginBottom: '1rem' }}>
          <p>{error}</p>
        </div>
      ) : null}

      {batchTickers.length > 0 ? (
        <div className="market-desk-tickers" style={{ marginBottom: '1rem' }} aria-label="Tickers no lote diário">
          <div className="market-desk-tickers-list" role="group">
            {batchTickers.map((item) => (
              <span
                key={item}
                className={`badge-role market-ticker-chip${filterTicker === item ? ' market-ticker-chip--active' : ''}`}
              >
                <button
                  type="button"
                  className="market-ticker-chip-label"
                  onClick={() => selectTicker(item)}
                >
                  {item}
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {ranking ? <MagicFormulaPanel ranking={ranking} /> : null}

      {analyzing ? (
        <div className="market-signals" aria-busy="true" aria-live="polite">
          <ExecutiveFlagsPanel loading={true} />
          {isFiiAsset(undefined, normalizedTicker) ? (
            <FiiDossierView loading />
          ) : (
            <>
              <div className="market-skeleton" />
              <div className="market-skeleton" />
              <div className="market-skeleton" />
              <div className="market-skeleton" />
            </>
          )}
        </div>
      ) : null}

      {analysis ? (
        <div className="hpanel-table-card market-analysis-card">
          <h2 className="market-analyze-title">
            {analysis.displayName || analysis.ticker} · {analysis.ticker}
          </h2>
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
          {analysis.gaps.length > 0 ? (
            (() => {
              const isPriceOnly = isPriceOnlyAsset(analysis.assetType, analysis.ticker);
              const seen = new Set<string>();
              const filteredGaps = analysis.gaps.filter((g) => {
                if (isPriceOnly && CORPORATE_STOCK_METRICS.has(g.metric)) return false;
                if (seen.has(g.metric)) return false;
                seen.add(g.metric);
                return true;
              });
              if (filteredGaps.length === 0) return null;
              return (
                <p className="text-muted">
                  Lacunas: {filteredGaps
                    .map((g) => `${METRIC_LABEL[g.metric] || g.metric} (${GAP_REASON_LABEL[g.reason] || g.reason})`)
                    .join(', ')}
                </p>
              );
            })()
          ) : null}
          <div className="market-narrative" aria-live="polite">{analysis.narrative}</div>
          {analysis.sources.length > 0 ? (
            <p className="text-muted">
              Fontes: {analysis.sources.map((s) => s.dataSource).join(', ')}
            </p>
          ) : null}
          <p className="market-disclaimer">{analysis.disclaimer || DISCLAIMER}</p>
        </div>
      ) : null}

      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Ticker</th>
              <th>Intensidade</th>
              <th>Mudança</th>
            </tr>
          </thead>
          <tbody>
            {changesLoading && changes.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  Carregando mudanças de veredito…
                </td>
              </tr>
            ) : changes.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <LineChart size={22} />
                    <span>
                      {filterTicker
                        ? `Ainda não há mudança de veredito em ${filterTicker}.`
                        : 'Ainda não há mudança de veredito. Elas aparecem depois do cron ou de uma análise.'}
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              changes.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => selectTicker(item.ticker)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <time dateTime={item.detectedAt}>{formatWhen(item.detectedAt)}</time>
                  </td>
                  <td>
                    <span className="table-cell-title">{item.ticker}</span>
                  </td>
                  <td>
                    <span className="badge-role" style={materialStyle(displayIsMaterial(item))}>
                      {displayIsMaterial(item) ? 'Material' : 'Leve'}
                    </span>
                  </td>
                  <td>
                    {item.changes.map((delta) => deltaLabel(delta.metric, delta.fromVerdict, delta.toVerdict)).join(' · ') || '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards-container">
        {changes.map((item) => (
          <button
            type="button"
            key={item.id}
            className="mobile-domain-card"
            onClick={() => selectTicker(item.ticker)}
            style={{ textAlign: 'left', width: '100%', border: 'none', background: 'inherit' }}
          >
            <div className="mobile-card-header">
              <strong>{item.ticker}</strong>
              <span className="badge-role" style={materialStyle(displayIsMaterial(item))}>
                {displayIsMaterial(item) ? 'Material' : 'Leve'}
              </span>
            </div>
            <p className="text-muted">{formatWhen(item.detectedAt)}</p>
            <p>
              {item.changes.map((delta) => deltaLabel(delta.metric, delta.fromVerdict, delta.toVerdict)).join(' · ') || '—'}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
};
