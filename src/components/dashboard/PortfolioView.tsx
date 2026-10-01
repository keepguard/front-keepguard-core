import { useMemo, useState } from 'react';
import { History, Plus, RefreshCw, Search, TrendingDown, TrendingUp, Wallet, X } from 'lucide-react';
import { usePortfolioPositions } from '../../hooks/usePortfolioPositions';
import {
  addPortfolioTransaction,
  updatePortfolioTransaction,
  type PortfolioPosition,
  type PortfolioTransaction,
  type PortfolioTransactionInput,
} from '../../services/portfolioService';
import { TickerCombobox } from '../common/TickerCombobox';
import { PortfolioTransactionModal } from './PortfolioTransactionModal';
import { PortfolioHistoryModal } from './PortfolioHistoryModal';

function formatMoney(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatQuantity(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

export function PortfolioView() {
  const { data, loading, refreshing, error, refresh } = usePortfolioPositions();
  const [query, setQuery] = useState('');

  const [txModalTicker, setTxModalTicker] = useState<string | null>(null);
  const [editingTx, setEditingTx] = useState<PortfolioTransaction | null>(null);
  const [historyTicker, setHistoryTicker] = useState<string | null>(null);

  const limparFiltro = () => setQuery('');

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = query.trim().toUpperCase();
    if (!term) return data;
    return data.filter((pos) => pos.ticker.includes(term));
  }, [data, query]);

  const totals = useMemo(() => {
    const list = data ?? [];
    return {
      cost: list.reduce((acc, p) => acc + p.totalCost, 0),
      realizedPl: list.reduce((acc, p) => acc + p.realizedPl, 0),
    };
  }, [data]);

  const openNewTransactionForTicker = (ticker: string) => {
    setEditingTx(null);
    setTxModalTicker(ticker);
  };

  const handleEditFromHistory = (tx: PortfolioTransaction) => {
    setHistoryTicker(null);
    setEditingTx(tx);
    setTxModalTicker(tx.ticker);
  };

  const handleSaveTransaction = async (input: PortfolioTransactionInput) => {
    if (editingTx) {
      await updatePortfolioTransaction(editingTx.id, input);
    } else if (txModalTicker) {
      await addPortfolioTransaction(txModalTicker, input);
    }
    refresh();
  };

  if (loading && !data) {
    return (
      <div className="portfolio-view" aria-busy="true" aria-label="Carregando carteira">
        <div className="hpanel-table-card desktop-table-view">
          <div className="portfolio-skeleton" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="trade-state" role="alert">
        <p>{error?.message ?? 'Não foi possível carregar a carteira.'}</p>
        <button type="button" className="btn btn-secondary" onClick={refresh}>Tentar de novo</button>
      </div>
    );
  }

  return (
    <div className="portfolio-view">
      <div className="table-toolbar">
        <div className="search-input-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Buscar ticker na carteira..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar ticker na carteira"
          />
          {query ? (
            <button type="button" className="trade-search-clear" onClick={limparFiltro} aria-label="Limpar busca">
              <X size={14} />
            </button>
          ) : null}
        </div>

        <div className="table-toolbar-push-end portfolio-toolbar-actions">
          <div className="portfolio-add-group">
            <span className="portfolio-add-label">Nova operação:</span>
            <TickerCombobox
              placeholder="Escolher ativo..."
              aria-label="Escolher ativo para nova operação"
              onSelect={openNewTransactionForTicker}
            />
          </div>

          <button
            type="button"
            className="btn-table-icon"
            onClick={refresh}
            disabled={refreshing}
            title="Atualizar carteira"
            aria-label="Atualizar carteira"
          >
            <RefreshCw size={15} className={refreshing ? 'spin' : undefined} />
          </button>
        </div>
      </div>

      {error ? (
        <p className="trade-note is-warn" role="alert">
          Não foi possível atualizar agora; mostrando o último dado carregado.
        </p>
      ) : null}

      {data.length > 0 ? (
        <div className="portfolio-summary-row">
          <div className="portfolio-summary-card">
            <span className="table-cell-muted">Custo total em carteira</span>
            <strong>{formatMoney(totals.cost)}</strong>
          </div>
          <div className="portfolio-summary-card">
            <span className="table-cell-muted">Resultado realizado</span>
            <strong className={totals.realizedPl >= 0 ? 'portfolio-pl-positive' : 'portfolio-pl-negative'}>
              {formatMoney(totals.realizedPl)}
            </strong>
          </div>
          <div className="portfolio-summary-card">
            <span className="table-cell-muted">Ativos em carteira</span>
            <strong>{data.length}</strong>
          </div>
        </div>
      ) : null}

      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Quantidade</th>
              <th>Preço médio</th>
              <th>Custo total</th>
              <th>Resultado realizado</th>
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem' }}>
                  <div className="portfolio-empty-state">
                    <Wallet size={22} />
                    <span>Você ainda não registrou nenhuma compra ou venda. Use "Nova operação" para começar.</span>
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem' }}>
                  Nenhum ativo da carteira corresponde a “{query}”.
                </td>
              </tr>
            ) : (
              filtered.map((pos) => (
                <tr key={pos.ticker}>
                  <td>
                    <div className="table-cell-title">
                      <strong>{pos.ticker}</strong>
                    </div>
                  </td>
                  <td>{formatQuantity(pos.quantity)}</td>
                  <td>{formatMoney(pos.averagePrice)}</td>
                  <td>{formatMoney(pos.totalCost)}</td>
                  <td>
                    <span className={pos.realizedPl >= 0 ? 'portfolio-pl-positive' : 'portfolio-pl-negative'}>
                      {pos.realizedPl >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {formatMoney(pos.realizedPl)}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions-group" style={{ justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn-table-icon"
                        title="Ver histórico de operações"
                        aria-label={`Ver histórico de ${pos.ticker}`}
                        onClick={() => setHistoryTicker(pos.ticker)}
                      >
                        <History size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn-table-icon"
                        title="Registrar nova operação"
                        aria-label={`Registrar operação em ${pos.ticker}`}
                        onClick={() => openNewTransactionForTicker(pos.ticker)}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards-container">
        {data.length === 0 ? (
          <div className="mobile-loading-card">
            Você ainda não registrou nenhuma compra ou venda.
          </div>
        ) : filtered.length === 0 ? (
          <div className="mobile-loading-card">Nenhum ativo corresponde a “{query}”.</div>
        ) : (
          filtered.map((pos: PortfolioPosition) => (
            <div key={pos.ticker} className="mobile-domain-card">
              <div className="mobile-card-top">
                <div className="mobile-card-identity">
                  <Wallet size={15} />
                  <span className="mobile-domain-name">{pos.ticker}</span>
                </div>
              </div>
              <div className="mobile-card-subinfo">
                {formatQuantity(pos.quantity)} un. · PM {formatMoney(pos.averagePrice)}
              </div>
              <div className="mobile-card-meta">
                <span>Custo: {formatMoney(pos.totalCost)}</span>
                <span className={pos.realizedPl >= 0 ? 'portfolio-pl-positive' : 'portfolio-pl-negative'}>
                  Resultado: {formatMoney(pos.realizedPl)}
                </span>
              </div>
              <div className="mobile-card-actions table-actions-group">
                <button
                  type="button"
                  className="btn-table-icon"
                  title="Ver histórico"
                  aria-label={`Ver histórico de ${pos.ticker}`}
                  onClick={() => setHistoryTicker(pos.ticker)}
                >
                  <History size={15} />
                </button>
                <button
                  type="button"
                  className="btn-table-icon"
                  title="Registrar operação"
                  aria-label={`Registrar operação em ${pos.ticker}`}
                  onClick={() => openNewTransactionForTicker(pos.ticker)}
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <PortfolioTransactionModal
        isOpen={txModalTicker !== null}
        onClose={() => {
          setTxModalTicker(null);
          setEditingTx(null);
        }}
        transaction={editingTx}
        ticker={txModalTicker ?? undefined}
        onSave={handleSaveTransaction}
      />

      <PortfolioHistoryModal
        isOpen={historyTicker !== null}
        onClose={() => setHistoryTicker(null)}
        ticker={historyTicker}
        onEdit={handleEditFromHistory}
        onChanged={refresh}
      />
    </div>
  );
}
