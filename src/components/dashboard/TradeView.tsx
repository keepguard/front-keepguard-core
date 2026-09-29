import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, RefreshCw, Search, X } from 'lucide-react';
import { PATHS } from '../../navigation/routes';
import { useTradeSnapshot } from '../../hooks/useTradeSnapshot';
import { getTradeOportunidades, type TradeMarketState, type TradeOpportunity } from '../../services/tradeService';
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

/** Espera parar de digitar antes de buscar no backend — evita 1 request por tecla. */
const SEARCH_DEBOUNCE_MS = 350;

export function TradeView() {
  const [page, setPage] = useState(1);
  // `query` é o que está no campo (rascunho); `debouncedQuery` é o que efetivamente
  // filtra no backend, 350ms depois de parar de digitar.
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim().toUpperCase()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query]);

  // Filtro novo (ou limpo) invalida a página atual — sem isso, filtrar um ticker
  // estando na página 3 buscaria a página 3 do resultado filtrado, não a 1ª.
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery]);

  const { data, loading, refreshing, error, refresh } = useTradeSnapshot(page, PAGE_SIZE, debouncedQuery || undefined);
  const nowSec = useNowSeconds();

  const items = data?.items ?? [];
  const limparFiltro = () => setQuery('');

  // Selo de oportunidade: 1 chamada em lote pros tickers da página atual, não 1 por card.
  // Falha aqui não derruba a grade — o card só fica sem selo (mesmo espírito de "stale").
  const [opportunities, setOpportunities] = useState<Record<string, TradeOpportunity>>({});
  const tickersKey = items.map((it) => it.ticker).join(',');
  useEffect(() => {
    if (!tickersKey) {
      setOpportunities({});
      return;
    }
    const controller = new AbortController();
    getTradeOportunidades(tickersKey.split(','), undefined, controller.signal)
      .then(setOpportunities)
      .catch(() => setOpportunities({}));
    return () => controller.abort();
  }, [tickersKey]);

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
    // total já vem filtrado pelo backend — 0 aqui pode ser "plano vazio" (sem query)
    // ou "filtro não achou nada" (com query), e as duas mensagens são bem diferentes.
    if (debouncedQuery) {
      return (
        <div className="trade-state">
          <p>Nenhum ativo corresponde a “{debouncedQuery}”.</p>
          <button type="button" className="btn btn-secondary" onClick={limparFiltro}>Limpar filtro</button>
        </div>
      );
    }
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
          {query ? (
            <button type="button" className="trade-search-clear" onClick={limparFiltro} aria-label="Limpar filtro">
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </label>
      </div>

      {STATE_HINT[state] ? <p className="trade-note" role="status">{STATE_HINT[state]}</p> : null}
      {error ? (
        <p className="trade-note is-warn" role="alert">
          Não foi possível atualizar agora; mostrando o último dado carregado.
        </p>
      ) : null}
      {data.missing > 0 ? (
        <p className="trade-note">
          {data.missing} {data.missing === 1 ? 'ativo desta página ainda não tem' : 'ativos desta página ainda não têm'} cotação coletada.
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="trade-state"><p>Nenhum ativo corresponde a “{debouncedQuery}”.</p></div>
      ) : (
        <div className="trade-grid">
          {items.map((it) => (
            <TradeAssetCard
              key={it.ticker}
              item={it}
              ageSeconds={it.quote ? Math.max(0, nowSec - Math.floor(new Date(it.quote.collectedAt).getTime() / 1000)) : undefined}
              opportunity={opportunities[it.ticker]}
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
