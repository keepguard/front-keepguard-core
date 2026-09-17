import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpDown, Clock, LineChart, Lock, Plus, Scale, Search, Sparkles, Star } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import {
  addUserWatchlistPicks,
  getFavorites,
  getMemory,
  getRun,
  getUserWatchlist,
  isValidTicker,
  listCatalogTickers,
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
  type MarketAssetItem,
  type AssetClassType,
} from '../../services/analystService';

interface SearchSuggestion {
  ticker: string;
  displayName?: string;
  assetType?: AssetClassType;
  sectorLabel?: string;
  segment?: string;
  isDirectAction?: boolean;
}
import { onBillingEntitlement } from '../../services/billingService';
import { METRIC_LABEL, SOURCE_LABEL, VERDICT_LABEL, GAP_REASON_LABEL, deltaLabel, displayIsMaterial, isFiiAsset } from './marketLabels';
import { SeriesChart } from './SeriesChart';
import { ThesisCard, THESIS_CARD_PUBLISHED } from './ThesisCard';
import { ExecutiveFlagsPanel } from './ExecutiveFlagsPanel';
import { FormulasCard } from './FormulasCard';
import { FiiDossierView } from './FiiDossierView';
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
  if (data?.error === 'PRODUCT_RESTRICTED' || status === 403) {
    return data?.message || 'Este ativo não está incluído na cota do seu plano atual.';
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

function renderAssetTypeBadge(assetType?: AssetClassType) {
  if (!assetType) return null;
  switch (assetType) {
    case 'FII':
      return <span className="market-asset-type-badge market-asset-type-badge--fii">FII</span>;
    case 'FI_INFRA':
      return <span className="market-asset-type-badge market-asset-type-badge--fi-infra">FI-Infra</span>;
    case 'FIAGRO':
      return <span className="market-asset-type-badge market-asset-type-badge--fiagro">Fiagro</span>;
    case 'BDR':
      return <span className="market-asset-type-badge market-asset-type-badge--bdr">BDR</span>;
    case 'ETF':
      return <span className="market-asset-type-badge market-asset-type-badge--etf">ETF</span>;
    case 'STOCK':
      return <span className="market-asset-type-badge market-asset-type-badge--stock">Ação</span>;
    default:
      return <span className="market-asset-type-badge market-asset-type-badge--stock">{assetType}</span>;
  }
}

function signalValue(run: AnalystRun | null, metric: string): number | undefined {
  const signal = run?.signals.find((s) => s.metric === metric || s.code === metric);
  if (typeof signal?.valueNum === 'number') return signal.valueNum;
  const grounded = signal?.grounding?.valueNum;
  return typeof grounded === 'number' ? grounded : undefined;
}

function macroPoint(detail: AnalystRunDetail | null, metric: string): AnalystInputPoint | undefined {
  return detail?.inputs?.macro?.[metric];
}

/**
 * Ordena os pares do mesmo setor por comparabilidade. O catálogo não expõe valor
 * de mercado, então o critério é: mesmo tipo de ativo (não mistura ação com FII),
 * análise já gravada na frente de quem não tem, mesmo segmento na frente de quem
 * só divide o setor, e ticker como desempate estável.
 */
function rankSectorPeers(current: MarketAssetItem, items: MarketAssetItem[]): string[] {
  const currentTicker = current.ticker.toUpperCase();
  return items
    .filter(
      (item) =>
        item.sectorId === current.sectorId &&
        item.assetType === current.assetType &&
        item.ticker.toUpperCase() !== currentTicker,
    )
    .sort((a, b) => {
      const byRuns = Number(Boolean(b.hasRuns)) - Number(Boolean(a.hasRuns));
      if (byRuns !== 0) return byRuns;
      if (current.segment) {
        const bySegment =
          Number(b.segment === current.segment) - Number(a.segment === current.segment);
        if (bySegment !== 0) return bySegment;
      }
      return a.ticker.localeCompare(b.ticker);
    })
    .map((item) => item.ticker);
}

interface MarketDeskViewProps {
  onNavigateToCompare?: (tickers: string[]) => void;
}

export const MarketDeskView: React.FC<MarketDeskViewProps> = ({ onNavigateToCompare }) => {
  const { user } = useAuth();
  const isAdmin = Boolean(
    user?.roles?.some((r) => r === 'ROLE_ADMIN' || r === 'ROLE_OPS')
  );
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromQuery = tickerFromQuery(searchParams.get('ticker'));
  const [query, setQuery] = useState(() => fromQuery || '');
  const [appliedQuery, setAppliedQuery] = useState(fromQuery);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(fromQuery);

  const [catalog, setCatalog] = useState<string[]>([]);
  const [catalogItems, setCatalogItems] = useState<MarketAssetItem[]>([]);
  const [favorites, setFavorites] = useState<AnalystFavorites | null>(null);
  const [userWatchlist, setUserWatchlist] = useState<AnalystUserWatchlist | null>(null);
  const [openList, setOpenList] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleCompareWithPeers = useCallback(() => {
    const target = selectedTicker || appliedQuery || query;
    if (!target) return;
    const upper = target.trim().toUpperCase();
    const currentItem = catalogItems.find(
      (item) => item.ticker.toUpperCase() === upper,
    );
    const peers = currentItem?.sectorId
      ? rankSectorPeers(currentItem, catalogItems).slice(0, 2)
      : [];
    if (peers.length === 0) {
      addToast({
        type: 'info',
        title: 'Sem pares no mesmo setor',
        description: `Não encontramos outro ativo do mesmo setor de ${upper} no catálogo. Adicione os concorrentes manualmente no comparador.`,
      });
    }
    const tickersToCompare = [upper, ...peers];
    if (onNavigateToCompare) {
      onNavigateToCompare(tickersToCompare);
    } else {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'compare');
        next.set('tickers', tickersToCompare.join(','));
        return next;
      });
    }
  }, [selectedTicker, appliedQuery, query, catalogItems, onNavigateToCompare, setSearchParams, addToast]);

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
  const isVIP = userWatchlist?.planCode?.toUpperCase() === 'VIP' || (userWatchlist?.maxTickers ?? 0) >= WATCHLIST_MAX_TICKERS;
  const isFullAccess = isAdmin || isVIP;

  const catalogMap = useMemo(() => {
    const map = new Map<string, MarketAssetItem>();
    for (const item of catalogItems) {
      map.set(item.ticker, item);
    }
    return map;
  }, [catalogItems]);

  const [watchlistCategory, setWatchlistCategory] = useState<'ALL' | 'STOCK' | 'FII' | 'OTHER'>('ALL');

  const { stockCount, fiiCount, otherCount } = useMemo(() => {
    let s = 0;
    let f = 0;
    let o = 0;
    for (const t of watchlistTickers) {
      const type = catalogMap.get(t)?.assetType || 'STOCK';
      if (type === 'STOCK') {
        s++;
      } else if (type === 'FII') {
        f++;
      } else {
        o++;
      }
    }
    return { stockCount: s, fiiCount: f, otherCount: o };
  }, [watchlistTickers, catalogMap]);

  const filteredWatchlistTickers = useMemo(() => {
    if (watchlistCategory === 'ALL') return watchlistTickers;
    return watchlistTickers.filter((t) => {
      const type = catalogMap.get(t)?.assetType || 'STOCK';
      if (watchlistCategory === 'STOCK') return type === 'STOCK';
      if (watchlistCategory === 'FII') return type === 'FII';
      if (watchlistCategory === 'OTHER') return type !== 'STOCK' && type !== 'FII';
      return true;
    });
  }, [watchlistTickers, watchlistCategory, catalogMap]);

  const suggestions = useMemo<SearchSuggestion[]>(() => {
    const queryUpper = query.trim().toUpperCase();
    const queryLower = query.trim().toLowerCase();
    
    // Universo permitido para busca e navegação no dossiê:
    // Admin e VIP: catálogo completo do mercado (market_assets).
    // Usuários com plano regular: estritamente os seus picks do plano e favoritos.
    const allowedPool = isFullAccess
      ? Array.from(new Set([...favoriteTickers, ...watchlistTickers, ...lockedTickers, ...catalog]))
      : Array.from(new Set([...favoriteTickers, ...watchlistTickers]));

    if (!queryUpper) {
      return allowedPool.slice(0, 12).map((ticker) => {
        const meta = catalogMap.get(ticker);
        return {
          ticker,
          displayName: meta?.displayName,
          assetType: meta?.assetType,
          sectorLabel: meta?.sectorLabel,
          segment: meta?.segment,
        };
      });
    }

    const matched: SearchSuggestion[] = [];
    const seen = new Set<string>();

    if (isFullAccess) {
      for (const item of catalogItems) {
        const matchTicker = item.ticker.includes(queryUpper);
        const matchName = item.displayName && item.displayName.toLowerCase().includes(queryLower);
        const matchSegment = item.segment && item.segment.toLowerCase().includes(queryLower);
        const matchSector = item.sectorLabel && item.sectorLabel.toLowerCase().includes(queryLower);

        if (matchTicker || matchName || matchSegment || matchSector) {
          seen.add(item.ticker);
          matched.push({
            ticker: item.ticker,
            displayName: item.displayName,
            assetType: item.assetType,
            sectorLabel: item.sectorLabel,
            segment: item.segment,
          });
        }
      }
    } else {
      for (const t of allowedPool) {
        const item = catalogMap.get(t);
        const matchTicker = t.includes(queryUpper);
        const matchName = item?.displayName && item.displayName.toLowerCase().includes(queryLower);
        const matchSegment = item?.segment && item.segment.toLowerCase().includes(queryLower);
        const matchSector = item?.sectorLabel && item.sectorLabel.toLowerCase().includes(queryLower);

        if (matchTicker || matchName || matchSegment || matchSector) {
          seen.add(t);
          matched.push({
            ticker: t,
            displayName: item?.displayName,
            assetType: item?.assetType,
            sectorLabel: item?.sectorLabel,
            segment: item?.segment,
          });
        }
      }
    }

    matched.sort((a, b) => {
      const aStarts = a.ticker.startsWith(queryUpper);
      const bStarts = b.ticker.startsWith(queryUpper);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.ticker.localeCompare(b.ticker);
    });

    const results = matched.slice(0, 10);

    const exactMatch = results.some((r) => r.ticker === queryUpper);
    if (isFullAccess && isValidTicker(queryUpper) && !exactMatch) {
      results.unshift({
        ticker: queryUpper,
        displayName: 'Consultar dossiê no mercado',
        isDirectAction: true,
      });
    }

    return results;
  }, [catalog, catalogItems, catalogMap, favoriteTickers, watchlistTickers, lockedTickers, query, isFullAccess]);

  const latest = runs[0] ?? null;
  const collectedAt = freshestCollectedAt(latest);
  const runSources = uniqueSources(latest);
  const series = detail?.inputs?.series;
  const isBank = Boolean(latest?.formulas?.context?.bank);
  const assetType = (latest?.assetType || (latest ? catalogMap.get(latest.ticker)?.assetType : undefined)) as AssetClassType | undefined;
  const isFii = isFiiAsset(assetType, latest?.ticker);
  const loadingLooksFii = isFiiAsset(
    catalogMap.get(selectedTicker ?? '')?.assetType,
    selectedTicker ?? undefined,
  );
  const analysisAgeHours = latest?.analyzedAt
    ? (Date.now() - new Date(latest.analyzedAt).getTime()) / (1000 * 3600)
    : 0;
  const analysisDaysAgo = Math.floor(analysisAgeHours / 24);
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
    if (!isFullAccess) {
      const allowedSet = new Set([...watchlistTickers, ...favoriteTickers]);
      if (allowedSet.size > 0 && !allowedSet.has(ticker)) {
        addToast({
          type: 'warning',
          title: 'Ativo fora da sua carteira',
          description: `O ativo "${ticker}" não consta nos seus picks do plano. Utilize o botão "Escolher Ativo (Pick)" para adicioná-lo à sua carteira.`,
        });
        return;
      }
    }
    setError('');
    setQuery(ticker);
    setSelectedTicker(ticker);
    setOpenList(false);
    setSearchParams({ ticker }, { replace: true });
  }, [isFullAccess, watchlistTickers, favoriteTickers, addToast, setSearchParams]);

  const loadCatalog = useCallback(async () => {
    try {
      const [catalogRes, known, fav, uw] = await Promise.all([
        listCatalogTickers().catch(() => ({ tickers: [] as string[], items: [] as MarketAssetItem[] })),
        listKnownTickers(),
        getFavorites(),
        getUserWatchlist(),
      ]);
      const fullCatalog = catalogRes.tickers && catalogRes.tickers.length > 0
        ? catalogRes.tickers
        : (known.tickers ?? []);
      setCatalog(fullCatalog);
      setCatalogItems(catalogRes.items ?? []);
      setFavorites(fav);
      setUserWatchlist(uw);
      if (!initialAutoSelectedRef.current) {
        initialAutoSelectedRef.current = true;
        const currentParam = tickerFromQuery(new URLSearchParams(window.location.search).get('ticker'));
        if (!currentParam) {
          if (fav?.tickers && fav.tickers.length > 0) {
            applyTicker(fav.tickers[0]);
          } else if (uw?.tickers && uw.tickers.length > 0) {
            applyTicker(uw.tickers[0]);
          } else if (isFullAccess && fullCatalog.length > 0) {
            applyTicker(fullCatalog[0]);
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
    const handleFocus = () => {
      void loadCatalog();
    };
    window.addEventListener('focus', handleFocus);
    const unbind = onBillingEntitlement(() => {
      void loadCatalog();
    });
    return () => {
      window.removeEventListener('focus', handleFocus);
      unbind();
    };
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
        applyTicker(suggestions[activeIndex].ticker);
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
      {/* Banner Convidativo de Escolha de Picks do Plano (oculto para VIP com acesso integral) */}
      {!isVIP && (userWatchlist?.picksRemaining ?? 0) > 0 && (
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

      {/* Carteira do Plano (Watchlist Oficial - oculta para VIP para evitar poluição visual) */}
      {!isVIP && (watchlistTickers.length > 0 || lockedTickers.length > 0 || (userWatchlist?.picksRemaining ?? 0) > 0) && (
        <div className="market-desk-tickers" style={{ marginBottom: favoriteTickers.length > 0 ? '0.75rem' : '1rem' }}>
          <div className="market-favs-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span className="market-desk-tickers-label" id={`${instanceId}-watchlist`}>Meus Picks do Plano</span>
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

              {/* Taxonomy category tabs */}
              <div className="market-watchlist-filter-tabs" role="tablist" aria-label="Filtrar por classe de ativo">
                <button
                  type="button"
                  role="tab"
                  aria-selected={watchlistCategory === 'ALL'}
                  className={`market-watchlist-filter-tab ${watchlistCategory === 'ALL' ? 'is-active' : ''}`}
                  onClick={() => setWatchlistCategory('ALL')}
                >
                  Todos ({watchlistTickers.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={watchlistCategory === 'STOCK'}
                  className={`market-watchlist-filter-tab ${watchlistCategory === 'STOCK' ? 'is-active' : ''}`}
                  onClick={() => setWatchlistCategory('STOCK')}
                >
                  Ações ({stockCount})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={watchlistCategory === 'FII'}
                  className={`market-watchlist-filter-tab ${watchlistCategory === 'FII' ? 'is-active' : ''}`}
                  onClick={() => setWatchlistCategory('FII')}
                >
                  FIIs ({fiiCount})
                </button>
                {otherCount > 0 && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={watchlistCategory === 'OTHER'}
                    className={`market-watchlist-filter-tab ${watchlistCategory === 'OTHER' ? 'is-active' : ''}`}
                    onClick={() => setWatchlistCategory('OTHER')}
                  >
                    Outros ({otherCount})
                  </button>
                )}
              </div>
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
            {filteredWatchlistTickers.map((ticker) => {
              const isChipActive = ticker === selectedTicker;
              const isFixed = (userWatchlist?.fixedTickers ?? []).includes(ticker);
              const isPicked = (userWatchlist?.pickedTickers ?? []).includes(ticker);
              const meta = catalogMap.get(ticker);
              const nonStockType = meta?.assetType && meta.assetType !== 'STOCK' ? meta.assetType : null;

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
                    {nonStockType && (
                      <span style={{ marginLeft: '4px' }}>
                        {renderAssetTypeBadge(nonStockType)}
                      </span>
                    )}
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
            {filteredWatchlistTickers.length === 0 && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Nenhum ativo desta categoria nos picks do plano.
              </span>
            )}
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
              placeholder={
                isFullAccess
                  ? "Ticker ou ativo (ex.: PETR4, HGLG11)"
                  : `Buscar nos meus picks (ex.: ${watchlistTickers.slice(0, 2).join(', ') || 'MGLU3'})...`
              }
              aria-label="Ticker"
              aria-autocomplete="list"
              aria-expanded={openList}
              aria-controls={`${instanceId}-listbox`}
              role="combobox"
            />
            {openList && suggestions.length > 0 ? (
              <ul id={`${instanceId}-listbox`} className="market-ticker-listbox" role="listbox">
                {suggestions.map((item, index) => {
                  const isAction = item.isDirectAction;
                  return (
                    <li key={`${item.ticker}-${index}`} role="presentation">
                      {isAction ? (
                        <button
                          type="button"
                          role="option"
                          aria-selected={index === activeIndex}
                          className={`market-ticker-option-action${index === activeIndex ? ' is-active' : ''}`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            applyTicker(item.ticker);
                          }}
                        >
                          <Search size={14} />
                          <span>Consultar dossiê de <strong>{item.ticker}</strong></span>
                          <span className="market-ticker-action-hint">Enter ↵</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          role="option"
                          aria-selected={index === activeIndex}
                          className={`market-ticker-option${index === activeIndex ? ' is-active' : ''}`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            applyTicker(item.ticker);
                          }}
                        >
                          <div className="market-ticker-option-rich">
                            <div className="market-ticker-option-main">
                              {renderAssetTypeBadge(item.assetType)}
                              <span className="market-ticker-option-symbol">{item.ticker}</span>
                              {item.displayName ? (
                                <span className="market-ticker-option-name">· {item.displayName}</span>
                              ) : null}
                            </div>
                            {item.segment || item.sectorLabel ? (
                              <span className="market-ticker-option-sub">
                                {item.segment || item.sectorLabel}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {openList && query.trim() && suggestions.length === 0 ? (
              <div
                className="market-ticker-listbox"
                style={{ padding: '0.75rem 1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}
              >
                {!isFullAccess ? (
                  <div>
                    <div style={{ marginBottom: (userWatchlist?.picksRemaining ?? 0) > 0 ? '0.5rem' : 0 }}>
                      O ativo "{query}" não consta nos seus picks do plano.
                    </div>
                    {(userWatchlist?.picksRemaining ?? 0) > 0 ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm btn-pill"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setOpenList(false);
                          setPickModalOpen(true);
                        }}
                      >
                        <Plus size={13} style={{ marginRight: '4px' }} />
                        Escolher ativo na bolsa ({userWatchlist?.picksRemaining} restante{(userWatchlist?.picksRemaining ?? 0) > 1 ? 's' : ''})
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                        Seus {watchlistTickers.length} slots de picks estão ocupados.
                      </span>
                    )}
                  </div>
                ) : (
                  <span>Nenhum ativo encontrado para "{query}". Digite o ticker completo (ex.: HGLG11 ou PETR4) para pesquisar.</span>
                )}
              </div>
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
          <ExecutiveFlagsPanel loading={true} />
          {loadingLooksFii ? (
            <FiiDossierView loading />
          ) : (
            <div className="market-charts">
              <div className="market-skeleton" />
              <div className="market-skeleton" />
              <div className="market-skeleton" />
            </div>
          )}
        </div>
      ) : null}

      {selectedTicker && !loading && !latest ? (
        <div className="hpanel-table-card market-analysis-card">
          <div className="market-desk-header">
            <h2 className="market-analyze-title">{selectedTicker}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-pill market-compare-shortcut-btn"
                onClick={handleCompareWithPeers}
                title={`Comparar ${selectedTicker} com pares do mesmo setor`}
              >
                <Scale size={15} aria-hidden="true" />
                <span>Comparar com Pares</span>
              </button>
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
          </div>
          <p className="text-muted">
            Ainda não há análise neste ativo. Ele entra no lote se estiver na watchlist da organização; o usuário não dispara análise.
          </p>
        </div>
      ) : null}

      {latest && !loading ? (
        <div className="hpanel-table-card market-analysis-card">
          <div className="market-desk-header">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <h2 className="market-analyze-title">
                {latest.displayName || latest.ticker} · {latest.ticker}
              </h2>
              {latest.analyzedAt ? (
                <div
                  className={`market-freshness-badge ${analysisDaysAgo >= 1 ? 'is-warning' : 'is-fresh'}`}
                  title={`Análise processada em ${formatWhen(latest.analyzedAt)}`}
                >
                  <Clock size={13} />
                  <span>
                    {analysisDaysAgo === 0
                      ? `Análise de hoje (${formatWhen(latest.analyzedAt)})`
                      : analysisDaysAgo === 1
                      ? `Análise de ontem (${formatWhen(latest.analyzedAt)})`
                      : `Análise de ${analysisDaysAgo} dias atrás (${formatWhen(latest.analyzedAt)})`}
                  </span>
                </div>
              ) : null}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-pill market-compare-shortcut-btn"
                onClick={handleCompareWithPeers}
                title={`Comparar ${latest.ticker} com pares do setor`}
              >
                <Scale size={15} aria-hidden="true" />
                <span>Comparar com Pares</span>
              </button>
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
          {latest.flags ? <ExecutiveFlagsPanel flags={latest.flags} /> : null}
          {isFii ? (
            <FiiDossierView
              ticker={latest.ticker}
              displayName={latest.displayName}
              fiiDetails={detail?.fiiDetails ?? latest.fiiDetails}
              signals={latest.signals}
              currentInputs={detail?.inputs?.current}
              macroInputs={detail?.inputs?.macro}
            />
          ) : latest.formulas ? (
            <FormulasCard formulas={latest.formulas} />
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
              {series?.pvp && series.pvp.length > 0 ? (
                <SeriesChart
                  title="P/VP"
                  periodHint="ano"
                  points={series.pvp}
                  currentValue={signalValue(latest, 'pvp') ?? signalValue(latest, 'fii_pvp')}
                  emptyMessage="Sem histórico anual de P/VP neste run."
                />
              ) : null}
              {!isFii ? (
                <SeriesChart
                  title="P/L"
                  periodHint="ano"
                  points={series?.pl}
                  currentValue={signalValue(latest, 'pl')}
                  emptyMessage="Sem histórico anual de P/L neste run."
                />
              ) : null}
              {!isBank && !isFii ? (
                <SeriesChart
                  title="EV/EBITDA"
                  periodHint="ano"
                  points={series?.ev_ebitda}
                  currentValue={signalValue(latest, 'ev_ebitda')}
                  emptyMessage="Sem histórico anual de EV/EBITDA neste run."
                />
              ) : null}
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
                {(() => {
                  const seen = new Set<string>();
                  const deduped = latest.gaps.filter((gap) => {
                    if (seen.has(gap.metric)) return false;
                    seen.add(gap.metric);
                    return true;
                  });
                  return deduped.map((gap) => (
                    <li key={`${gap.metric}-${gap.reason}`}>
                      {METRIC_LABEL[gap.metric] || gap.metric}: {GAP_REASON_LABEL[gap.reason] || gap.reason}
                    </li>
                  ));
                })()}
              </ul>
            ) : null}
          </section>
          <section className="market-macro" aria-labelledby={`${instanceId}-macro`}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.65rem' }}>
              <h3 id={`${instanceId}-macro`} className="market-section-title" style={{ margin: 0 }}>Contexto macro</h3>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                Referência da análise: {formatWhen(latest.analyzedAt)}
              </span>
            </div>
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

          <div className="mobile-cards-container market-changes-mobile">
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
                <div className="mobile-card-meta">Ainda não há mudança de veredito em {selectedTicker}.</div>
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
        catalogItems={catalogItems}
        fixedTickers={userWatchlist?.fixedTickers ?? []}
        alreadyPickedTickers={userWatchlist?.pickedTickers ?? []}
        picksRemaining={userWatchlist?.picksRemaining ?? 0}
        onConfirmPick={handleConfirmPick}
      />
    </div>
  );
};
