import { useCallback, useEffect, useRef, useState } from 'react';
import { History, Search } from 'lucide-react';
import {
  getHistory,
  toAgentError,
  type AgentApiError,
  type AgentConta,
  type HistoryItem,
  type Paged,
} from '../../../services/agentOrdersService';
import { FamiliaBadge } from './AgentBadges';
import { TIPO_LABEL, dateTime, money, ordemResumo, qty } from './agentFormat';

const PAGE_SIZE = 20;

const STATUS_TEXT: Record<string, string> = {
  AGENDADA: 'Agendada',
  EXECUTADA: 'Executada',
  PARCIAL: 'Parcial',
  REJEITADA: 'Rejeitada',
  FALHOU: 'Falhou',
  INCERTO: 'Incerto',
  NAO_ENVIADA: 'Não enviada',
  CONFIRMANDO: 'Em processamento',
};

function execResumo(item: HistoryItem): string {
  if (!item.execucoes || item.execucoes.length === 0) return '—';
  return item.execucoes
    .map((x) => `${qty(x.volumeExecutado)}/${qty(x.volumePedido)}${x.precoMedio != null ? ` a ${money(x.precoMedio)}` : ''}`)
    .join(' · ');
}

/** Decisões e execuções gravadas no Postgres (GET /history), com filtro por dia e ativo. */
export function AgentHistory({ conta, reloadKey }: { conta: AgentConta; reloadKey: number }) {
  const [day, setDay] = useState('');
  const [ticker, setTicker] = useState('');
  const [applied, setApplied] = useState<{ day: string; ticker: string }>({ day: '', ticker: '' });
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Paged<HistoryItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AgentApiError | null>(null);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setLoading(true);
    getHistory(
      { conta, desde: applied.day || undefined, ate: applied.day || undefined, ticker: applied.ticker || undefined, limit: PAGE_SIZE, offset },
      ctrl.signal,
    )
      .then((resp) => {
        if (ctrl.signal.aborted) return;
        setData(resp);
        setError(null);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setError(toAgentError(err));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
  }, [conta, applied, offset]);

  useEffect(() => {
    load();
    return () => controller.current?.abort();
  }, [load, reloadKey]);

  useEffect(() => setOffset(0), [conta]);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    setApplied({ day, ticker: ticker.trim().toUpperCase() });
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasFilter = Boolean(applied.day || applied.ticker);

  return (
    <section className="ao-history" aria-labelledby="ao-history-title">
      <div className="mt5-table-header ao-history-header">
        <h3 className="market-section-title" id="ao-history-title">
          <History size={16} aria-hidden="true" /> Histórico
        </h3>
        <form className="ao-history-filters" onSubmit={apply} role="search" aria-label="Filtrar histórico">
          <label className="mt5-global-search-date">
            <span className="table-cell-muted">Dia</span>
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Dia da decisão" />
          </label>
          <div className="search-input-wrapper mt5-table-search">
            <Search size={14} className="search-icon" aria-hidden="true" />
            <input
              type="search"
              className="search-input"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="Ativo (ex.: PETR4)"
              aria-label="Filtrar histórico por ativo"
            />
          </div>
          <button type="submit" className="btn btn-secondary btn-sm">Filtrar</button>
          {hasFilter ? (
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setDay('');
                setTicker('');
                setOffset(0);
                setApplied({ day: '', ticker: '' });
              }}
            >
              Limpar
            </button>
          ) : null}
        </form>
      </div>

      {error ? (
        <div className="trade-state" role="alert">
          <p>{error.message}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={load}>Tentar de novo</button>
        </div>
      ) : loading && !data ? (
        <div className="hpanel-table-card" aria-busy="true" aria-label="Carregando histórico"><div className="portfolio-skeleton" /></div>
      ) : items.length === 0 ? (
        <div className="trade-state">
          <p>{hasFilter ? 'Nenhuma decisão com esses filtros.' : 'Nenhuma decisão ainda. Confirmações e cancelamentos aparecem aqui.'}</p>
        </div>
      ) : (
        <>
          <div className="hpanel-table-card desktop-table-view ao-table-card" aria-busy={loading}>
            <table className="hpanel-table ao-table">
              <caption className="sr-only">Histórico de decisões e execuções</caption>
              <thead>
                <tr>
                  <th scope="col">Quando</th>
                  <th scope="col">Ativo</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Ordem</th>
                  <th scope="col">Decisão</th>
                  <th scope="col">Execução</th>
                  <th scope="col">Por</th>
                </tr>
              </thead>
              <tbody>
                {items.map((h) => (
                  <tr key={`${h.proposalId}-${h.decididoEm}`}>
                    <td>{dateTime(h.decididoEm)}</td>
                    <td><strong>{h.ticker}</strong></td>
                    <td>
                      <FamiliaBadge familia={h.familia} />
                      <span className="ao-tipo">{TIPO_LABEL[h.tipo] ?? h.tipo}</span>
                    </td>
                    <td className="ao-motivo">{h.snapshot?.ordem ? ordemResumo(h.snapshot.ordem) : '—'}</td>
                    <td>
                      <span className={`ao-decisao is-${h.decisao === 'CONFIRMADA' ? 'ok' : 'cancel'}`}>
                        {h.decisao === 'CONFIRMADA' ? 'Confirmada' : 'Cancelada'}
                      </span>
                      {h.motivoCancelamento ? <span className="ao-motivo-sub">{h.motivoCancelamento}</span> : null}
                    </td>
                    <td>
                      {h.status ? <strong>{STATUS_TEXT[h.status] ?? h.status}</strong> : <span className="table-cell-muted">—</span>}
                      {h.execucoes?.length ? <span className="ao-motivo-sub">{execResumo(h)}</span> : null}
                    </td>
                    <td className="table-cell-muted">{h.decididoPor} · cfg v{h.settingsVersion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mobile-cards-container ao-cards" aria-label="Histórico de decisões">
            {items.map((h) => (
              <li key={`${h.proposalId}-${h.decididoEm}`} className="mobile-domain-card">
                <div className="mobile-card-top">
                  <div className="mobile-card-identity">
                    <FamiliaBadge familia={h.familia} />
                    <span className="mobile-domain-name">{h.ticker}</span>
                  </div>
                  <span className={`ao-decisao is-${h.decisao === 'CONFIRMADA' ? 'ok' : 'cancel'}`}>
                    {h.decisao === 'CONFIRMADA' ? 'Confirmada' : 'Cancelada'}
                  </span>
                </div>
                <div className="mobile-card-subinfo">{TIPO_LABEL[h.tipo] ?? h.tipo} · {dateTime(h.decididoEm)}</div>
                <div className="mobile-card-meta">
                  {h.status ? <span>{STATUS_TEXT[h.status] ?? h.status}</span> : null}
                  {h.execucoes?.length ? <span>{execResumo(h)}</span> : null}
                  {h.motivoCancelamento ? <span>{h.motivoCancelamento}</span> : null}
                </div>
              </li>
            ))}
          </ul>

          {total > PAGE_SIZE ? (
            <nav className="ao-pager" aria-label="Paginação do histórico">
              <button type="button" className="btn btn-secondary btn-sm" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                Anterior
              </button>
              <span className="table-cell-muted">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} de {total}
              </span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={offset + PAGE_SIZE >= total || loading} onClick={() => setOffset(offset + PAGE_SIZE)}>
                Próxima
              </button>
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}
