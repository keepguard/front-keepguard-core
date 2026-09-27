import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { PATHS } from '../../navigation/routes';
import { useTradeSnapshot } from '../../hooks/useTradeSnapshot';
import type { TradeMarketState } from '../../services/tradeService';
import { TradeAssetCard } from './TradeAssetCard';
import { ageLabel } from './dossierFormat';

const PAGE_SIZE = 48;

const STATE_LABEL: Record<TradeMarketState, string> = {
  OPEN: 'Pregão aberto',
  CLOSED: 'Pregão fechado',
  NO_UPDATES: 'Sem atualização recente',
};

const STATE_HINT: Record<TradeMarketState, string> = {
  OPEN: '',
  CLOSED: 'Fora do horário de pregão. Você vê o último dado coletado.',
  NO_UPDATES: 'Dentro do horário, mas sem coleta recente (feriado ou coleta parada). Você vê o último dado coletado.',
};

/** Relógio que só serve para o "há X min" andar sem nova chamada à API. */
function useNowSeconds(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return Math.floor(now / 1000);
}

export function TradeView() {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const { data, loading, refreshing, error, refresh } = useTradeSnapshot(page, PAGE_SIZE);
  const nowSec = useNowSeconds();

  const items = useMemo(() => {
    const list = data?.items ?? [];
    const q = query.trim().toUpperCase();
    return q ? list.filter((it) => it.ticker.includes(q)) : list;
  }, [data, query]);

  if (loading && !data) {
    return (
      <div className="trade-grid" aria-busy="true" aria-label="Carregando cotações">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="trade-card trade-skeleton" />
        ))}
      </div>
    );
  }

  if (!data) {
    const blocked = error?.code === 'PRODUCT_RESTRICTED' || error?.code === 'PAYMENT_PENDING';
    return (
      <div className="trade-state" role="alert">
        <p>
          {blocked
            ? 'Seu plano atual não libera o Trade.'
            : error?.message ?? 'Não foi possível carregar as cotações.'}
        </p>
        {blocked ? (
          <Link to={PATHS.billing} className="btn btn-primary">Ver planos</Link>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={refresh}>Tentar de novo</button>
        )}
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

  const asOfAge = Math.max(0, nowSec - Math.floor(new Date(data.asOf).getTime() / 1000));
  const totalPages = Math.max(1, Math.ceil(data.total / data.size));
  const state = data.market.state;

  return (
    <div className="trade-view">
      <div className="trade-toolbar">
        <span className={`trade-chip is-${state.toLowerCase()}`}>{STATE_LABEL[state]}</span>
        <span className="trade-asof" aria-live="polite">Atualizado {ageLabel(asOfAge)}</span>
        <button
          type="button"
          className="btn-table-icon"
          onClick={refresh}
          disabled={refreshing}
          title="Atualizar agora"
          aria-label="Atualizar cotações"
        >
          <RefreshCw size={16} className={refreshing ? 'trade-spin' : undefined} />
        </button>
        <label className="trade-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar ticker"
            aria-label="Filtrar por ticker"
          />
        </label>
      </div>

      {STATE_HINT[state] ? <p className="trade-note" role="status">{STATE_HINT[state]}</p> : null}
      {error ? (
        <p className="trade-note is-warn" role="alert">
          Não foi possível atualizar agora; mostrando o último dado carregado.
        </p>
      ) : null}
      <p className="trade-note">
        Dados do coletor MetaTrader 5, atualizados a cada {Math.round(data.market.intervalSeconds / 60)} min
        (candle {data.market.timeframe} fechado). Não é cotação em tempo real. Análise, não recomendação de investimento.
      </p>
      {data.missing > 0 ? (
        <p className="trade-note">
          {data.missing} {data.missing === 1 ? 'ativo desta página ainda não tem' : 'ativos desta página ainda não têm'} cotação coletada.
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="trade-state"><p>Nenhum ativo corresponde a “{query}”.</p></div>
      ) : (
        <div className="trade-grid">
          {items.map((it) => (
            <TradeAssetCard
              key={it.ticker}
              item={it}
              ageSeconds={it.quote ? Math.max(0, nowSec - Math.floor(new Date(it.quote.collectedAt).getTime() / 1000)) : undefined}
            />
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <nav className="trade-pager" aria-label="Paginação">
          <button type="button" className="btn btn-secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            <ChevronLeft size={16} aria-hidden="true" /> Anterior
          </button>
          <span>Página {page} de {totalPages} · {data.total} ativos</span>
          <button type="button" className="btn btn-secondary" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Próxima <ChevronRight size={16} aria-hidden="true" />
          </button>
        </nav>
      ) : null}
    </div>
  );
}
