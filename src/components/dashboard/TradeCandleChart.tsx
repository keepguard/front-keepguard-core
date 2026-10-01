import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CrosshairMode, LineStyle, type IChartApi, type ISeriesApi } from 'lightweight-charts';
import { ArrowUpDown, Calendar, Save, Search, Star } from 'lucide-react';
import { getTradeCandleHistory, getTradeFavorites, getTradeSnapshot, saveTradeFavorites, type TradeCandle, type TradeFavoriteFilter } from '../../services/tradeService';
import { ReorderFavoritesModal } from './ReorderFavoritesModal';
import { RefreshCombo } from '../common/RefreshCombo';
import { useToast } from '../../context/ToastContext';

/** Espelha analysis.TradeFavoritesMaxTickers (ms-analyst-finance) — só feedback client-side
 * antecipado; o servidor é a fonte de verdade (`422 TOO_MANY_TRADE_FAVORITES`). */
const TRADE_FAVORITES_MAX = 20;

/** Espera parar de digitar antes de buscar no backend — mesmo esquema do Trade Day
 * (`TradeView.tsx`): evita 1 request por tecla e não fica preso aos ~100 tickers
 * carregados no Monitor (`MONITOR_SIZE`), que não cobrem o universo inteiro de quem
 * tem acesso amplo (VIP/ops). */
const SEARCH_DEBOUNCE_MS = 350;

/** Timeframes fixos do combo. O valor "CUSTOM" (campo livre M1-M59/H1-H24) segue suportado
 * por `effectiveTimeframe`/`customTimeframeInput`, só oculto da lista visível por pedido de UX
 * — pouco usado e disputava espaço com os timeframes fixos. */
const TIMEFRAMES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'M1', label: 'M1' },
  { id: 'M5', label: 'M5' },
  { id: 'M10', label: 'M10' },
  { id: 'M30', label: 'M30' },
  { id: 'H1', label: 'H1' },
];
const TIMEFRAME_RE = /^(M([1-9]|[1-5][0-9])|H([1-9]|1[0-9]|2[0-4]))$/;
const DEFAULT_TIMEFRAME = 'M10';

/** Períodos fixos do toolbar; "Personalizado" usa o intervalo de datas ao lado. */
const RANGES: ReadonlyArray<{ id: string; label: string; days: number | null }> = [
  { id: '1D', label: '1D', days: 1 },
  { id: '5D', label: '5D', days: 5 },
  { id: '1M', label: '1M', days: 31 },
  { id: '3M', label: '3M', days: 92 },
  { id: '6M', label: '6M', days: 182 },
  { id: '1A', label: '1A', days: 366 },
  { id: 'CUSTOM', label: 'Personalizado', days: null },
];
const DEFAULT_RANGE = '1D';

const HISTORY_LIMIT = 1000;

interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function toBars(candles: TradeCandle[]): Bar[] {
  return candles.map((c) => ({
    time: Math.floor(new Date(c.ts).getTime() / 1000),
    open: c.open,
    high: Math.max(c.high, c.open, c.close),
    low: Math.min(c.low, c.open, c.close),
    close: c.close,
    volume: c.realVolume > 0 ? c.realVolume : c.tickVolume,
  }));
}

function ema(bars: Bar[], n: number): number[] {
  const k = 2 / (n + 1);
  const out = new Array(bars.length);
  let e: number | null = null;
  for (let i = 0; i < bars.length; i++) {
    e = e == null ? bars[i].close : bars[i].close * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}

function vwap(bars: Bar[]): number[] {
  const out = new Array(bars.length);
  let day: number | null = null;
  let pv = 0;
  let vv = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const d = Math.floor(b.time / 86400);
    if (d !== day) {
      day = d;
      pv = 0;
      vv = 0;
    }
    const tp = (b.high + b.low + b.close) / 3;
    pv += tp * (b.volume || 0);
    vv += b.volume || 0;
    out[i] = vv > 0 ? pv / vv : tp;
  }
  return out;
}

// lightweight-charts sempre rotula o eixo de tempo em UTC (não tem opção de fuso local) — sem
// esse deslocamento, o eixo mostra o horário adiantado pelo fuso do navegador (3h no Brasil).
// Desloca só o valor exibido na série; bars/summary continuam com o epoch real.
function toChartTime(epochSeconds: number): number {
  return epochSeconds - new Date(epochSeconds * 1000).getTimezoneOffset() * 60;
}

