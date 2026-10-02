import { useState } from 'react';
import { Link2, Pencil, RefreshCw, Trash2, Wallet } from 'lucide-react';
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
      <div className="mt5-account-view" aria-busy="true" aria-label="Carregando conta MT5">
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
          <span>Você ainda não vinculou uma conta MT5. Cadastre o ambiente e a URL do gateway para ver saldo, posições e ordens aqui.</span>
          <button type="button" className="btn" style={{ marginTop: '1rem' }} onClick={() => setFormOpen(true)}>
            Vincular conta MT5
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

function PositionsTable({ positions }: { positions: Mt5Position[] }) {
  return (
    <div className="hpanel-table-card desktop-table-view">
      <h3 className="market-section-title">Posições abertas</h3>
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
              <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                <Wallet size={18} /> Nenhuma posição aberta.
              </td>
            </tr>
          ) : (
            positions.map((p, i) => (
              <tr key={`${p.symbol}-${i}`}>
                <td>{p.symbol}</td>
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
  );
}

function OrdersTable({ orders }: { orders: Mt5Order[] }) {
  return (
    <div className="hpanel-table-card desktop-table-view">
      <h3 className="market-section-title">Ordens pendentes</h3>
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
              <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                Nenhuma ordem pendente.
              </td>
            </tr>
          ) : (
            orders.map((o, i) => (
              <tr key={`${o.symbol}-${i}`}>
                <td>{o.symbol}</td>
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
  );
}

function DealsTable({ deals }: { deals: Mt5Deal[] }) {
  return (
    <div className="hpanel-table-card desktop-table-view">
      <h3 className="market-section-title">Histórico recente</h3>
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
              <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                Nenhuma operação no período.
              </td>
            </tr>
          ) : (
            deals.map((d, i) => (
              <tr key={`${d.symbol}-${i}`}>
                <td>{new Date(d.time).toLocaleString('pt-BR')}</td>
                <td>{d.symbol}</td>
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
  );
}
