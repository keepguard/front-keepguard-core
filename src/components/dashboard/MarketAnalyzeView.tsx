import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LineChart, Plus, Search } from 'lucide-react';
import { RefreshCombo } from '../common/RefreshCombo';
import { useToast } from '../../context/ToastContext';
import {
  analyzeTicker,
  getMagicFormulaRanking,
  getWatchlist,
  isValidTicker,
  listChanges,
  saveWatchlist,
  WATCHLIST_MAX_TICKERS,
  type AnalystAnalysis,
  type AnalystMagicFormulaRanking,
  type AnalystVerdictChange,
  type AnalystWatchlist,
} from '../../services/analystService';
import { METRIC_LABEL, VERDICT_LABEL, GAP_REASON_LABEL, deltaLabel, displayIsMaterial } from './marketLabels';
import { ThesisCard, THESIS_CARD_PUBLISHED } from './ThesisCard';
import { FormulasCard } from './FormulasCard';
import { MagicFormulaPanel } from './MagicFormulaPanel';

const DISCLAIMER = 'Análise, não recomendação de investimento.';

function tickerFromQuery(raw: string | null): string | null {
  const value = raw?.trim().toUpperCase() ?? '';
  return isValidTicker(value) ? value : null;
}

function mapAnalystError(err: unknown, fallback: string): string {
  const status = (err as { status?: number }).status;
  const data = (err as { data?: { error?: string; message?: string } }).data;
  if (data?.error === 'WATCHLIST_TOO_LARGE') {
    return `A watchlist aceita no máximo ${WATCHLIST_MAX_TICKERS} ativos.`;
  }
  if (data?.error === 'NO_MARKET_DATA' || status === 404) {
    return 'Ainda não há fatos deste ticker nesta organização. Confira os agents de coleta.';
  }
  if (data?.error === 'INVALID_TICKER' || status === 400) {
    return data?.message || 'Ticker inválido. Use 4 a 6 caracteres (ex.: PETR4).';
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

  const [list, setList] = useState<AnalystWatchlist | null>(null);
  const [watchLoading, setWatchLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
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

  const tickers = list?.tickers ?? [];
  const maxTickers = list?.maxTickers || WATCHLIST_MAX_TICKERS;
  const enabled = list?.enabled ?? true;
  const atCap = tickers.length >= maxTickers;
  const busy = watchLoading || saving || analyzing;
  const normalizedTicker = ticker.trim().toUpperCase();
  const tickerOk = isValidTicker(normalizedTicker);
  const alreadyWatched = tickers.includes(normalizedTicker);

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

  const loadWatchlist = useCallback(async () => {
    setWatchLoading(true);
    try {
      const [wl, magic] = await Promise.all([
        getWatchlist(),
        getMagicFormulaRanking().catch((err) => {
          if ((err as { status?: number }).status === 404) return null;
          throw err;
        }),
      ]);
      setList(wl);
      setRanking(magic);
    } catch (err) {
      setError(mapAnalystError(err, 'Falha ao carregar a watchlist'));
    } finally {
      setWatchLoading(false);
    }
  }, []);

  const refreshDesk = useCallback(async () => {
    setRefreshing(true);
    setError('');
    try {
      await Promise.all([loadWatchlist(), loadChanges(filterTicker)]);
    } finally {
      setRefreshing(false);
    }
  }, [filterTicker, loadChanges, loadWatchlist]);

  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void loadWatchlist();
    void loadChanges(fromQuery);
  }, [fromQuery, loadWatchlist, loadChanges]);

  function syncQuery(next: string | null) {
    if (next) {
      setSearchParams({ ticker: next }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
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

  async function persist(nextTickers: string[], nextEnabled: boolean, changesTicker: string | null = filterTicker): Promise<boolean> {
    setSaving(true);
    setError('');
    try {
      const saved = await saveWatchlist({ tickers: nextTickers, enabled: nextEnabled });
      setList(saved);
      await loadChanges(changesTicker);
      return true;
    } catch (err) {
      setError(mapAnalystError(err, 'Falha ao salvar a watchlist'));
      return false;
    } finally {
      setSaving(false);
    }
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
      setAnalysis(await analyzeTicker(normalizedTicker));
      syncQuery(normalizedTicker);
    } catch (err) {
      setError(mapAnalystError(err, 'Falha ao analisar'));
    } finally {
      setAnalyzing(false);
    }
  }

  async function onAddToWatchlist() {
    if (!list) return;
    if (!tickerOk) {
      setError('Ticker inválido. Use 4 a 6 caracteres (ex.: PETR4).');
      return;
    }
    if (alreadyWatched) {
      setError(`${normalizedTicker} já está na watchlist.`);
      return;
    }
    if (atCap) {
      setError(`A watchlist aceita no máximo ${maxTickers} ativos.`);
      return;
    }
    const ok = await persist([...tickers, normalizedTicker], enabled);
    if (ok) {
      addToast({
        type: 'success',
        title: `${normalizedTicker} na watchlist`,
        description: enabled
          ? 'Entra no lote da manhã. Cada ticker custa uma análise diária.'
          : 'Salvo. O lote diário está pausado nesta organização.',
      });
    }
  }

  async function onToggleEnabled(next: boolean) {
    const ok = await persist(tickers, next);
    if (ok) {
      addToast({
        type: 'success',
        title: next ? 'Análise diária ativa' : 'Análise diária pausada',
        description: next
          ? `O cron processa até ${tickers.length} ticker(s) de manhã.`
          : 'O cron ignora esta organização até reativar.',
      });
    }
  }

  return (
    <div className="market-desk">
      <div className="client-system-create-row market-desk-create-row">
        <div className="client-system-create-actions">
          <button
            type="button"
            className="btn btn-primary btn-pill"
            onClick={() => { void onAddToWatchlist(); }}
            disabled={busy || !list || !tickerOk || alreadyWatched || atCap}
            title={atCap ? `Limite de ${maxTickers} ativos` : 'Inclui o ticker no cron diário'}
          >
            <Plus size={15} />
            <span>Adicionar</span>
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
              placeholder="Ticker (ex.: PETR4)"
              aria-label="Ticker"
            />
          </div>
          <select
            className="form-input audits-compact-select"
            value={enabled ? 'true' : 'false'}
            disabled={busy || !list}
            onChange={(e) => { void onToggleEnabled(e.target.value === 'true'); }}
            aria-label="Análise diária automática"
            title="Pausa o cron sem apagar os tickers. Corta o custo diário desta organização."
          >
            <option value="true">Diário ativo</option>
            <option value="false">Diário pausado</option>
          </select>
          <span className="connections-summary-chip is-wait" aria-live="polite">
            {tickers.length} / {maxTickers} no lote
          </span>
        </div>
        <div className="audits-filter-row audits-filter-row-sort market-desk-filter-actions">
          <button
            type="submit"
            className="btn btn-secondary btn-pill audits-filter-submit"
            disabled={analyzing || !tickerOk}
          >
            <Search size={15} />
            <span>{analyzing ? 'Analisando…' : 'Analisar'}</span>
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

      {ranking ? <MagicFormulaPanel ranking={ranking} /> : null}

      {analyzing ? (
        <div className="market-signals" aria-busy="true" aria-live="polite">
          <div className="market-skeleton" />
          <div className="market-skeleton" />
          <div className="market-skeleton" />
          <div className="market-skeleton" />
        </div>
      ) : null}

      {analysis ? (
        <div className="hpanel-table-card market-analysis-card">
          <h2 className="market-analyze-title">
            {analysis.displayName || analysis.ticker} · {analysis.ticker}
          </h2>
          {THESIS_CARD_PUBLISHED && analysis.thesis ? <ThesisCard thesis={analysis.thesis} /> : null}
          {analysis.formulas ? <FormulasCard formulas={analysis.formulas} /> : null}
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
            <p className="text-muted">
              Lacunas: {analysis.gaps.map((g) => `${METRIC_LABEL[g.metric] || g.metric} (${GAP_REASON_LABEL[g.reason] || g.reason})`).join(', ')}
            </p>
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
            <div className="mobile-card-top">
              <span className="mobile-domain-name">{item.ticker}</span>
              <span className="badge-role" style={materialStyle(displayIsMaterial(item))}>
                {displayIsMaterial(item) ? 'Material' : 'Leve'}
              </span>
            </div>
            <div className="mobile-card-subinfo">{formatWhen(item.detectedAt)}</div>
            <div className="mobile-card-meta">
              {item.changes.map((delta) => deltaLabel(delta.metric, delta.fromVerdict, delta.toVerdict)).join(' · ') || '—'}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
