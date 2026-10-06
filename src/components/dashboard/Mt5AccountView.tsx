import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Link2, Pencil, RefreshCw, Search, Trash2, Wallet, X } from 'lucide-react';
import { useMt5Account } from '../../hooks/useMt5Account';
import { Mt5AccountFormModal } from './Mt5AccountFormModal';
import type { Mt5Deal, Mt5Order, Mt5Position } from '../../services/mt5AccountService';
import { aggregatePositions, custodyBreakdown, type CustodyPosition } from '../../utils/mt5Custody';

function formatMoney(v: number | undefined | null, currency = 'BRL'): string {
  if (typeof v !== 'number' || Number.isNaN(v)) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency });
}

function sideLabel(type: number | undefined): string {
  // ORDER_TYPE_BUY=0 / ORDER_TYPE_SELL=1 (e variações pendentes acima disso) — ver skill mt5-api.
  if (typeof type !== 'number') return '—';
  return type % 2 === 0 ? 'Compra' : 'Venda';
}

type SortDirection = 'asc' | 'desc';
interface SortState<K extends string> {
  column: K | null;
  direction: SortDirection;
}

/** Ordenação client-side de 1 coluna por vez — alterna asc/desc/sem-ordenação
 * ao clicar no mesmo cabeçalho de novo; trocar de coluna sempre começa em asc. */
function useColumnSort<T, K extends string>(
  rows: T[],
  getValue: (row: T, column: K) => string | number,
) {
  const [sort, setSort] = useState<SortState<K>>({ column: null, direction: 'asc' });

  const toggleSort = (column: K) => {
    setSort((prev) => {
      if (prev.column !== column) return { column, direction: 'asc' };
      if (prev.direction === 'asc') return { column, direction: 'desc' };
      return { column: null, direction: 'asc' }; // 3º clique: remove a ordenação
    });
  };

  const sorted = useMemo(() => {
    if (!sort.column) return rows;
    const { column, direction } = sort;
    const factor = direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = getValue(a, column);
      const vb = getValue(b, column);
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb), 'pt-BR') * factor;
      }
      return (va - vb) * factor;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort.column, sort.direction]);

  return { sorted, sort, toggleSort };
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ArrowUpDown size={12} className="mt5-sort-icon is-inactive" />;
  return direction === 'asc' ? <ArrowUp size={12} className="mt5-sort-icon" /> : <ArrowDown size={12} className="mt5-sort-icon" />;
}

/** <th> clicável com seta de ordenação — mesmo padrão nas 3 tabelas. */
function SortableHeader<K extends string>({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: K;
  sort: SortState<K>;
  onSort: (column: K) => void;
}) {
  const active = sort.column === column;
  return (
    <th>
      <button type="button" className="mt5-sort-button" onClick={() => onSort(column)} aria-label={`Ordenar por ${label}`}>
        {label}
        <SortIcon active={active} direction={sort.direction} />
      </button>
    </th>
  );
}

export function Mt5AccountView() {
  const {
    account,
    hasAccount,
    info,
    positions,
    orders,
    deals,
    loading,
    refreshing,
    positionsLoading,
    ordersLoading,
    dealsLoading,
    error,
    liveError,
    lastOkAt,
    searchSymbol,
    searchDate,
    setSearchSymbol,
    setSearchDate,
    applySearch,
    refresh,
    refreshPositions,
    refreshOrders,
    refreshDeals,
    save,
    remove,
  } = useMt5Account();
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
      <div className="mt5-account-view" aria-busy="true" aria-label="Carregando a carteira">
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
          <span>Vincule sua corretora (MetaTrader 5) para ver aqui saldo, posições, ordens e histórico em tempo real.</span>
          <button type="button" className="btn" style={{ marginTop: '1rem' }} onClick={() => setFormOpen(true)}>
            Vincular corretora
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
            Corretora vinculada: <strong>{info?.company || info?.server || account?.gatewayUrl}</strong>
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
          Corretora indisponível no momento ({liveError.message}).
          {lastOkAt ? ` Última leitura com sucesso às ${new Date(lastOkAt).toLocaleTimeString('pt-BR')}.` : ''}
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

      <GlobalSearchBar
        symbol={searchSymbol}
        date={searchDate}
        onSymbolChange={setSearchSymbol}
        onDateChange={setSearchDate}
        onSearch={applySearch}
      />

      <PositionsTable positions={positions} loading={positionsLoading} onRefresh={refreshPositions} />
      <OrdersTable orders={orders} loading={ordersLoading} onRefresh={refreshOrders} />
      <DealsTable deals={deals} loading={dealsLoading} onRefresh={refreshDeals} />

      <Mt5AccountFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} account={account} onSave={save} />
    </div>
  );
}

