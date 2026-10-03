import { useMemo, useState } from 'react';
import { Link2, Pencil, RefreshCw, Search, Trash2, Wallet, X } from 'lucide-react';
import { useMt5Account } from '../../hooks/useMt5Account';
import { Mt5AccountFormModal } from './Mt5AccountFormModal';
import type { Mt5Deal, Mt5Order, Mt5Position } from '../../services/mt5AccountService';

function formatMoney(v: number | undefined | null, currency = 'BRL'): string {
  if (typeof v !== 'number' || Number.isNaN(v)) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency });
}

function sideLabel(type: number | undefined): string {
  // ORDER_TYPE_BUY=0 / ORDER_TYPE_SELL=1 (e variações pendentes acima disso) — ver skill mt5-api.
  if (typeof type !== 'number') return '—';
  return type % 2 === 0 ? 'Compra' : 'Venda';
}

export function Mt5AccountView() {
  const { account, hasAccount, info, positions, orders, deals, loading, refreshing, error, liveError, refresh, save, remove } =
    useMt5Account();
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    if (!window.confirm('Remover o vínculo com esta conta MT5? Você deixará de ver saldo, posições e ordens até cadastrar de novo.')) {
      return;
    }
    setRemoving(true);
    try {
      await remove();
    } finally {
      setRemoving(false);
    }
  };

  if (loading && !account && hasAccount) {
    return (
      <div className="mt5-account-view" aria-busy="true" aria-label="Carregando dados da corretora">
        <div className="hpanel-table-card desktop-table-view">
          <div className="portfolio-skeleton" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="trade-state" role="alert">
        <p>{error.message}</p>
        <button type="button" className="btn btn-secondary" onClick={refresh}>Tentar de novo</button>
      </div>
    );
  }

  if (!loading && !hasAccount) {
    return (
      <div className="mt5-account-view">
        <div className="portfolio-empty-state" style={{ padding: '3rem 1.5rem' }}>
          <Link2 size={22} />
          <span>Você ainda não vinculou sua conta na corretora. Cadastre o ambiente e a URL do gateway para ver saldo, posições e ordens aqui.</span>
          <button type="button" className="btn" style={{ marginTop: '1rem' }} onClick={() => setFormOpen(true)}>
            Vincular conta
          </button>
        </div>
        <Mt5AccountFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} account={null} onSave={save} />
      </div>
    );
  }

  return (
    <div className="mt5-account-view">
      <div className="table-toolbar">
        <div className="portfolio-add-group">
          <span className="portfolio-add-label">
            Ambiente: <strong>{account?.ambiente === 'real' ? 'Real' : 'Demo'}</strong> · {account?.gatewayUrl}
          </span>
        </div>
        <div className="table-toolbar-push-end portfolio-toolbar-actions">
          <button
            type="button"
            className="btn-table-icon"
            onClick={() => setFormOpen(true)}
            title="Editar vínculo"
            aria-label="Editar vínculo da conta MT5"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            className="btn-table-icon"
            onClick={handleRemove}
            disabled={removing}
            title="Remover vínculo"
            aria-label="Remover vínculo da conta MT5"
          >
            <Trash2 size={15} />
          </button>
          <button
            type="button"
            className="btn-table-icon"
            onClick={refresh}
            disabled={refreshing}
            title="Atualizar"
            aria-label="Atualizar dados da conta MT5"
          >
            <RefreshCw size={15} className={refreshing ? 'spin' : undefined} />
          </button>
        </div>
      </div>

      {liveError ? (
        <p className="trade-note is-warn" role="alert">
          Vínculo cadastrado, mas não foi possível ler os dados do terminal agora ({liveError.message}).
        </p>
      ) : null}

      {info ? (
        <div className="portfolio-summary-row">
          <div className="portfolio-summary-card">
            <span className="table-cell-muted">Saldo</span>
            <strong>{formatMoney(info.balance, info.currency || 'BRL')}</strong>
          </div>
          <div className="portfolio-summary-card">
            <span className="table-cell-muted">Patrimônio (equity)</span>
            <strong>{formatMoney(info.equity, info.currency || 'BRL')}</strong>
          </div>
          <div className="portfolio-summary-card">
            <span className="table-cell-muted">Resultado aberto</span>
            <strong className={info.profit >= 0 ? 'portfolio-pl-positive' : 'portfolio-pl-negative'}>
              {formatMoney(info.profit, info.currency || 'BRL')}
            </strong>
          </div>
          <div className="portfolio-summary-card">
            <span className="table-cell-muted">Corretora</span>
            <strong>{info.company || info.server || '—'}</strong>
          </div>
        </div>
      ) : null}

      <PositionsTable positions={positions} />
      <OrdersTable orders={orders} />
      <DealsTable deals={deals} />

      <Mt5AccountFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} account={account} onSave={save} />
    </div>
  );
}

