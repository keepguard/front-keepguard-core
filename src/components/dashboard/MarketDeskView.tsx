import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LineChart, Search, Star } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import {
  getFavorites,
  getMemory,
  getRun,
  isValidTicker,
  listChanges,
  listKnownTickers,
  listRuns,
  saveFavorites,
  WATCHLIST_MAX_TICKERS,
  type AnalystFavorites,
  type AnalystInputPoint,
  type AnalystMemory,
  type AnalystRun,
  type AnalystRunDetail,
  type AnalystVerdictChange,
} from '../../services/analystService';
import { METRIC_LABEL, SOURCE_LABEL, VERDICT_LABEL, GAP_REASON_LABEL, deltaLabel, displayIsMaterial } from './marketLabels';
import { SeriesChart } from './SeriesChart';
import { ThesisCard, THESIS_CARD_PUBLISHED } from './ThesisCard';
import { FormulasCard } from './FormulasCard';

const DISCLAIMER = 'Análise, não recomendação de investimento.';

function tickerFromQuery(raw: string | null): string | null {
  const value = raw?.trim().toUpperCase() ?? '';
  return isValidTicker(value) ? value : null;
}

function mapAnalystError(err: unknown, fallback: string): string {
  const status = (err as { status?: number }).status;
  const data = (err as { data?: { error?: string; message?: string } }).data;
  if (data?.error === 'WATCHLIST_TOO_LARGE') {
    return `A lista de favoritos aceita no máximo ${WATCHLIST_MAX_TICKERS} ativos.`;
  }
  if (data?.error === 'INVALID_TICKER' || status === 400) {
    return data?.message || 'Ticker inválido. Use 4 a 6 caracteres (ex.: PETR4).';
  }
  if (status === 404) {
    return 'Ainda não há análise neste ativo.';
  }
  if (status === 502 || status === 503 || status === 504) {
    return 'Não foi possível falar com o analista agora. Tente de novo.';
  }
  return err instanceof Error ? err.message : fallback;
}