/** Busca global: ativo (filtra Posições/Ordens/Histórico no backend) + data
 * (filtra só o Histórico). Dispara na confirmação (Enter/botão), nunca a cada
 * tecla — são 3 requisições HTTP reais contra o terminal MT5, não um filtro
 * em memória como o de cada tabela abaixo. */
function GlobalSearchBar({
  symbol,
  date,
  onSymbolChange,
  onDateChange,
  onSearch,
}: {
  symbol: string;
  date: string;
  onSymbolChange: (v: string) => void;
  onDateChange: (v: string) => void;
  onSearch: () => void;
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSearch();
  };

  return (
    <div className="mt5-global-search">
      <div className="search-input-wrapper mt5-global-search-symbol">
        <Search size={14} className="search-icon" />
        <input
          type="search"
          className="search-input"
          value={symbol}
          onChange={(e) => onSymbolChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar ativo (ex.: PETR4)"
          aria-label="Buscar ativo"
        />
      </div>
      <label className="mt5-global-search-date">
        <span className="table-cell-muted">Período</span>
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Período (data do histórico)"
        />
      </label>
      <button type="button" className="btn btn-secondary" onClick={onSearch}>
        Buscar
      </button>
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
  loading,
  onRefresh,
}: {
  title: string;
  query: string;
  onQueryChange: (v: string) => void;
  placeholder: string;
  count: number;
  loading?: boolean;
  onRefresh?: () => void;
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
      {onRefresh ? (
        <button
          type="button"
          className="btn-table-icon"
          onClick={onRefresh}
          disabled={loading}
          title={`Atualizar ${title.toLowerCase()}`}
          aria-label={`Atualizar ${title.toLowerCase()}`}
        >
          <RefreshCw size={14} className={loading ? 'spin' : undefined} />
        </button>
      ) : null}
    </div>
  );
}

type PositionColumn = 'ticker' | 'side' | 'quantity' | 'averagePrice' | 'priceCurrent' | 'profit';

/** Posições do MT5 agrupadas por ativo (SPEC-003 R2): PETR4 + PETR4F viram uma linha. */
function PositionsTable({
  positions: raw,
  loading,
  onRefresh,
}: {
  positions: Mt5Position[];
  loading?: boolean;
  onRefresh?: () => void;
}) {
  const positions = useMemo(() => aggregatePositions(raw), [raw]);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const term = query.trim().toUpperCase();
    if (!term) return positions;
    return positions.filter((p) => p.ticker.includes(term));
  }, [positions, query]);

  const { sorted, sort, toggleSort } = useColumnSort<CustodyPosition, PositionColumn>(filtered, (p, col) => p[col] ?? '');

  return (
    <>
      <div className="hpanel-table-card desktop-table-view">
        <TableFilterToolbar
          title="Posições abertas"
          query={query}
          onQueryChange={setQuery}
          placeholder="Filtrar por ativo"
          count={positions.length}
          loading={loading}
          onRefresh={onRefresh}
        />
        <table className="hpanel-table">
          <thead>
            <tr>
              <SortableHeader label="Ativo" column="ticker" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Lado" column="side" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Quantidade" column="quantity" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Preço médio" column="averagePrice" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Preço atual" column="priceCurrent" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Resultado" column="profit" sort={sort} onSort={toggleSort} />
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
              sorted.map((p) => (
                <tr key={`${p.ticker}-${p.side}`}>
                  <td>
                    <div className="table-cell-title">
                      <strong>{p.ticker}</strong>
                    </div>
                  </td>
                  <td>{p.side}</td>
                  <td>
                    {p.quantity.toLocaleString('pt-BR')}
                    {custodyBreakdown(p) ? <div className="table-cell-muted">{custodyBreakdown(p)}</div> : null}
                  </td>
                  <td>{formatMoney(p.averagePrice)}</td>
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
          sorted.map((p) => (
            <div key={`${p.ticker}-${p.side}`} className="mobile-domain-card">
              <div className="mobile-card-top">
                <div className="mobile-card-identity">
                  <Wallet size={15} />
                  <span className="mobile-domain-name">{p.ticker}</span>
                </div>
              </div>
              <div className="mobile-card-subinfo">
                {p.side} · {p.quantity.toLocaleString('pt-BR')} un.
                {custodyBreakdown(p) ? ` · ${custodyBreakdown(p)}` : ''}
              </div>
              <div className="mobile-card-meta">
                <span>Médio: {formatMoney(p.averagePrice)}</span>
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

type OrderColumn = 'symbol' | 'type' | 'volume' | 'priceOpen' | 'sl' | 'tp';

function OrdersTable({
  orders,
  loading,
  onRefresh,
}: {
  orders: Mt5Order[];
  loading?: boolean;
  onRefresh?: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const term = query.trim().toUpperCase();
    if (!term) return orders;
    return orders.filter((o) => o.symbol?.toUpperCase().includes(term));
  }, [orders, query]);

  const { sorted, sort, toggleSort } = useColumnSort<Mt5Order, OrderColumn>(filtered, (o, col) => o[col] ?? '');

  return (
    <>
      <div className="hpanel-table-card desktop-table-view">
        <TableFilterToolbar
          title="Ordens pendentes"
          query={query}
          onQueryChange={setQuery}
          placeholder="Filtrar por ativo"
          count={orders.length}
          loading={loading}
          onRefresh={onRefresh}
        />
        <table className="hpanel-table">
          <thead>
            <tr>
              <SortableHeader label="Ativo" column="symbol" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Lado" column="type" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Volume" column="volume" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Preço" column="priceOpen" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Stop" column="sl" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Alvo" column="tp" sort={sort} onSort={toggleSort} />
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
              sorted.map((o, i) => (
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
          sorted.map((o, i) => (
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

type DealColumn = 'timeEpoch' | 'symbol' | 'type' | 'volume' | 'price' | 'profit';

function DealsTable({
  deals,
  loading,
  onRefresh,
}: {
  deals: Mt5Deal[];
  loading?: boolean;
  onRefresh?: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const term = query.trim().toUpperCase();
    if (!term) return deals;
    return deals.filter((d) => d.symbol?.toUpperCase().includes(term));
  }, [deals, query]);

  const { sorted, sort, toggleSort } = useColumnSort<Mt5Deal, DealColumn>(filtered, (d, col) => d[col] ?? '');

  return (
    <>
      <div className="hpanel-table-card desktop-table-view">
        <TableFilterToolbar
          title="Histórico recente"
          query={query}
          onQueryChange={setQuery}
          placeholder="Filtrar por ativo"
          count={deals.length}
          loading={loading}
          onRefresh={onRefresh}
        />
        <table className="hpanel-table">
          <thead>
            <tr>
              <SortableHeader label="Data" column="timeEpoch" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Ativo" column="symbol" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Lado" column="type" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Volume" column="volume" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Preço" column="price" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Resultado" column="profit" sort={sort} onSort={toggleSort} />
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
              sorted.map((d, i) => (
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
          sorted.map((d, i) => (
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