/** Toolbar de filtro por ticker, reaproveitado nas 3 tabelas — mesmo padrão
 * visual/semântico do filtro em TradeDayView (search-input-wrapper). */
function TableFilterToolbar({
  title,
  query,
  onQueryChange,
  placeholder,
  count,
}: {
  title: string;
  query: string;
  onQueryChange: (v: string) => void;
  placeholder: string;
  count: number;
}) {
  return (
    <div className="mt5-table-header">
      <h3 className="market-section-title">{title}</h3>
      <div className="search-input-wrapper mt5-table-search">
        <Search size={14} className="search-icon" />
        <input
          type="search"
          className="search-input"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        {query ? (
          <button type="button" className="trade-search-clear" onClick={() => onQueryChange('')} aria-label="Limpar filtro">
            <X size={14} />
          </button>
        ) : null}
      </div>
      {count > 0 ? <span className="mt5-table-count">{count}</span> : null}
    </div>
  );
}

function PositionsTable({ positions }: { positions: Mt5Position[] }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const term = query.trim().toUpperCase();
    if (!term) return positions;
    return positions.filter((p) => p.symbol?.toUpperCase().includes(term));
  }, [positions, query]);

  return (
    <>
      <div className="hpanel-table-card desktop-table-view">
        <TableFilterToolbar
          title="Posições abertas"
          query={query}
          onQueryChange={setQuery}
          placeholder="Filtrar por ativo"
          count={positions.length}
        />
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Ativo</th>
              <th>Lado</th>
              <th>Volume</th>
              <th>Preço de abertura</th>
              <th>Preço atual</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem' }}>
                  <div className="portfolio-empty-state">
                    <Wallet size={22} />
                    <span>Nenhuma posição aberta.</span>
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem' }}>
                  Nenhum ativo corresponde a "{query}".
                </td>
              </tr>
            ) : (
              filtered.map((p, i) => (
                <tr key={`${p.symbol}-${i}`}>
                  <td>
                    <div className="table-cell-title">
                      <strong>{p.symbol}</strong>
                    </div>
                  </td>
                  <td>{sideLabel(p.type)}</td>
                  <td>{p.volume}</td>
                  <td>{formatMoney(p.priceOpen)}</td>
                  <td>{formatMoney(p.priceCurrent)}</td>
                  <td>
                    <span className={p.profit >= 0 ? 'portfolio-pl-positive' : 'portfolio-pl-negative'}>
                      {formatMoney(p.profit)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards-container">
        {positions.length === 0 ? (
          <div className="mobile-loading-card">Nenhuma posição aberta.</div>
        ) : filtered.length === 0 ? (
          <div className="mobile-loading-card">Nenhum ativo corresponde a "{query}".</div>
        ) : (
          filtered.map((p, i) => (
            <div key={`${p.symbol}-${i}`} className="mobile-domain-card">
              <div className="mobile-card-top">
                <div className="mobile-card-identity">
                  <Wallet size={15} />
                  <span className="mobile-domain-name">{p.symbol}</span>
                </div>
              </div>
              <div className="mobile-card-subinfo">
                {sideLabel(p.type)} · {p.volume} un.
              </div>
              <div className="mobile-card-meta">
                <span>Abertura: {formatMoney(p.priceOpen)}</span>
                <span>Atual: {formatMoney(p.priceCurrent)}</span>
                <span className={p.profit >= 0 ? 'portfolio-pl-positive' : 'portfolio-pl-negative'}>
                  Resultado: {formatMoney(p.profit)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function OrdersTable({ orders }: { orders: Mt5Order[] }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const term = query.trim().toUpperCase();
    if (!term) return orders;
    return orders.filter((o) => o.symbol?.toUpperCase().includes(term));
  }, [orders, query]);

  return (
    <>
      <div className="hpanel-table-card desktop-table-view">
        <TableFilterToolbar
          title="Ordens pendentes"
          query={query}
          onQueryChange={setQuery}
          placeholder="Filtrar por ativo"
          count={orders.length}
        />
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Ativo</th>
              <th>Lado</th>
              <th>Volume</th>
              <th>Preço</th>
              <th>Stop</th>
              <th>Alvo</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem' }}>
                  Nenhuma ordem pendente.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem' }}>
                  Nenhum ativo corresponde a "{query}".
                </td>
              </tr>
            ) : (
              filtered.map((o, i) => (
                <tr key={`${o.symbol}-${i}`}>
                  <td>
                    <div className="table-cell-title">
                      <strong>{o.symbol}</strong>
                    </div>
                  </td>
                  <td>{sideLabel(o.type)}</td>
                  <td>{o.volume}</td>
                  <td>{formatMoney(o.priceOpen)}</td>
                  <td>{o.sl ? formatMoney(o.sl) : '—'}</td>
                  <td>{o.tp ? formatMoney(o.tp) : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards-container">
        {orders.length === 0 ? (
          <div className="mobile-loading-card">Nenhuma ordem pendente.</div>
        ) : filtered.length === 0 ? (
          <div className="mobile-loading-card">Nenhum ativo corresponde a "{query}".</div>
        ) : (
          filtered.map((o, i) => (
            <div key={`${o.symbol}-${i}`} className="mobile-domain-card">
              <div className="mobile-card-top">
                <div className="mobile-card-identity">
                  <span className="mobile-domain-name">{o.symbol}</span>
                </div>
              </div>
              <div className="mobile-card-subinfo">
                {sideLabel(o.type)} · {o.volume} un. · {formatMoney(o.priceOpen)}
              </div>
              <div className="mobile-card-meta">
                <span>Stop: {o.sl ? formatMoney(o.sl) : '—'}</span>
                <span>Alvo: {o.tp ? formatMoney(o.tp) : '—'}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function DealsTable({ deals }: { deals: Mt5Deal[] }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const term = query.trim().toUpperCase();
    if (!term) return deals;
    return deals.filter((d) => d.symbol?.toUpperCase().includes(term));
  }, [deals, query]);

  return (
    <>
      <div className="hpanel-table-card desktop-table-view">
        <TableFilterToolbar
          title="Histórico recente"
          query={query}
          onQueryChange={setQuery}
          placeholder="Filtrar por ativo"
          count={deals.length}
        />
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Ativo</th>
              <th>Lado</th>
              <th>Volume</th>
              <th>Preço</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {deals.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem' }}>
                  Nenhuma operação no período.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem' }}>
                  Nenhum ativo corresponde a "{query}".
                </td>
              </tr>
            ) : (
              filtered.map((d, i) => (
                <tr key={`${d.symbol}-${i}`}>
                  <td>{new Date(d.time).toLocaleString('pt-BR')}</td>
                  <td>
                    <div className="table-cell-title">
                      <strong>{d.symbol}</strong>
                    </div>
                  </td>
                  <td>{sideLabel(d.type)}</td>
                  <td>{d.volume}</td>
                  <td>{formatMoney(d.price)}</td>
                  <td>
                    <span className={d.profit >= 0 ? 'portfolio-pl-positive' : 'portfolio-pl-negative'}>
                      {formatMoney(d.profit)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards-container">
        {deals.length === 0 ? (
          <div className="mobile-loading-card">Nenhuma operação no período.</div>
        ) : filtered.length === 0 ? (
          <div className="mobile-loading-card">Nenhum ativo corresponde a "{query}".</div>
        ) : (
          filtered.map((d, i) => (
            <div key={`${d.symbol}-${i}`} className="mobile-domain-card">
              <div className="mobile-card-top">
                <div className="mobile-card-identity">
                  <span className="mobile-domain-name">{d.symbol}</span>
                </div>
              </div>
              <div className="mobile-card-subinfo">
                {new Date(d.time).toLocaleString('pt-BR')} · {sideLabel(d.type)} · {d.volume} un.
              </div>
              <div className="mobile-card-meta">
                <span>Preço: {formatMoney(d.price)}</span>
                <span className={d.profit >= 0 ? 'portfolio-pl-positive' : 'portfolio-pl-negative'}>
                  Resultado: {formatMoney(d.profit)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
