import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CrosshairMode, LineStyle, type IChartApi, type ISeriesApi } from 'lightweight-charts';
import { getTradeCandleHistory, type TradeCandle } from '../../services/tradeService';

/** Períodos fixos do toolbar, iguais ao protótipo aprovado. */
const RANGES: ReadonlyArray<{ id: string; label: string; days: number | null }> = [
  { id: '1D', label: '1D', days: 1 },
  { id: '5D', label: '5D', days: 5 },
  { id: '1M', label: '1M', days: 31 },
  { id: '3M', label: '3M', days: 92 },
  { id: '1A', label: '1A', days: 366 },
  { id: 'ALL', label: 'Tudo', days: null },
];

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

const tok = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

interface Props {
  /** Tickers que o usuário pode abrir (página atual do Trade); a checagem final é sempre do backend. */
  tickers: string[];
}

export function TradeCandleChart({ tickers }: Props) {
  const [ticker, setTicker] = useState(tickers[0] ?? '');
  const [range, setRange] = useState<string>('5D');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [ind, setInd] = useState({ ema9: true, ema21: true, vwap: false, vol: true });
  const [bars, setBars] = useState<Bar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker && tickers.length) setTicker(tickers[0]);
  }, [tickers, ticker]);

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
      layout: { fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
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

  useEffect(() => {
    if (!ticker) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const opts: { from?: Date; to?: Date; limit: number } = { limit: HISTORY_LIMIT };
    if (range === 'CUSTOM') {
      if (customFrom) opts.from = new Date(customFrom);
      if (customTo) opts.to = new Date(customTo + ':59');
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
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [ticker, range, customFrom, customTo]);

  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    const up = tok('--success') || '#0C9A6A';
    const down = tok('--danger') || '#D9434A';
    s.candle.setData(bars.map(({ time, open, high, low, close }) => ({ time: time as never, open, high, low, close })));
    s.vol.setData(bars.map((b) => ({ time: b.time as never, value: b.volume || 0, color: alpha(b.close >= b.open ? up : down, 0.28) })));
    s.vol.applyOptions({ visible: ind.vol });
    const e9 = ema(bars, 9);
    const e21 = ema(bars, 21);
    const vw = vwap(bars);
    s.e9.setData(ind.ema9 ? bars.map((b, i) => ({ time: b.time as never, value: e9[i] })) : []);
    s.e21.setData(ind.ema21 ? bars.map((b, i) => ({ time: b.time as never, value: e21[i] })) : []);
    s.vwap.setData(ind.vwap ? bars.map((b, i) => ({ time: b.time as never, value: vw[i] })) : []);
    chartRef.current?.timeScale().fitContent();
  }, [bars, ind]);

  const last = bars[bars.length - 1];
  const first = bars[0];
  const changePct = useMemo(() => (first && last && first.open ? ((last.close - first.open) / first.open) * 100 : null), [first, last]);

  if (!tickers.length) return null;

  return (
    <div className="trade-chart-card">
      <div className="trade-chart-toolbar">
        <label className="group">
          <span className="trade-chart-label">Ativo</span>
          <select value={ticker} onChange={(e) => setTicker(e.target.value)} className="trade-chart-select">
            {tickers.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <div className="seg">
          {RANGES.map((r) => (
            <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>
          ))}
        </div>
        <div className="trade-chart-dates">
          <input type="datetime-local" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label="De" />
          <span>→</span>
          <input type="datetime-local" value={customTo} onChange={(e) => setCustomTo(e.target.value)} aria-label="Até" />
          <button type="button" className="btn btn-secondary" onClick={() => setRange('CUSTOM')}>Aplicar</button>
        </div>
        <div className="seg sans">
          {(['ema9', 'ema21', 'vwap', 'vol'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={ind[k]} onClick={() => setInd((s) => ({ ...s, [k]: !s[k] }))}>
              {{ ema9: 'MME 9', ema21: 'MME 21', vwap: 'VWAP', vol: 'Volume' }[k]}
            </button>
          ))}
        </div>
      </div>
      {last ? (
        <div className="trade-chart-head">
          <b>{ticker}</b>
          <span>{last.close.toFixed(2)}</span>
          {changePct != null ? (
            <span className={changePct >= 0 ? 'up' : 'down'}>{changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%</span>
          ) : null}
        </div>
      ) : null}
      <div className="trade-chart-area">
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
        {loading && !bars.length ? <div className="trade-chart-empty">Carregando…</div> : null}
        {error ? <div className="trade-chart-empty">{error}</div> : null}
        {!loading && !error && !bars.length ? <div className="trade-chart-empty">Sem candles neste período.</div> : null}
      </div>
    </div>
  );
}
