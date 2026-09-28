import { Link } from 'react-router-dom';
import { PATHS } from '../../navigation/routes';
import { useTradeSnapshot } from '../../hooks/useTradeSnapshot';
import { TradeCandleChart } from './TradeCandleChart';

/** Universo grande o bastante para cobrir o plano inteiro no seletor de ativo do Monitor. */
const MONITOR_SIZE = 100;

export function TradeMonitorView() {
  const { data, loading, error } = useTradeSnapshot(1, MONITOR_SIZE);

  if (loading && !data) {
    return <div className="trade-chart-card"><div className="trade-chart-area"><div className="trade-chart-empty">Carregando ativos…</div></div></div>;
  }

  if (!data) {
    const blocked = error?.code === 'PRODUCT_RESTRICTED' || error?.code === 'PAYMENT_PENDING';
    return (
      <div className="trade-state" role="alert">
        <p>{blocked ? 'Seu plano atual não libera o Trade.' : error?.message ?? 'Não foi possível carregar os ativos.'}</p>
        {blocked ? <Link to={PATHS.billing} className="btn btn-primary">Ver planos</Link> : null}
      </div>
    );
  }

  if (data.total === 0) {
    return (
      <div className="trade-state">
        <p>Você ainda não tem ativos no seu plano. Escolha os ativos que quer acompanhar no Mercado.</p>
        <Link to={PATHS.market} className="btn btn-primary">Escolher ativos</Link>
      </div>
    );
  }

  return <TradeCandleChart tickers={data.items.map((it) => it.ticker)} />;
}