function isNotFound(err: unknown): boolean {
  return (err as { status?: number }).status === 404;
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

function sourceLabel(slug: string): string {
  return SOURCE_LABEL[slug] || slug;
}

function uniqueSources(run: AnalystRun | null): string[] {
  if (!run?.sources?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const source of run.sources) {
    const slug = source.dataSource?.trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

function freshestCollectedAt(run: AnalystRun | null): string | null {
  if (!run?.sources?.length) return null;
  let best = '';
  for (const source of run.sources) {
    if (source.collectedAt && source.collectedAt > best) {
      best = source.collectedAt;
    }
  }
  return best || null;
}

function materialStyle(isMaterial: boolean): React.CSSProperties {
  return isMaterial
    ? { background: '#fff4e5', color: '#b36b00', borderColor: '#ffe0b2' }
    : { background: '#eef1f4', color: '#5f6368', borderColor: '#e0e3e7' };
}

function triggerLabel(trigger: string): string {
  if (trigger === 'SCHEDULED') return 'Lote diário';
  if (trigger === 'ON_DEMAND') return 'Sob demanda';
  return trigger || '—';
}

const MACRO_METRICS = ['cdi_pct', 'selic_meta_pct', 'ipca_mensal_pct'] as const;

function formatNum(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function signalValue(run: AnalystRun | null, metric: string): number | undefined {
  const value = run?.signals.find((s) => s.metric === metric)?.grounding?.valueNum;
  return typeof value === 'number' ? value : undefined;
}

function runVerdict(run: AnalystRun, metric: string): string | undefined {
  return run.signals.find((s) => s.metric === metric)?.verdict;
}

function macroPoint(detail: AnalystRunDetail | null, metric: string): AnalystInputPoint | undefined {
  return detail?.inputs?.macro?.[metric];
}

export const MarketDeskView: React.FC = () => {
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromQuery = tickerFromQuery(searchParams.get('ticker'));
  const [query, setQuery] = useState(() => fromQuery || '');
  const [appliedQuery, setAppliedQuery] = useState(fromQuery);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(fromQuery);

  const [catalog, setCatalog] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<AnalystFavorites | null>(null);
  const [openList, setOpenList] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [runs, setRuns] = useState<AnalystRun[]>([]);
  const [detail, setDetail] = useState<AnalystRunDetail | null>(null);
  const [memory, setMemory] = useState<AnalystMemory | null>(null);
  const [changes, setChanges] = useState<AnalystVerdictChange[]>([]);
  const [changesLoading, setChangesLoading] = useState(false);
  const [savingFav, setSavingFav] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const instanceId = useId();

  if (fromQuery !== appliedQuery) {
    setAppliedQuery(fromQuery);
    if (fromQuery) {
      setQuery(fromQuery);
      setSelectedTicker(fromQuery);
    }
  }

  const normalizedQuery = query.trim().toUpperCase();
  const suggestions = useMemo(() => {
    const pool = catalog;
    if (!normalizedQuery) return pool.slice(0, 12);
    return pool.filter((ticker) => ticker.includes(normalizedQuery)).slice(0, 12);
  }, [catalog, normalizedQuery]);

  const latest = runs[0] ?? null;
  const collectedAt = freshestCollectedAt(latest);
  const runSources = uniqueSources(latest);
  const series = detail?.inputs?.series;
  const news = detail?.news ?? [];
  const macroItems = MACRO_METRICS.flatMap((metric) => {
    const point = macroPoint(detail, metric);
    if (!point || !Number.isFinite(point.valueNum)) return [];
    return [{ metric, point }];
  });
  const favoriteTickers = favorites?.tickers ?? [];
  const maxFavorites = favorites?.maxTickers || WATCHLIST_MAX_TICKERS;
  const isFavorite = selectedTicker ? favoriteTickers.includes(selectedTicker) : false;
  const atFavCap = favoriteTickers.length >= maxFavorites;

  const applyTicker = useCallback((raw: string) => {
    const ticker = raw.trim().toUpperCase();
    if (!isValidTicker(ticker)) {
      setError('Ticker inválido. Use 4 a 6 caracteres (ex.: PETR4).');
      return;
    }
    setQuery(ticker);
    setSelectedTicker(ticker);
    setOpenList(false);
    setSearchParams({ ticker }, { replace: true });
  }, [setSearchParams]);

  const loadCatalog = useCallback(async () => {
    try {
      const [known, fav] = await Promise.all([listKnownTickers(), getFavorites()]);
      setCatalog(known.tickers ?? []);
      setFavorites(fav);
    } catch (err) {
      setError(mapAnalystError(err, 'Falha ao carregar tickers conhecidos'));
    }
  }, []);

  const loadDossier = useCallback(async (ticker: string) => {
    setLoading(true);
    setChangesLoading(true);
    setError('');
    try {
      const [nextRuns, nextChanges] = await Promise.all([
        listRuns(ticker, 20),
        listChanges(20, ticker),
      ]);
      setRuns(nextRuns);
      setChanges(nextChanges);
      if (nextRuns[0]?.id) {
        try {
          setDetail(await getRun(nextRuns[0].id));
        } catch (err) {
          if (isNotFound(err)) {
            setDetail(null);
          } else {
            throw err;
          }
        }
      } else {
        setDetail(null);
      }
      try {
        setMemory(await getMemory(ticker));
      } catch (err) {
        if (isNotFound(err)) {
          setMemory(null);
        } else {
          throw err;
        }
      }
    } catch (err) {
      setError(mapAnalystError(err, 'Falha ao carregar o dossiê'));
      setRuns([]);
      setDetail(null);
      setChanges([]);
      setMemory(null);
    } finally {
      setLoading(false);
      setChangesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!selectedTicker) {
      setRuns([]);
      setDetail(null);
      setMemory(null);
      setChanges([]);
      return;
    }
    void loadDossier(selectedTicker);
  }, [selectedTicker, loadDossier]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpenList(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpenList(true);
      setActiveIndex((prev) => Math.min(prev + 1, Math.max(suggestions.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpenList(true);
      setActiveIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (openList && suggestions[activeIndex]) {
        applyTicker(suggestions[activeIndex]);
        return;
      }
      applyTicker(normalizedQuery);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpenList(false);
    }
  };

  const toggleFavorite = async () => {
    if (!selectedTicker || savingFav) return;
    const next = isFavorite
      ? favoriteTickers.filter((ticker) => ticker !== selectedTicker)
      : [...favoriteTickers, selectedTicker];
    if (!isFavorite && atFavCap) {
      addToast({ type: 'error', title: 'Limite de favoritos', description: `A lista aceita no máximo ${maxFavorites} ativos.` });
      return;
    }
    setSavingFav(true);
    try {
      const saved = await saveFavorites(next);
      setFavorites(saved);
      setCatalog((prev) => {
        const merged = new Set(prev);
        for (const ticker of saved.tickers) merged.add(ticker);
        return Array.from(merged).sort();
      });
    } catch (err) {
      addToast({ type: 'error', title: 'Favoritos', description: mapAnalystError(err, 'Não foi possível salvar o favorito.') });
    } finally {
      setSavingFav(false);
    }
  };

  return (
    <div className="market-desk">
      {favoriteTickers.length > 0 ? (
        <div className="market-desk-tickers" aria-label="Favoritos">
          {favoriteTickers.map((ticker) => (
            <span className="badge-role market-ticker-chip" key={ticker}>
              <button
                type="button"
                className="market-ticker-chip-label"
                onClick={() => applyTicker(ticker)}
              >
                {ticker}
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <form
        className="audits-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          applyTicker(normalizedQuery);
        }}
      >
        <div className="audits-filter-row audits-filter-row-primary">
          <div className="search-input-wrapper audits-search-field market-ticker-search" ref={wrapRef}>
            <Search size={16} className="search-icon" />
            <input
              ref={inputRef}
              id={`${instanceId}-ticker`}
              className="search-input"
              name="ticker"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value.toUpperCase());
                setOpenList(true);
                setActiveIndex(0);
              }}
              onFocus={() => setOpenList(true)}
              onKeyDown={onSearchKeyDown}
              maxLength={6}
              autoComplete="off"
              placeholder="Ticker (ex.: PETR4)"
              aria-label="Ticker"
              aria-autocomplete="list"
              aria-expanded={openList}
              aria-controls={`${instanceId}-listbox`}
              role="combobox"
            />
            {openList && suggestions.length > 0 ? (
              <ul id={`${instanceId}-listbox`} className="market-ticker-listbox" role="listbox">
                {suggestions.map((ticker, index) => (
                  <li key={ticker} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      className={`market-ticker-option${index === activeIndex ? ' is-active' : ''}`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        applyTicker(ticker);
                      }}
                    >
                      {ticker}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </form>

      {error ? (
        <div className="agent-test-result is-error" role="alert" style={{ marginBottom: '1rem' }}>
          <p>{error}</p>
        </div>
      ) : null}

      {!selectedTicker && !loading ? (
        <p className="text-muted market-desk-hint">
          Busque um ticker já conhecido nesta organização. O dossiê lê a última análise gravada — o lote diário é definido na watchlist da organização.
        </p>
      ) : null}

      {loading ? (
        <div className="market-signals" aria-busy="true" aria-live="polite">
          <div className="market-skeleton" />
          <div className="market-skeleton" />
          <div className="market-skeleton" />
          <div className="market-skeleton" />
        </div>
      ) : null}

      {selectedTicker && !loading && !latest ? (
        <div className="hpanel-table-card market-analysis-card">
          <div className="market-desk-header">
            <h2 className="market-analyze-title">{selectedTicker}</h2>
            <button
              type="button"
              className={`market-fav-btn${isFavorite ? ' is-on' : ''}`}
              onClick={() => { void toggleFavorite(); }}
              disabled={savingFav}
              aria-pressed={isFavorite}
              aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              title={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            >
              <Star size={18} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
          </div>
          <p className="text-muted">
            Ainda não há análise neste ativo. Ele entra no lote se estiver na watchlist da organização; o usuário não dispara análise.
          </p>
        </div>
      ) : null}

      {latest && !loading ? (
        <div className="hpanel-table-card market-analysis-card">
          <div className="market-desk-header">
            <h2 className="market-analyze-title">
              {latest.displayName || latest.ticker} · {latest.ticker}
            </h2>
            <button
              type="button"
              className={`market-fav-btn${isFavorite ? ' is-on' : ''}`}
              onClick={() => { void toggleFavorite(); }}
              disabled={savingFav}
              aria-pressed={isFavorite}
              aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              title={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            >
              <Star size={18} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
          </div>
          <dl className="market-desk-meta">
            <div>
              <dt>Analisado em</dt>
              <dd><time dateTime={latest.analyzedAt}>{formatWhen(latest.analyzedAt)}</time></dd>
            </div>
            <div>
              <dt>Coletado em</dt>
              <dd>
                {collectedAt ? <time dateTime={collectedAt}>{formatWhen(collectedAt)}</time> : '—'}
              </dd>
            </div>
          </dl>
          {runSources.length > 0 ? (
            <p className="text-muted market-desk-sources">
              Fontes: {runSources.map(sourceLabel).join(' · ')}
            </p>
          ) : null}
          {latest.staleFacts ? (
            <p className="market-stale-badge" role="status">
              Fatos de um dia civil anterior à análise (horário de Brasília).
            </p>
          ) : null}
          <section className="market-trajectory" aria-labelledby={`${instanceId}-traj`}>
            <h3 id={`${instanceId}-traj`} className="market-section-title">Trajetória</h3>
            <div className="market-charts">
              <SeriesChart
                title="Preço"
                periodHint="dia"
                points={series?.price}
                currentValue={signalValue(latest, 'price')}
                emptyMessage="Sem série de preço neste run. Rode uma análise nova se o Yahoo já coletou cotações."
              />
              <SeriesChart
                title="P/L"
                periodHint="ano"
                points={series?.pl}
                currentValue={signalValue(latest, 'pl')}
                emptyMessage="Sem histórico anual de P/L neste run."
              />
              <SeriesChart
                title="EV/EBITDA"
                periodHint="ano"
                points={series?.ev_ebitda}
                currentValue={signalValue(latest, 'ev_ebitda')}
                emptyMessage="Sem histórico anual de EV/EBITDA neste run."
              />
            </div>
          </section>
          {THESIS_CARD_PUBLISHED && latest.thesis ? <ThesisCard thesis={latest.thesis} /> : null}
          {latest.formulas ? <FormulasCard formulas={latest.formulas} /> : null}
          <div className="market-signals">
            {latest.signals.map((signal) => (
              <article className="market-signal" key={signal.metric}>
                <span className={`market-verdict ${signal.verdict}`}>
                  {VERDICT_LABEL[signal.verdict] || signal.verdict}
                </span>
                <h3>{METRIC_LABEL[signal.metric] || signal.metric}</h3>
                <p>{signal.explanation}</p>
                {signal.grounding?.dataSource ? (
                  <p className="text-muted">Fonte: {sourceLabel(signal.grounding.dataSource)}</p>
                ) : null}
              </article>
            ))}
          </div>
          <section className="market-macro" aria-labelledby={`${instanceId}-macro`}>
            <h3 id={`${instanceId}-macro`} className="market-section-title">Contexto macro</h3>
            {macroItems.length > 0 ? (
              <dl className="market-macro-grid">
                {macroItems.map(({ metric, point }) => (
                  <div key={metric}>
                    <dt>{METRIC_LABEL[metric] || metric}</dt>
                    <dd>
                      {formatNum(point.valueNum)}%
                      {point.dataSource ? (
                        <span className="text-muted"> · {sourceLabel(point.dataSource)}</span>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-muted">Macro indisponível neste run (CDI, Selic ou IPCA).</p>
            )}
          </section>
          {latest.gaps.length > 0 ? (
            <p className="text-muted">
              Lacunas: {latest.gaps.map((g) => `${METRIC_LABEL[g.metric] || g.metric} (${GAP_REASON_LABEL[g.reason] || g.reason})`).join(', ')}
            </p>
          ) : null}
          <section className="market-news" aria-labelledby={`${instanceId}-news`}>
            <h3 id={`${instanceId}-news`} className="market-section-title">Notícias</h3>
            {news.length > 0 ? (
              <ul className="market-news-list">
                {news.map((hit, index) => (
                  <li key={`${hit.collectedAt}-${index}`}>
                    <p>
                      {hit.collectedAt ? (
                        <time dateTime={hit.collectedAt}>{formatWhen(hit.collectedAt)}</time>
                      ) : null}
                      {hit.dataSource ? (
                        <span className="text-muted"> · {sourceLabel(hit.dataSource)}</span>
                      ) : null}
                    </p>
                    <p>{hit.content}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">
                {latest.newsCount && latest.newsCount > 0
                  ? 'Não há trechos gravados neste run. Analise de novo (admin) para listar as notícias.'
                  : 'Não há notícias indexadas para este ativo neste run.'}
              </p>
            )}
          </section>
          <div className="market-narrative" aria-live="polite">{latest.narrative}</div>
          {memory?.summary ? (
            <p className="text-muted">Memória derivada (rev. {memory.revision}): {memory.summary}</p>
          ) : null}
          <p className="market-disclaimer">{latest.disclaimer || DISCLAIMER}</p>
        </div>
      ) : null}

      {selectedTicker && runs.length > 0 ? (
        <div className="hpanel-table-card desktop-table-view" style={{ marginBottom: '1rem' }}>
          <h3 className="market-analyze-title">Histórico</h3>
          <table className="hpanel-table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Origem</th>
                <th>Preço</th>
                <th>P/L</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td><time dateTime={run.analyzedAt}>{formatWhen(run.analyzedAt)}</time></td>
                  <td>{triggerLabel(run.trigger)}</td>
                  <td>
                    {runVerdict(run, 'price')
                      ? (VERDICT_LABEL[runVerdict(run, 'price')!] || runVerdict(run, 'price'))
                      : '—'}
                  </td>
                  <td>
                    {runVerdict(run, 'pl')
                      ? (VERDICT_LABEL[runVerdict(run, 'pl')!] || runVerdict(run, 'pl'))
                      : '—'}
                  </td>
                  <td>{run.outcome || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selectedTicker ? (
        <>
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
                        <span>Ainda não há mudança de veredito em {selectedTicker}.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  changes.map((item) => (
                    <tr key={item.id}>
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
              <div className="mobile-domain-card" key={item.id}>
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
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
};