const tok = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

const nfPx = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfPct = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const nfVol = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const nfInt = new Intl.NumberFormat('pt-BR');
const fmtPx = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : nfPx.format(v));
const pad = (n: number) => String(n).padStart(2, '0');
function fmtDT(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Formato aceito por <input type="datetime-local">, em horário local. */
function toLocalInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  /** Tickers que o usuário pode abrir (página atual do Trade); a checagem final é sempre do backend. */
  tickers: string[];
  /** Tamanho real do universo do plano (`TradeSnapshot.total`), não só desta página —
   * admin/ops e VIP têm acesso a todo o catálogo habilitado (bem além dos MONITOR_SIZE
   * tickers carregados), então `tickers` sozinho não basta pra saber se um favorito
   * ainda está dentro do plano. */
  totalPlanTickers: number;
}

export function TradeCandleChart({ tickers, totalPlanTickers }: Props) {
  const { addToast } = useToast();
  const [ticker, setTicker] = useState('');

  // Tempo gráfico: combo fixo + entrada livre quando "Personalizado".
  const [timeframeSel, setTimeframeSel] = useState<string>(DEFAULT_TIMEFRAME);
  const [customTimeframeInput, setCustomTimeframeInput] = useState('');
  const customTimeframeValid = customTimeframeInput !== '' && TIMEFRAME_RE.test(customTimeframeInput.toUpperCase());
  // Timeframe que efetivamente vai na consulta; null enquanto "Personalizado" não tem valor válido (não busca).
  const effectiveTimeframe = timeframeSel === 'CUSTOM' ? (customTimeframeValid ? customTimeframeInput.toUpperCase() : null) : timeframeSel;

  // Período: pills fixas + intervalo personalizado (rascunho digitado x aplicado na busca).
  const [range, setRange] = useState<string>(DEFAULT_RANGE);
  const [customDraft, setCustomDraft] = useState({ from: '', to: '' });
  const [customApplied, setCustomApplied] = useState({ from: '', to: '' });
  const [customError, setCustomError] = useState<string | null>(null);

  const [ind, setInd] = useState({ ema9: true, ema21: true, vwap: false, vol: true });
  const [bars, setBars] = useState<Bar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Favoritos pessoais do Trade (busca + chips + reorder), substituindo o antigo <select>.
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteFilters, setFavoriteFilters] = useState<Record<string, TradeFavoriteFilter>>({});
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);

  // Ticker inicial: o primeiro favorito (na ordem dos chips), com o filtro salvo dele —
  // só cai pro primeiro ativo do Monitor se não houver nenhum favorito. Depende de
  // `favoritesLoaded` pra não "piscar" pro ativo default antes da resposta de favoritos
  // chegar. Depois da carga inicial, não reseta uma seleção manual (via busca ou favorito)
  // a cada poll do snapshot, mesmo que o ticker escolhido esteja fora da primeira página de
  // MONITOR_SIZE (busca e favoritos já validam contra o plano no backend).
  useEffect(() => {
    if (!ticker && favoritesLoaded && tickers.length) setTicker(tickers[0]);
  }, [tickers, ticker, favoritesLoaded]);

  const [savingFav, setSavingFav] = useState(false);
  const [favError, setFavError] = useState<string | null>(null);
  const [savingFilter, setSavingFilter] = useState(false);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [openList, setOpenList] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    getTradeFavorites()
      .then((res) => {
        if (!alive) return;
        setFavorites(res.tickers);
        setFavoriteFilters(res.filters ?? {});
        // Primeiro favorito na ordem dos chips vira o ativo aberto ao entrar no Monitor,
        // com o filtro salvo dele — reordenar os favoritos muda qual abre primeiro.
        if (res.tickers.length > 0) applyTicker(res.tickers[0], res.filters?.[res.tickers[0]], true);
      })
      .catch(() => { /* falha ao carregar favoritos não deve travar o gráfico */ })
      .finally(() => { if (alive) setFavoritesLoaded(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!searchWrapRef.current?.contains(event.target as Node)) setOpenList(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim().toUpperCase()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query]);

  // Busca no backend (GET /trade/snapshot?q=), igual ao Trade Day — cobre o universo
  // inteiro do plano (fixos+picks, ou todo o habilitado pra VIP/ops), não só a primeira
  // página de tickers já carregada no Monitor.
  useEffect(() => {
    if (!debouncedQuery) { setSuggestions([]); setSuggestionsLoading(false); return; }
    const controller = new AbortController();
    setSuggestionsLoading(true);
    getTradeSnapshot(1, 8, debouncedQuery, controller.signal)
      .then((res) => setSuggestions(res.items.map((it) => it.ticker)))
      .catch(() => { if (!controller.signal.aborted) setSuggestions([]); })
      .finally(() => { if (!controller.signal.aborted) setSuggestionsLoading(false); });
    return () => controller.abort();
  }, [debouncedQuery]);

  // `fromFavoriteChip` diz que a troca veio de um clique num chip — cada favorito tem sua
  // própria config, então aqui o timeframe/período são sempre definidos explicitamente
  // (o filtro salvo daquele ticker, ou o default), nunca herdados do ticker visto antes.
  // Sem isso, um favorito sem filtro próprio "herdava" visualmente o que ficou em tela do
  // favorito anterior, parecendo uma config global compartilhada entre todos.
  // Busca (search) continua sem mexer em timeframe/período — só troca o ativo.
  function applyTicker(next: string, filter?: TradeFavoriteFilter, fromFavoriteChip = false) {
    const t = next.trim().toUpperCase();
    if (!t) return;
    if (filter) {
      setTimeframeSel(filter.timeframe || DEFAULT_TIMEFRAME);
      setRange(filter.range || DEFAULT_RANGE);
      if (filter.range === 'CUSTOM' && filter.from && filter.to) {
        const draft = { from: toLocalInputValue(new Date(filter.from)), to: toLocalInputValue(new Date(filter.to)) };
        setCustomDraft(draft);
        setCustomApplied(draft);
      } else {
        setCustomDraft({ from: '', to: '' });
        setCustomApplied({ from: '', to: '' });
      }
    } else if (fromFavoriteChip) {
      setTimeframeSel(DEFAULT_TIMEFRAME);
      setRange(DEFAULT_RANGE);
      setCustomDraft({ from: '', to: '' });
      setCustomApplied({ from: '', to: '' });
    }
    setTicker(t);
    setQuery('');
    setOpenList(false);
    setActiveIndex(0);
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
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
      if (suggestions[activeIndex]) applyTicker(suggestions[activeIndex]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpenList(false);
    }
  }

  async function toggleFavorite() {
    if (!ticker || savingFav) return;
    const isFav = favorites.includes(ticker);
    const next = isFav ? favorites.filter((t) => t !== ticker) : [...favorites, ticker];
    if (!isFav && next.length > TRADE_FAVORITES_MAX) {
      setFavError(`Você pode marcar até ${TRADE_FAVORITES_MAX} ativos como favoritos do Trade.`);
      return;
    }
    setSavingFav(true);
    setFavError(null);
    try {
      // Ao desfavoritar, o filtro salvo daquele ticker não é mais enviado — o backend
      // descarta a entrada órfã e o retorno já reflete isso (sem passo extra aqui).
      const saved = await saveTradeFavorites(next, favoriteFilters);
      setFavorites(saved.tickers);
      setFavoriteFilters(saved.filters ?? {});
    } catch (e: unknown) {
      const code = (e as { data?: { error?: string } })?.data?.error;
      setFavError(code === 'TOO_MANY_TRADE_FAVORITES'
        ? `Você pode marcar até ${TRADE_FAVORITES_MAX} ativos como favoritos do Trade.`
        : 'Não foi possível salvar o favorito.');
    } finally {
      setSavingFav(false);
    }
  }

  async function handleReorderSave(nextTickers: string[]) {
    try {
      const saved = await saveTradeFavorites(nextTickers, favoriteFilters);
      setFavorites(saved.tickers);
      setFavoriteFilters(saved.filters ?? {});
    } catch {
      setFavError('Não foi possível atualizar a ordem dos favoritos.');
    }
  }

  // Só habilitado com o ticker atual já favoritado — grava o timeframe/período em tela
  // como preferência daquele favorito (regra: período CUSTOM salva o intervalo aplicado,
  // nunca o rascunho ainda não confirmado em customDraft).
  async function saveCurrentFilter() {
    if (!ticker || !favorites.includes(ticker) || savingFilter || effectiveTimeframe == null) return;
    const filter: TradeFavoriteFilter = { timeframe: effectiveTimeframe, range };
    if (range === 'CUSTOM') {
      if (!customApplied.from || !customApplied.to) {
        setFilterError('Aplique um intervalo personalizado antes de salvar o filtro.');
        return;
      }
      filter.from = new Date(customApplied.from).toISOString();
      filter.to = new Date(customApplied.to + ':59').toISOString();
    }
    setSavingFilter(true);
    setFilterError(null);
    try {
      const saved = await saveTradeFavorites(favorites, { ...favoriteFilters, [ticker]: filter });
      setFavorites(saved.tickers);
      setFavoriteFilters(saved.filters ?? {});
      addToast({ type: 'success', title: 'Filtro salvo', description: `${ticker} vai abrir em ${filter.timeframe}/${filter.range}.` });
    } catch {
      setFilterError('Não foi possível salvar o filtro deste favorito.');
      addToast({ type: 'error', title: 'Filtro do favorito', description: 'Não foi possível salvar o filtro deste favorito.' });
    } finally {
      setSavingFilter(false);
    }
  }

  function onChipDragStart(e: React.DragEvent, index: number) {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }

  function onChipDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropIndex !== index) setDropIndex(index);
  }

  function onChipDrop(targetIndex: number) {
    if (dragIndex !== null && dragIndex !== targetIndex) {
      const next = [...favorites];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      void handleReorderSave(next);
    }
    setDragIndex(null);
    setDropIndex(null);
  }

  function onChipDragEnd() {
    setDragIndex(null);
    setDropIndex(null);
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<{
    candle: ISeriesApi<'Candlestick'>;
    vol: ISeriesApi<'Histogram'>;
    e9: ISeriesApi<'Line'>;
    e21: ISeriesApi<'Line'>;
    vwap: ISeriesApi<'Line'>;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      // attributionLogo: false remove o link/logo da TradingView que a lib mostra por padrão.
      layout: { fontFamily: 'JetBrains Mono, monospace', fontSize: 11, attributionLogo: false },
      rightPriceScale: { scaleMargins: { top: 0.08, bottom: 0.24 } },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 8, minBarSpacing: 0.5 },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { locale: 'pt-BR' },
    });
    const candle = chart.addCandlestickSeries({ priceFormat: { type: 'price', precision: 2, minMove: 0.01 } });
    const vol = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });
    const lineOpts = { lineWidth: 2 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    const e9 = chart.addLineSeries(lineOpts);
    const e21 = chart.addLineSeries(lineOpts);
    const vwapSeries = chart.addLineSeries({ ...lineOpts, lineStyle: LineStyle.Dashed });
    chartRef.current = chart;
    seriesRef.current = { candle, vol, e9, e21, vwap: vwapSeries };

    const applyTheme = () => {
      const up = tok('--success') || '#0C9A6A';
      const down = tok('--danger') || '#D9434A';
      const ink = tok('--text-main');
      const muted = tok('--text-muted');
      const faint = tok('--text-sub');
      const line = tok('--border');
      const grid = tok('--border-subtle');
      const surface = tok('--bg-card');
      chart.applyOptions({
        layout: { background: { color: surface }, textColor: muted },
        grid: { vertLines: { color: grid }, horzLines: { color: grid } },
        rightPriceScale: { borderColor: line },
        timeScale: { borderColor: line },
        crosshair: {
          vertLine: { color: faint, width: 1, style: LineStyle.Dashed, labelBackgroundColor: ink },
          horzLine: { color: faint, width: 1, style: LineStyle.Dashed, labelBackgroundColor: ink },
        },
      });
      candle.applyOptions({ upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down });
      e9.applyOptions({ color: tok('--warning') || '#E08A1E' });
      e21.applyOptions({ color: tok('--primary') || '#6B4FD0' });
      vwapSeries.applyOptions({ color: tok('--secondary') || '#0F84A8' });
    };
    applyTheme();
    const observer = new MutationObserver(applyTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Busca candles: nunca depende do rascunho do intervalo personalizado (customDraft), só do
  // aplicado (customApplied) — evita o bug em que digitar a data disparava um fetch com o
  // período fixo antigo e depois reescrevia o campo de volta.
  // `refreshNonce` entra nas deps só para o RefreshCombo poder forçar um novo fetch sem mudar
  // nenhum filtro (manual ou automático).
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // true só quando `bars` mudou por troca de ticker/timeframe/período — é quando faz sentido
  // reenquadrar o gráfico. Um refresh (manual ou automático) só traz candle novo no fim da
  // série; refazer o fitContent ali descartaria o zoom/scroll que o usuário já tinha. Comparamos
  // a "chave de filtro" (tudo exceto refreshNonce) com a da execução anterior — se não mudou,
  // só o refreshNonce mexeu, logo foi refresh, não troca de filtro.
  const shouldFitRef = useRef(true);
  const lastFilterKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ticker) return;
    if (effectiveTimeframe == null) return; // "Personalizado" ainda sem timeframe válido
    const controller = new AbortController();
    const filterKey = JSON.stringify([ticker, effectiveTimeframe, range, customApplied.from, customApplied.to]);
    const isRefresh = lastFilterKeyRef.current === filterKey;
    lastFilterKeyRef.current = filterKey;
    shouldFitRef.current = !isRefresh;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    const opts: { timeframe: string; from?: Date; to?: Date; limit: number } = { timeframe: effectiveTimeframe, limit: HISTORY_LIMIT };
    if (range === 'CUSTOM') {
      if (customApplied.from) opts.from = new Date(customApplied.from);
      if (customApplied.to) opts.to = new Date(customApplied.to + ':59');
    } else {
      const r = RANGES.find((x) => x.id === range);
      if (r?.days) opts.from = new Date(Date.now() - r.days * 86400_000);
    }
    getTradeCandleHistory(ticker, opts, controller.signal)
      .then((res) => setBars(toBars(res.candles)))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        const code = (e as { data?: { error?: string } })?.data?.error;
        setError(code === 'ASSET_OUTSIDE_PLAN' ? 'Este ativo não faz parte do seu plano.' : 'Não foi possível carregar o histórico.');
        setBars([]);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => controller.abort();
  }, [ticker, effectiveTimeframe, range, customApplied.from, customApplied.to, refreshNonce]);

  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    const up = tok('--success') || '#0C9A6A';
    const down = tok('--danger') || '#D9434A';
    s.candle.setData(bars.map(({ time, open, high, low, close }) => ({ time: toChartTime(time) as never, open, high, low, close })));
    s.vol.setData(bars.map((b) => ({ time: toChartTime(b.time) as never, value: b.volume || 0, color: alpha(b.close >= b.open ? up : down, 0.28) })));
    s.vol.applyOptions({ visible: ind.vol });
    const e9 = ema(bars, 9);
    const e21 = ema(bars, 21);
    const vw = vwap(bars);
    s.e9.setData(ind.ema9 ? bars.map((b, i) => ({ time: toChartTime(b.time) as never, value: e9[i] })) : []);
    s.e21.setData(ind.ema21 ? bars.map((b, i) => ({ time: toChartTime(b.time) as never, value: e21[i] })) : []);
    s.vwap.setData(ind.vwap ? bars.map((b, i) => ({ time: toChartTime(b.time) as never, value: vw[i] })) : []);
    // Só reenquadra em troca de ticker/timeframe/período (ver shouldFitRef acima) — um
    // refresh de dado, ou só alternar indicadores, não deve mexer no zoom/scroll que o
    // usuário já ajustou. Reseta a flag logo após usá-la: senão o próximo toggle de
    // indicador (que também roda este efeito, mesmo `bars`) refitaria de novo.
    if (shouldFitRef.current) {
      chartRef.current?.timeScale().fitContent();
      shouldFitRef.current = false;
    }
  }, [bars, ind]);

  const summary = useMemo(() => {
    if (!bars.length) return null;
    const first = bars[0];
    const last = bars[bars.length - 1];
    let hi = -Infinity;
    let lo = Infinity;
    let vol = 0;
    for (const b of bars) {
      if (b.high > hi) hi = b.high;
      if (b.low < lo) lo = b.low;
      vol += b.volume || 0;
    }
    const chg = last.close - first.open;
    const pct = first.open ? (chg / first.open) * 100 : 0;
    const amplitude = lo ? ((hi - lo) / lo) * 100 : 0;
    return {
      last: last.close, chg, pct, open: first.open, high: hi, low: lo, amplitude, volume: vol, count: bars.length,
      from: fmtDT(new Date(first.time * 1000)), to: fmtDT(new Date(last.time * 1000)),
    };
  }, [bars]);

  // Clica na pill "Personalizado": habilita os inputs e, se já houver algo digitado, filtra
  // na hora por essas datas (sem apagar o que estava lá).
  function handlePeriodClick(id: string) {
    setRange(id);
    if (id === 'CUSTOM' && (customDraft.from || customDraft.to)) {
      setCustomApplied(customDraft);
    }
  }

  function handleAplicar() {
    if (!customDraft.from || !customDraft.to) {
      setCustomError('Preencha as duas datas.');
      return;
    }
    if (customDraft.from > customDraft.to) {
      setCustomError('"De" precisa ser antes de "Até".');
      return;
    }
    setCustomError(null);
    setCustomApplied(customDraft);
  }

  function handleLimpar() {
    setTimeframeSel(DEFAULT_TIMEFRAME);
    setCustomTimeframeInput('');
    setRange(DEFAULT_RANGE);
    setCustomDraft({ from: '', to: '' });
    setCustomApplied({ from: '', to: '' });
    setCustomError(null);
  }

  const nowLocalInput = toLocalInputValue(new Date());
  const customDisabled = range !== 'CUSTOM';

  if (!tickers.length) return null;

  return (
    <div className="tchart">
      <section className="tchart-quote" aria-label="Resumo do ativo">
        <div className="tchart-ticker">
          {favorites.length > 0 ? (
            <div className="market-desk-tickers">
              <div className="market-favs-header">
                <span className="market-desk-tickers-label" id="tchart-favs-label">Favoritos do Trade</span>
                {favorites.length > 1 ? (
                  <button
                    type="button"
                    className="market-favs-reorder-trigger"
                    onClick={() => setReorderOpen(true)}
                    title="Organizar favoritos"
                    aria-label="Organizar favoritos"
                  >
                    <ArrowUpDown size={13} />
                  </button>
                ) : null}
              </div>
              <div className="market-desk-tickers-list" role="group" aria-labelledby="tchart-favs-label">
                {favorites.map((fav, index) => {
                  // Só dá pra afirmar "fora do plano" quando a página carregada cobre o
                  // universo inteiro (tickers.length >= total) — caso contrário (VIP/admin
                  // com catálogo maior que MONITOR_SIZE), a ausência aqui não prova nada;
                  // o backend (PUT /trade/favorites) já validou o ticker na hora de salvar.
                  const outsidePlan = tickers.length >= totalPlanTickers && !tickers.includes(fav);
                  const isChipActive = fav === ticker;
                  return (
                    <span
                      key={fav}
                      className={`badge-role market-ticker-chip${isChipActive ? ' market-ticker-chip--active' : ''}${outsidePlan ? ' market-ticker-chip--locked' : ''}${dragIndex === index ? ' is-dragging' : ''}${dropIndex === index ? ' is-drag-over' : ''}`}
                      draggable={!outsidePlan}
                      onDragStart={(e) => onChipDragStart(e, index)}
                      onDragOver={(e) => onChipDragOver(e, index)}
                      onDrop={() => onChipDrop(index)}
                      onDragEnd={onChipDragEnd}
                      title={outsidePlan ? `${fav} não faz parte do seu plano no momento` : 'Clique para exibir ou arraste para reorganizar'}
                    >
                      <button
                        type="button"
                        className="market-ticker-chip-label"
                        onClick={() => applyTicker(fav, favoriteFilters[fav], true)}
                        disabled={outsidePlan}
                      >
                        {fav}
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="search-input-wrapper market-ticker-search tchart-fav-search" ref={searchWrapRef}>
            <Search size={14} className="search-icon" />
            <input
              className="search-input"
              value={query}
              onChange={(e) => { setQuery(e.target.value.toUpperCase()); setOpenList(true); setActiveIndex(0); }}
              onFocus={() => setOpenList(true)}
              onKeyDown={onSearchKeyDown}
              maxLength={6}
              autoComplete="off"
              placeholder="Buscar ativo do seu plano…"
              aria-label="Buscar ativo do Trade"
              aria-autocomplete="list"
              aria-expanded={openList}
              aria-controls="tchart-ticker-listbox"
              role="combobox"
            />
            {openList && suggestions.length > 0 ? (
              <ul id="tchart-ticker-listbox" className="market-ticker-listbox" role="listbox">
                {suggestions.map((t, index) => (
                  <li key={t} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      className={`market-ticker-option${index === activeIndex ? ' is-active' : ''}`}
                      onMouseDown={(e) => { e.preventDefault(); applyTicker(t); }}
                    >
                      <span className="market-ticker-option-symbol">{t}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {openList && query.trim() && suggestions.length === 0 && suggestionsLoading ? (
              <div className="market-ticker-listbox tchart-fav-empty-list">Buscando…</div>
            ) : null}
            {openList && debouncedQuery && suggestions.length === 0 && !suggestionsLoading ? (
              <div className="market-ticker-listbox tchart-fav-empty-list">
                Nenhum ativo do seu plano encontrado para &quot;{debouncedQuery}&quot;.
              </div>
            ) : null}
          </div>

          <div className="tchart-ticker-row">
            <span className="tchart-px" id="tchart-ativo">{ticker || '—'}</span>
            <span className="tchart-px">{summary ? fmtPx(summary.last) : '—'}</span>
            {summary ? (
              <span className={`tchart-pill ${summary.chg > 0 ? 'is-up' : summary.chg < 0 ? 'is-down' : 'is-flat'}`}>
                {summary.chg > 0 ? '+' : ''}{fmtPx(summary.chg)} ({nfPct.format(summary.pct)}%)
              </span>
            ) : <span className="tchart-pill is-flat">—</span>}
          </div>
          {favError ? <span className="tchart-error" role="alert">{favError}</span> : null}
        </div>
        {summary ? (
          <dl className="tchart-stats">
            <div className="tchart-stat"><dt>Abertura</dt><dd>{fmtPx(summary.open)}</dd></div>
            <div className="tchart-stat"><dt>Fechamento</dt><dd>{fmtPx(summary.last)}</dd></div>
            <div className="tchart-stat"><dt>Máxima</dt><dd className="is-up">{fmtPx(summary.high)}</dd></div>
            <div className="tchart-stat"><dt>Mínima</dt><dd className="is-down">{fmtPx(summary.low)}</dd></div>
            <div className="tchart-stat"><dt>Amplitude</dt><dd>{nfPct.format(summary.amplitude).replace('+', '')}%</dd></div>
            <div className="tchart-stat"><dt>Volume</dt><dd>{nfVol.format(summary.volume)}</dd></div>
            <div className="tchart-stat"><dt>Candles</dt><dd>{nfInt.format(summary.count)}</dd></div>
          </dl>
        ) : null}
      </section>

      <section className="tchart-toolbar" aria-label="Controles do gráfico">
        <div className="tchart-toolbar-row">
        <div className="tchart-group">
          <span>Tempo gráfico</span>
          <div className="tchart-tf-row">
            <select
              className="tchart-toolbar-select"
              aria-label="Tempo gráfico"
              value={timeframeSel}
              onChange={(e) => setTimeframeSel(e.target.value)}
            >
              {TIMEFRAMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            {timeframeSel === 'CUSTOM' ? (
              <input
                type="text"
                className={`tchart-custom-tf${customTimeframeInput && !customTimeframeValid ? ' is-invalid' : ''}`}
                placeholder="M15"
                aria-label="Timeframe customizado"
                aria-invalid={customTimeframeInput !== '' && !customTimeframeValid}
                aria-describedby="tchart-tf-error"
                value={customTimeframeInput}
                onChange={(e) => setCustomTimeframeInput(e.target.value)}
              />
            ) : null}
          </div>
          {timeframeSel === 'CUSTOM' && customTimeframeInput && !customTimeframeValid ? (
            <span id="tchart-tf-error" className="tchart-error" role="alert">Use M1-M59 ou H1-H24.</span>
          ) : null}
        </div>
        <div className="tchart-group">
          <span>Período</span>
          <div className="tchart-seg">
            {RANGES.map((r) => (
              r.id === 'CUSTOM' ? (
                <button
                  key={r.id}
                  type="button"
                  className="tchart-seg-icon"
                  aria-pressed={range === r.id}
                  aria-label="Período personalizado"
                  title="Período personalizado"
                  onClick={() => handlePeriodClick(r.id)}
                >
                  <Calendar size={14} />
                </button>
              ) : (
                <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => handlePeriodClick(r.id)}>{r.label}</button>
              )
            ))}
          </div>
        </div>
        <div className="tchart-group">
          <span>Intervalo personalizado</span>
          <div className="tchart-dates">
            <input
              type="datetime-local"
              value={customDraft.from}
              max={nowLocalInput}
              disabled={customDisabled}
              aria-disabled={customDisabled}
              onChange={(e) => setCustomDraft((d) => ({ ...d, from: e.target.value }))}
              aria-label="De"
            />
            <span className="tchart-arrow" aria-hidden="true">→</span>
            <input
              type="datetime-local"
              value={customDraft.to}
              max={nowLocalInput}
              disabled={customDisabled}
              aria-disabled={customDisabled}
              onChange={(e) => setCustomDraft((d) => ({ ...d, to: e.target.value }))}
              aria-label="Até"
            />
            <button type="button" className="btn btn-secondary tchart-btn-sm" disabled={customDisabled} aria-disabled={customDisabled} onClick={handleAplicar}>Aplicar</button>
          </div>
          {customError ? <span className="tchart-error" role="alert">{customError}</span> : null}
        </div>
        <div className="tchart-group tchart-group--actions">
          <button type="button" className="btn btn-secondary tchart-btn-sm" onClick={handleLimpar}>Limpar</button>
        </div>
        <div className="tchart-spacer" />
        <div className="tchart-group tchart-group--fav">
          <div className="tchart-fav-actions">
            <button
              type="button"
              className="market-fav-btn"
              onClick={() => { void saveCurrentFilter(); }}
              disabled={!ticker || !favorites.includes(ticker) || savingFilter}
              aria-label="Salvar timeframe e período deste favorito"
              title={ticker && favorites.includes(ticker) ? 'Salvar timeframe e período deste favorito' : 'Favorite o ativo para salvar um filtro'}
            >
              <Save size={16} />
            </button>
            <button
              type="button"
              className={`market-fav-btn${ticker && favorites.includes(ticker) ? ' is-on' : ''}`}
              onClick={() => { void toggleFavorite(); }}
              disabled={!ticker || savingFav}
              aria-pressed={!!ticker && favorites.includes(ticker)}
              aria-label={ticker && favorites.includes(ticker) ? 'Remover dos favoritos do Trade' : 'Adicionar aos favoritos do Trade'}
              title={ticker && favorites.includes(ticker) ? 'Remover dos favoritos do Trade' : 'Adicionar aos favoritos do Trade'}
            >
              <Star size={16} fill={ticker && favorites.includes(ticker) ? 'currentColor' : 'none'} />
            </button>
          </div>
          {filterError ? <span className="tchart-error" role="alert">{filterError}</span> : null}
        </div>
        <div className="tchart-group">
          <span>&nbsp;</span>
          <RefreshCombo onRefresh={() => setRefreshNonce((n) => n + 1)} disabled={loading} refreshing={refreshing} />
        </div>
        </div>
        <div className="tchart-toolbar-row">
          <div className="tchart-group">
            <span>Indicadores</span>
            <div className="tchart-seg tchart-seg--sans">
              {(['ema9', 'ema21', 'vwap', 'vol'] as const).map((k) => (
                <button key={k} type="button" aria-pressed={ind[k]} onClick={() => setInd((s) => ({ ...s, [k]: !s[k] }))}>
                  <span className={`tchart-swatch tchart-swatch--${k}`} aria-hidden="true" />
                  {{ ema9: 'MME 9', ema21: 'MME 21', vwap: 'VWAP', vol: 'Volume' }[k]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="tchart-card" aria-label="Gráfico de candles">
        <div className="tchart-area">
          <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
          {loading && !bars.length ? <div className="tchart-empty">Carregando…</div> : null}
          {error ? <div className="tchart-empty">{error}</div> : null}
          {!loading && !error && !bars.length ? <div className="tchart-empty">Sem candles neste período.</div> : null}
        </div>
      </section>

      <ReorderFavoritesModal
        isOpen={reorderOpen}
        onClose={() => setReorderOpen(false)}
        tickers={favorites}
        onSave={handleReorderSave}
      />
    </div>
  );
}
