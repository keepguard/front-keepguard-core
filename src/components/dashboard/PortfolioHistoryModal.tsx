import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import {
  deletePortfolioTransaction,
  listPortfolioTransactions,
  type PortfolioTransaction,
} from '../../services/portfolioService';

interface PortfolioHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticker: string | null;
  onEdit: (tx: PortfolioTransaction) => void;
  /** Disparado depois de uma exclusão bem-sucedida, pra view pai recalcular a posição. */
  onChanged: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const PortfolioHistoryModal: React.FC<PortfolioHistoryModalProps> = ({
  isOpen,
  onClose,
  ticker,
  onEdit,
  onChanged,
}) => {
  const [items, setItems] = useState<PortfolioTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    listPortfolioTransactions({ ticker, limit: 100 })
      .then((res) => setItems(res.items))
      .catch((err) => setError(err?.data?.message || err?.message || 'Não foi possível carregar o histórico.'))
      .finally(() => setLoading(false));
  }, [ticker]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const handleDelete = async (tx: PortfolioTransaction) => {
    const confirmed = window.confirm(
      `Excluir a operação de ${tx.side === 'BUY' ? 'compra' : 'venda'} de ${tx.quantity} ${tx.ticker} em ${formatDate(tx.tradedAt)}?`
    );
    if (!confirmed) return;
    setDeletingId(tx.id);
    try {
      await deletePortfolioTransaction(tx.id);
      setItems((prev) => prev.filter((t) => t.id !== tx.id));
      onChanged();
    } catch (err: any) {
      setError(err?.data?.message || err?.message || 'Não foi possível excluir a operação.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Histórico · ${ticker ?? ''}`}
      subtitle="Todas as operações registradas para este ativo."
      maxWidth="640px"
    >
      {loading ? (
        <p className="text-muted">Carregando histórico...</p>
      ) : error ? (
        <p className="portfolio-tx-error" role="alert">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-muted">Nenhuma operação registrada para este ativo ainda.</p>
      ) : (
        <div className="portfolio-history-list">
          {items.map((tx) => (
            <div key={tx.id} className="portfolio-history-item">
              <div className="portfolio-history-item-main">
                <span className={`portfolio-tx-badge is-${tx.side.toLowerCase()}`}>
                  {tx.side === 'BUY' ? 'Compra' : 'Venda'}
                </span>
                <div className="portfolio-history-item-details">
                  <strong>{tx.quantity} un. a {formatMoney(tx.price)}</strong>
                  <span className="table-cell-muted">
                    {formatDate(tx.tradedAt)}
                    {tx.broker ? ` · ${tx.broker}` : ''}
                    {tx.fees ? ` · taxas ${formatMoney(tx.fees)}` : ''}
                  </span>
                  {tx.notes ? <span className="table-cell-muted">{tx.notes}</span> : null}
                </div>
              </div>
              <div className="table-actions-group">
                <button
                  type="button"
                  className="btn-table-icon"
                  title="Editar operação"
                  aria-label="Editar operação"
                  onClick={() => onEdit(tx)}
                  disabled={deletingId === tx.id}
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  className="btn-table-icon is-danger"
                  title="Excluir operação"
                  aria-label="Excluir operação"
                  onClick={() => void handleDelete(tx)}
                  disabled={deletingId === tx.id}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};
