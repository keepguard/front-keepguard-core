import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpDown, LineChart, Lock, Plus, Search, Sparkles, Star } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import {
  addUserWatchlistPicks,
  getFavorites,
  getMemory,
  getRun,
  getUserWatchlist,
  isValidTicker,
  listChanges,
  listKnownTickers,
  listRuns,
  saveFavorites,
  WATCHLIST_MAX_TICKERS,
  type AnalystFavorites,
  type AnalystUserWatchlist,
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
import { ReorderFavoritesModal } from './ReorderFavoritesModal';
import { PickTickersModal } from './PickTickersModal';

const DISCLAIMER = 'Análise, não recomendação de investimento.';

function tickerFromQuery(raw: string | null): string | null {
  const value = raw?.trim().toUpperCase() ?? '';
  return isValidTicker(value) ? value : null;
}

function mapAnalystError(err: unknown, fallback: string): string {
  const status = (err as { status?: number }).status;
  const data = (err as { data?: { error?: string; message?: string } }).data;
  if (data?.error === 'WATCHLIST_TOO_LARGE') {
    return data?.message || `A lista de favoritos aceita no máximo ${WATCHLIST_MAX_TICKERS} ativos.`;
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

const MACRO_METRICS = ['cdi_pct', 'selic_meta_pct', 'ipca_mensal_pct'] as const;
/** Só a análise mais recente alimenta o dossiê; histórico de runs não é exibido. */
const LATEST_RUNS_LIMIT = 1;
const NEWS_LIMIT = 5;

const MACRO_PERIOD: Record<(typeof MACRO_METRICS)[number], string> = {
  cdi_pct: 'dia',
  selic_meta_pct: 'a.a.',
  ipca_mensal_pct: 'mês',
};

function formatNum(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function macroMetricLabel(metric: string): string {
  const name = METRIC_LABEL[metric] || metric;
  const period = MACRO_PERIOD[metric as keyof typeof MACRO_PERIOD];
  return period ? `${name} (${period})` : name;
}

function newsPlainText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\b(?:data|src|srcset|href|alt|class|id|style|width|height|sizes)-?[a-z0-9-]*="[^"]*"/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function signalValue(run: AnalystRun | null, metric: string): number | undefined {
  const value = run?.signals.find((s) => s.metric === metric)?.grounding?.valueNum;
  return typeof value === 'number' ? value : undefined;
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
  const [userWatchlist, setUserWatchlist] = useState<AnalystUserWatchlist | null>(null);
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
  const [pickModalOpen, setPickModalOpen] = useState(false);

  const initialAutoSelectedRef = useRef(Boolean(fromQuery));
  const [reorderOpen, setReorderOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

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
  const favoriteTickers = favorites?.tickers ?? [];
  const watchlistTickers = userWatchlist?.tickers ?? [];
  const lockedTickers = userWatchlist?.lockedTickers ?? [];
  const maxFavorites = favorites?.maxTickers || WATCHLIST_MAX_TICKERS;
  const suggestions = useMemo(() => {
    const pool = Array.from(new Set([...favoriteTickers, ...watchlistTickers, ...lockedTickers, ...catalog]));
    if (!normalizedQuery) return pool.slice(0, 12);
    return pool.filter((ticker) => ticker.includes(normalizedQuery)).slice(0, 12);
  }, [catalog, favoriteTickers, watchlistTickers, lockedTickers, normalizedQuery]);

  const latest = runs[0] ?? null;
  const collectedAt = freshestCollectedAt(latest);
  const runSources = uniqueSources(latest);
  const series = detail?.inputs?.series;
  const news = detail?.news ?? [];
  const visibleNews = [...news]
    .sort((a, b) => (b.collectedAt || '').localeCompare(a.collectedAt || ''))
    .slice(0, NEWS_LIMIT)
    .map((hit) => ({ ...hit, text: newsPlainText(hit.content) }))
    .filter((hit) => hit.text.length > 0);
  const macroItems = MACRO_METRICS.flatMap((metric) => {
    const point = macroPoint(detail, metric);
    if (!point || !Number.isFinite(point.valueNum)) return [];
    return [{ metric, point }];
  });
  const macroSources = [...new Set(
    macroItems
      .map(({ point }) => point.dataSource)
      .filter((slug): slug is string => Boolean(slug)),
  )];
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
      const [known, fav, uw] = await Promise.all([listKnownTickers(), getFavorites(), getUserWatchlist()]);
      setCatalog(known.tickers ?? []);
      setFavorites(fav);
      setUserWatchlist(uw);
      if (!initialAutoSelectedRef.current) {
        initialAutoSelectedRef.current = true;
        const currentParam = tickerFromQuery(new URLSearchParams(window.location.search).get('ticker'));
        if (!currentParam) {
          if (uw?.tickers && uw.tickers.length > 0) {
            applyTicker(uw.tickers[0]);
          } else if (fav?.tickers && fav.tickers.length > 0) {
            applyTicker(fav.tickers[0]);
          } else if (known?.tickers && known.tickers.length > 0) {
            applyTicker(known.tickers[0]);
          }
        }
      }
    } catch (err) {
      setError(mapAnalystError(err, 'Falha ao carregar tickers conhecidos'));
    }
  }, [applyTicker]);

  const handleConfirmPick = async (ticker: string) => {
    try {
      const updated = await addUserWatchlistPicks([ticker]);
      setUserWatchlist(updated);
      addToast({
        type: 'success',
        title: 'Carteira do Plano',
        description: `Ativo ${ticker} adicionado à sua carteira com sucesso!`,
      });
      applyTicker(ticker);
    } catch (err: unknown) {
      const msg = mapAnalystError(err, 'Falha ao adicionar ativo à carteira');
      addToast({
        type: 'error',
        title: 'Erro ao adicionar ativo',
        description: msg,
      });
      throw err;
    }
  };

  const loadDossier = useCallback(async (ticker: string) => {
    setLoading(true);
    setChangesLoading(true);
    setError('');
    try {
      const [nextRuns, nextChanges] = await Promise.all([
        listRuns(ticker, LATEST_RUNS_LIMIT),
        listChanges(20, ticker),
      ]);
      setRuns(
        [...nextRuns]
          .sort((a, b) => (b.analyzedAt || '').localeCompare(a.analyzedAt || ''))
          .slice(0, LATEST_RUNS_LIMIT),
      );
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
    const isFav = favoriteTickers.includes(selectedTicker);
    const next = isFav
      ? favoriteTickers.filter((ticker) => ticker !== selectedTicker)
      : [...favoriteTickers, selectedTicker];
    if (!isFav && atFavCap) {
      addToast({ type: 'error', title: 'Limite de favoritos', description: `Você pode marcar até ${maxFavorites} ativos como favoritos rápidos.` });
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

  const handleReorderSave = async (nextTickers: string[]) => {
    try {
      const saved = await saveFavorites(nextTickers);
      setFavorites(saved);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Favoritos',
        description: mapAnalystError(err, 'Não foi possível atualizar a ordem dos favoritos.'),
      });
    }
  };

  const onChipDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const onChipDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropIndex !== index) {
      setDropIndex(index);
    }
  };

  const onChipDrop = (targetIndex: number) => {
    if (dragIndex !== null && dragIndex !== targetIndex) {
      const next = [...favoriteTickers];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      void handleReorderSave(next);
    }
    setDragIndex(null);
    setDropIndex(null);
  };

  const onChipDragEnd = () => {
    setDragIndex(null);
    setDropIndex(null);
  };

  return (
    <div className="market-desk">
      {/* Banner Convidativo de Escolha de Picks do Plano */}
      {(userWatchlist?.picksRemaining ?? 0) > 0 && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '1rem 1.25rem',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(103, 61, 230, 0.12) 0%, rgba(103, 61, 230, 0.04) 100%)',
            border: '1px solid var(--primary-border, #dcd2f9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            boxShadow: '0 2px 8px rgba(103, 61, 230, 0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'var(--primary, #673de6)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 10px rgba(103, 61, 230, 0.3)',
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main, #1d2129)' }}>
                Personalize sua Carteira do Plano
              </div>
              <div style={{ fontSize: '0.825rem', color: 'var(--text-muted, #5f6368)', marginTop: '2px' }}>
                Seu plano permite adicionar <strong>{userWatchlist?.picksRemaining} ativo{(userWatchlist?.picksRemaining ?? 0) > 1 ? 's' : ''}</strong> de sua escolha dentre todo o catálogo da B3. Esta escolha é definitiva.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setPickModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.625rem 1.25rem',
              fontWeight: 600,
              fontSize: '0.875rem',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(103, 61, 230, 0.25)',
            }}
          >
            <Plus size={16} />
            Escolher Ativo (Pick)
          </button>
        </div>
      )}

      {/* Carteira do Plano (Watchlist Oficial) */}
      {(watchlistTickers.length > 0 || lockedTickers.length > 0 || (userWatchlist?.picksRemaining ?? 0) > 0) && (
        <div className="market-desk-tickers" style={{ marginBottom: favoriteTickers.length > 0 ? '0.75rem' : '1rem' }}>
          <div className="market-favs-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="market-desk-tickers-label" id={`${instanceId}-watchlist`}>Carteira do Plano</span>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'var(--primary-light, #f0ecfc)',
                  color: 'var(--primary, #673de6)',
                  fontWeight: 600,
                }}
              >
                {watchlistTickers.length} ativo{watchlistTickers.length !== 1 ? 's' : ''}
              </span>
            </div>
            {(userWatchlist?.picksRemaining ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => setPickModalOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--primary, #673de6)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
                title="Escolher ativo para sua carteira"
              >
                <Plus size={14} /> Adicionar Pick ({userWatchlist?.picksRemaining})
              </button>
            )}
          </div>
          <div className="market-desk-tickers-list" role="group" aria-labelledby={`${instanceId}-watchlist`}>
            {watchlistTickers.map((ticker) => {
              const isChipActive = ticker === selectedTicker;
              const isFixed = (userWatchlist?.fixedTickers ?? []).includes(ticker);
              const isPicked = (userWatchlist?.pickedTickers ?? []).includes(ticker);

              return (
                <span
                  className={`badge-role market-ticker-chip${isChipActive ? ' market-ticker-chip--active' : ''}`}
                  key={ticker}
                  title={isFixed ? 'Ativo recomendado fixo do plano' : isPicked ? 'Ativo selecionado por você' : 'Ativo da carteira'}
                >
                  <button
                    type="button"
                    className="market-ticker-chip-label"
                    onClick={() => applyTicker(ticker)}
                  >
                    {ticker}
                    {isPicked && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          marginLeft: '4px',
                          padding: '1px 4px',
                          borderRadius: '4px',
                          background: 'var(--success-light, #e6f7f3)',
                          color: 'var(--success, #00b090)',
                          fontWeight: 700,
                        }}
                      >
                        PICK
                      </span>
                    )}
                  </button>
                </span>
              );
            })}
            {lockedTickers.map((ticker) => {
              const isChipActive = ticker === selectedTicker;
              return (
                <span
                  className={`badge-role market-ticker-chip market-ticker-chip--locked${isChipActive ? ' market-ticker-chip--active' : ''}`}
                  key={ticker}
                  title="Ativo congelado pela cota do plano atual."
                >
                  <button
                    type="button"
                    className="market-ticker-chip-label"
                    onClick={() => applyTicker(ticker)}
                  >
                    <Lock size={11} className="market-ticker-chip-lock-icon" />
                    {ticker}
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Favoritos Pessoais (se houver algum ativo favoritado avulso) */}
      {favoriteTickers.length > 0 ? (
        <div className="market-desk-tickers" style={{ opacity: 0.9 }}>
          <div className="market-favs-header">
            <span className="market-desk-tickers-label" id={`${instanceId}-favs`}>Favoritos Pessoais</span>
            {favoriteTickers.length > 1 && (
              <button
                type="button"
                className="market-favs-reorder-trigger"
                onClick={() => setReorderOpen(true)}
                title="Organizar favoritos"
                aria-label="Organizar favoritos"
              >
                <ArrowUpDown size={13} />
              </button>
            )}
          </div>
          <div className="market-desk-tickers-list" role="group" aria-labelledby={`${instanceId}-favs`}>
            {favoriteTickers.map((ticker, index) => {
              const isChipActive = ticker === selectedTicker;
              const isDragging = dragIndex === index;
              const isOver = dropIndex === index;

              return (
                <span
                  className={`badge-role market-ticker-chip${isChipActive ? ' market-ticker-chip--active' : ''}${isDragging ? ' is-dragging' : ''}${isOver ? ' is-drag-over' : ''}`}
                  key={ticker}
                  draggable
                  onDragStart={(e) => onChipDragStart(e, index)}
                  onDragOver={(e) => onChipDragOver(e, index)}
                  onDrop={() => onChipDrop(index)}
                  onDragEnd={onChipDragEnd}
                  title="Clique para abrir ou arraste para reorganizar"
                >
                  <button
                    type="button"
                    className="market-ticker-chip-label"
                    onClick={() => applyTicker(ticker)}
                  >
                    {ticker}
                  </button>
                </span>
              );
            })}
          </div>
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
        <div className="hpanel-table-card market-analysis-card" aria-busy="true" aria-live="polite">
          <div className="market-skeleton market-skeleton-title" />
          <div className="market-charts">
            <div className="market-skeleton" />
            <div className="market-skeleton" />
            <div className="market-skeleton" />
          </div>
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
          {THESIS_CARD_PUBLISHED && latest.thesis ? <ThesisCard thesis={latest.thesis} /> : null}
          {latest.formulas ? <FormulasCard formulas={latest.formulas} /> : null}
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
          <section className="market-signals-section" aria-labelledby={`${instanceId}-signals`}>
            <h3 id={`${instanceId}-signals`} className="market-section-title">Sinais</h3>
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
            {latest.gaps.length > 0 ? (
              <ul className="market-gaps">
                {latest.gaps.map((gap) => (
                  <li key={`${gap.metric}-${gap.reason}`}>
                    {METRIC_LABEL[gap.metric] || gap.metric}: {GAP_REASON_LABEL[gap.reason] || gap.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
          <section className="market-macro" aria-labelledby={`${instanceId}-macro`}>
            <h3 id={`${instanceId}-macro`} className="market-section-title">Contexto macro</h3>
            {macroItems.length > 0 ? (
              <>
                <dl className="market-macro-grid">
                  {macroItems.map(({ metric, point }) => (
                    <div className="market-macro-tile" key={metric}>
                      <dt>{macroMetricLabel(metric)}</dt>
                      <dd>{formatNum(point.valueNum)}%</dd>
                    </div>
                  ))}
                </dl>
                {macroSources.length > 0 ? (
                  <p className="text-muted market-macro-source">
                    Fonte: {macroSources.map(sourceLabel).join(' · ')}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-muted">Macro indisponível neste run (CDI, Selic ou IPCA).</p>
            )}
          </section>
          {latest.narrative ? (
            <section className="market-narrative-section" aria-labelledby={`${instanceId}-narrative`}>
              <h3 id={`${instanceId}-narrative`} className="market-section-title">Narrativa</h3>
              <div className="market-narrative" aria-live="polite">{latest.narrative}</div>
            </section>
          ) : null}
          <section className="market-news" aria-labelledby={`${instanceId}-news`}>
            <h3 id={`${instanceId}-news`} className="market-section-title">Notícias</h3>
            {visibleNews.length > 0 ? (
              <ul className="market-news-list">
                {visibleNews.map((hit, index) => (
                  <li key={`${hit.collectedAt}-${index}`}>
                    <p className="market-news-kicker">
                      {hit.collectedAt ? (
                        <time dateTime={hit.collectedAt}>{formatWhen(hit.collectedAt)}</time>
                      ) : null}
                      {hit.dataSource ? (
                        <span> · {sourceLabel(hit.dataSource)}</span>
                      ) : null}
                    </p>
                    <p className="market-news-body">{hit.text}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">
                {news.length > 0
                  ? 'Os trechos deste run não têm texto legível.'
                  : latest.newsCount && latest.newsCount > 0
                    ? 'Não há trechos gravados neste run. Analise de novo (admin) para listar as notícias.'
                    : 'Não há notícias indexadas para este ativo neste run.'}
              </p>
            )}
          </section>
          {memory?.summary ? (
            <p className="text-muted market-memory">Memória derivada (rev. {memory.revision}): {memory.summary}</p>
          ) : null}
          <p className="market-disclaimer">{latest.disclaimer || DISCLAIMER}</p>
        </div>
      ) : null}

      {selectedTicker ? (
        <section className="market-changes" aria-label="Mudanças de veredito">
          <div className="hpanel-table-card desktop-table-view market-table-card">
            <header className="market-table-header">
              <h3 className="market-table-title">Mudanças de veredito</h3>
            </header>
            <table className="hpanel-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Intensidade</th>
                  <th>Mudança</th>
                </tr>
              </thead>
              <tbody>
                {changesLoading && changes.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                      Carregando mudanças de veredito…
                    </td>
                  </tr>
                ) : changes.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
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
            <header className="market-mobile-header">
              <h3 className="market-section-title">Mudanças de veredito</h3>
            </header>
            {changesLoading && changes.length === 0 ? (
              <p className="text-muted">Carregando mudanças de veredito…</p>
            ) : changes.length === 0 ? (
              <div className="mobile-domain-card">
                <div className="mobile-card-top">
                  <span className="mobile-domain-name">{selectedTicker}</span>
                </div>
                <div className="mobile-card-meta">Ainda não há mudança de veredito neste ativo.</div>
              </div>
            ) : (
              changes.map((item) => (
                <div className="mobile-domain-card" key={item.id}>
                  <div className="mobile-card-top">
                    <span className="mobile-domain-name">{formatWhen(item.detectedAt)}</span>
                    <span className="badge-role" style={materialStyle(displayIsMaterial(item))}>
                      {displayIsMaterial(item) ? 'Material' : 'Leve'}
                    </span>
                  </div>
                  <div className="mobile-card-meta">
                    {item.changes.map((delta) => deltaLabel(delta.metric, delta.fromVerdict, delta.toVerdict)).join(' · ') || '—'}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      <ReorderFavoritesModal
        isOpen={reorderOpen}
        onClose={() => setReorderOpen(false)}
        tickers={favoriteTickers}
        maxActiveTickers={maxFavorites}
        onSave={handleReorderSave}
      />

      <PickTickersModal
        isOpen={pickModalOpen}
        onClose={() => setPickModalOpen(false)}
        catalog={catalog}
        fixedTickers={userWatchlist?.fixedTickers ?? []}
        alreadyPickedTickers={userWatchlist?.pickedTickers ?? []}
        picksRemaining={userWatchlist?.picksRemaining ?? 0}
        onConfirmPick={handleConfirmPick}
      />
    </div>
  );
};
