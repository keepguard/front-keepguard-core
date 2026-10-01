import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CrosshairMode, LineStyle, type IChartApi, type ISeriesApi, type SeriesMarker, type Time } from 'lightweight-charts';
import { Link } from 'react-router-dom';
import { PATHS } from '../../navigation/routes';
import { useTradeSnapshot } from '../../hooks/useTradeSnapshot';
import { getTradeCandleHistory, getTradeSnapshot, getTurtleSoupHistorico, type TurtleSoupSinalHistorico } from '../../services/tradeService';
import { TickerCombobox } from '../common/TickerCombobox';
import { RefreshCombo } from '../common/RefreshCombo';

/** Universo do seletor de ativo — mesmo teto do Monitor (cobre o plano inteiro). */
const MONITOR_SIZE = 100;
const HISTORY_LIMIT = 1000; // ~4 anos em D1, mesma janela usada pra validar o setup

const tok = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// lightweight-charts rotula o eixo em UTC -- desloca só o valor exibido, mesmo truque do
// TradeCandleChart.tsx, senão o eixo fica 3h adiantado (fuso do Brasil).
function toChartTime(epochSeconds: number): number {
  return epochSeconds - new Date(epochSeconds * 1000).getTimezoneOffset() * 60;
}

const nfPx = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPx = (v: number) => nfPx.format(v);
const nfPct = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const nfR = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });

function fmtData(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

const MOTIVO_LABEL: Record<string, string> = {
  stop: 'Stop',
  trailing: 'Trailing',
  teto_backtest: 'Prazo',
};

export function SetupsView() {
  const { data: snapshot, loading: loadingTickers } = useTradeSnapshot(1, MONITOR_SIZE);
  const tickers = useMemo(() => snapshot?.items.map((it) => it.ticker) ?? [], [snapshot]);

  const [ticker, setTicker] = useState<string>('');
  useEffect(() => {
    if (!ticker && tickers.length > 0) setTicker(tickers[0]);
  }, [ticker, tickers]);

  const fetchTickerSuggestions = useCallback(
    (query: string, signal: AbortSignal) =>
      getTradeSnapshot(1, 8, query, signal).then((res) => res.items.map((it) => it.ticker)),
    [],
  );

  const [sinais, setSinais] = useState<TurtleSoupSinalHistorico[]>([]);
  const [candles, setCandles] = useState<Awaited<ReturnType<typeof getTradeCandleHistory>>['candles']>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // `refreshNonce` entra nas deps só para o RefreshCombo poder forçar um novo fetch do mesmo
  // ticker (manual ou automático), sem que o valor em si seja lido dentro do efeito.
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!ticker) return;
    const controller = new AbortController();
    const isManualRefresh = refreshNonce > 0;
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setErro(null);
    Promise.all([
      getTurtleSoupHistorico(ticker, controller.signal),
      getTradeCandleHistory(ticker, { timeframe: 'D1', limit: HISTORY_LIMIT }, controller.signal),
    ])
      .then(([hist, hst]) => {
        setSinais(hist.sinais);
        setCandles(hst.candles);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setErro(err?.message ?? 'Não foi possível carregar o histórico.');
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => controller.abort();
  }, [ticker, refreshNonce]);

  const stats = useMemo(() => {
    const resolvidos = sinais.filter((s) => s.resolvido);
    const ganhos = resolvidos.filter((s) => s.rMultiplo > 0).length;
    const somaR = resolvidos.reduce((acc, s) => acc + s.rMultiplo, 0);
    return {
      total: sinais.length,
      acerto: resolvidos.length > 0 ? (100 * ganhos) / resolvidos.length : null,
      rMedio: resolvidos.length > 0 ? somaR / resolvidos.length : null,
    };
  }, [sinais]);

  const aberta = sinais.find((s) => !s.resolvido);

  // Callback ref (não useRef+useEffect([])) de propósito: os early returns abaixo (loading,
  // sem tickers) fazem essa <div> só existir na árvore depois de alguns renders -- um efeito
  // com deps [] rodaria antes disso e nunca criaria o gráfico (achado em produção: tela
  // sempre em branco, mesmo com dado chegando). Callback ref roda de novo toda vez que o nó
  // muda (inclusive de null pra montado), então o gráfico é criado assim que a div existir.
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const containerRef = useCallback((node: HTMLDivElement | null) => setContainerEl(node), []);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    if (!containerEl) return;
    const chart = createChart(containerEl, {
      autoSize: true,
      layout: { fontFamily: 'JetBrains Mono, monospace', fontSize: 11, attributionLogo: false },
      rightPriceScale: { scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { timeVisible: false, rightOffset: 6, barSpacing: 6, minBarSpacing: 0.3 },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { locale: 'pt-BR' },
    });
    const candle = chart.addCandlestickSeries({ priceFormat: { type: 'price', precision: 2, minMove: 0.01 } });
    chartRef.current = chart;
    seriesRef.current = candle;

    const applyTheme = () => {
      const up = tok('--success') || '#0C9A6A';
      const down = tok('--danger') || '#D9434A';
      chart.applyOptions({
        layout: { background: { color: tok('--bg-card') }, textColor: tok('--text-muted') },
        grid: { vertLines: { color: tok('--border-subtle') }, horzLines: { color: tok('--border-subtle') } },
        rightPriceScale: { borderColor: tok('--border') },
        timeScale: { borderColor: tok('--border') },
      });
      candle.applyOptions({ upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down });
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
  }, [containerEl]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    if (candles.length === 0) {
      series.setData([]);
      series.setMarkers([]);
      return;
    }
    series.setData(
      candles.map((c) => ({
        time: toChartTime(Math.floor(new Date(c.ts).getTime() / 1000)) as Time,
        open: c.open, high: c.high, low: c.low, close: c.close,
      })),
    );

    const markers: SeriesMarker<Time>[] = sinais.map((s) => {
      const compra = s.direcao === 'compra';
      const ganhou = s.resolvido && s.rMultiplo > 0;
      const cor = !s.resolvido ? (tok('--primary') || '#673DE6') : ganhou ? (tok('--success-hover') || '#00967A') : (tok('--danger') || '#EB1E3A');
      const texto = !s.resolvido ? `${compra ? 'Compra' : 'Venda'} · aberta` : `${compra ? 'Compra' : 'Venda'} · ${nfR.format(s.rMultiplo)}R`;
      return {
        time: toChartTime(Math.floor(new Date(s.dataEntrada).getTime() / 1000)) as Time,
        position: compra ? 'belowBar' : 'aboveBar',
        color: cor,
        shape: compra ? 'arrowUp' : 'arrowDown',
        text: texto,
      };
    });
    series.setMarkers(markers);

    // Entrada/stop da posição em aberto (se houver) como linhas de referência.
    const linhas: ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>[] = [];
    if (aberta) {
      linhas.push(
        series.createPriceLine({ price: aberta.entrada, color: tok('--text-muted'), lineWidth: 2, lineStyle: LineStyle.Dashed, title: 'Entrada' }),
        series.createPriceLine({ price: aberta.stop, color: tok('--danger'), lineWidth: 2, lineStyle: LineStyle.Dashed, title: 'Stop atual' }),
      );
    }

    chart.timeScale().fitContent();
    return () => {
      linhas.forEach((l) => series.removePriceLine(l));
    };
  }, [candles, sinais, aberta]);

  if (loadingTickers && tickers.length === 0) {
    return <div className="trade-state"><p>Carregando ativos…</p></div>;
  }
  if (tickers.length === 0) {
    return (
      <div className="trade-state">
        <p>Você ainda não tem ativos no seu plano. Escolha os ativos que quer acompanhar no Mercado.</p>
        <Link to={PATHS.market} className="btn btn-primary">Escolher ativos</Link>
      </div>
    );
  }

  return (
    <div className="tchart setups-view">
      <section className="tchart-toolbar" aria-label="Resumo e controles do setup">
        <div className="tchart-fav-search">
          <TickerCombobox
            onSelect={setTicker}
            fetchSuggestions={fetchTickerSuggestions}
            placeholder="Buscar ativo do seu plano…"
            aria-label="Buscar ativo do Trade"
          />
        </div>
        <div className="tchart-ticker-row">
          <span className="tchart-px" id="setups-ticker">{ticker || '—'}</span>
        </div>

        <div className="tchart-toolbar-row">
          <div className="tchart-group">
            <span>Setup</span>
            <select className="tchart-toolbar-select" disabled value="turtle_soup">
              <option value="turtle_soup">Turtle Soup (produção)</option>
            </select>
          </div>
          <div className="tchart-group">
            <span>Timeframe</span>
            <select className="tchart-toolbar-select" disabled value="D1">
              <option value="D1">D1</option>
            </select>
          </div>
          <div className="tchart-group">
            <span>&nbsp;</span>
            <RefreshCombo onRefresh={() => setRefreshNonce((n) => n + 1)} disabled={loading} refreshing={refreshing} />
          </div>
          <div className="setups-stats">
            <div className="setups-stat"><b>{stats.total}</b><span>Sinais</span></div>
            <div className="setups-stat">
              <b style={{ color: stats.acerto != null && stats.acerto >= 50 ? 'var(--success-hover)' : 'var(--text-main)' }}>
                {stats.acerto != null ? `${nfPct.format(stats.acerto)}%` : '—'}
              </b>
              <span>Acerto</span>
            </div>
            <div className="setups-stat">
              <b style={{ color: stats.rMedio != null && stats.rMedio > 0 ? 'var(--success-hover)' : 'var(--danger)' }}>
                {stats.rMedio != null ? nfR.format(stats.rMedio) : '—'}
              </b>
              <span>R médio</span>
            </div>
          </div>
        </div>
      </section>

      {erro ? <p className="trade-note is-warn" role="alert">{erro}</p> : null}
      {aberta ? (
        <p className="trade-note">
          Posição em aberto desde {fmtData(aberta.dataEntrada)}: {aberta.direcao === 'compra' ? 'compra' : 'venda'} a {fmtPx(aberta.entrada)}, stop atual {fmtPx(aberta.stop)}.
        </p>
      ) : null}

      <div className="setups-chart-card">
        <div ref={containerRef} className="setups-chart" aria-busy={loading} />
      </div>

      {sinais.length === 0 && !loading ? (
        <p className="trade-card-empty">Nenhum sinal de Turtle Soup no histórico disponível deste ativo.</p>
      ) : (
        <table className="setups-table">
          <thead>
            <tr><th>Data</th><th>Direção</th><th>Entrada</th><th>Stop</th><th>Resultado</th></tr>
          </thead>
          <tbody>
            {[...sinais].reverse().map((s, i) => (
              <tr key={i}>
                <td>{fmtData(s.dataEntrada)}</td>
                <td>{s.direcao === 'compra' ? 'Compra' : 'Venda'}</td>
                <td>{fmtPx(s.entrada)}</td>
                <td>{fmtPx(s.stop)}</td>
                <td>
                  {!s.resolvido ? (
                    <span className="setups-res is-open">Em aberto</span>
                  ) : s.rMultiplo > 0 ? (
                    <span className="setups-res is-win">{MOTIVO_LABEL[s.motivoSaida ?? ''] ?? s.motivoSaida} · {nfR.format(s.rMultiplo)}R</span>
                  ) : (
                    <span className="setups-res is-loss">{MOTIVO_LABEL[s.motivoSaida ?? ''] ?? s.motivoSaida} · {nfR.format(s.rMultiplo)}R</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
