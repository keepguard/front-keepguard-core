import React, { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import type { PortfolioTransaction, PortfolioTransactionInput, TransactionSide } from '../../services/portfolioService';
import { getTradeAssetOportunidade, type TradeOpportunity } from '../../services/tradeService';

interface PortfolioTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Presente = editando; ausente = criando uma nova transação para `ticker`. */
  transaction?: PortfolioTransaction | null;
  /** Ticker fixo quando criando (travado no form); ignorado em edição (o ticker da transação não muda). */
  ticker?: string;
  onSave: (input: PortfolioTransactionInput) => Promise<void>;
}

function todayLocalInputValue(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function formatMoney(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Mostra Disparo + Limite do Turtle Soup pra este ticker ANTES do usuário salvar a compra —
 * contexto no momento certo, não depois (achado em operação real: usuário comprou vários
 * ativos seguidos sem nunca ver o número de proteção, teve que recuperá-lo manualmente
 * depois). Números no MESMO formato do formulário Stop Gain/Loss da corretora, prontos pra
 * copiar — não é preciso calcular nada na mão. Sem oportunidade ativa agora: não mostra nada
 * (evita ruído num form que o usuário quer preencher rápido).
 */
function StopSuggestion({
  ticker,
  opportunity,
  loading,
}: {
  ticker?: string;
  opportunity: TradeOpportunity | null;
  loading: boolean;
}) {
  if (!ticker) return null;
  if (loading) {
    return <p className="portfolio-tx-stop-hint is-loading">Verificando proteção sugerida para {ticker}...</p>;
  }
  if (!opportunity) return null;
  return (
    <div className="portfolio-tx-stop-hint">
      <strong>Proteção sugerida (ordem Stop/Loss de Venda, depois de comprar):</strong>
      <div className="portfolio-tx-stop-values">
        <span>Preço Disparo: <strong>{formatMoney(opportunity.stop)}</strong></span>
        <span>Preço Limite: <strong>{formatMoney(opportunity.stopLimite)}</strong></span>
      </div>
    </div>
  );
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export const PortfolioTransactionModal: React.FC<PortfolioTransactionModalProps> = ({
  isOpen,
  onClose,
  transaction,
  ticker,
  onSave,
}) => {
  const isEditing = Boolean(transaction);
  const [side, setSide] = useState<TransactionSide>('BUY');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [fees, setFees] = useState('0');
  const [broker, setBroker] = useState('');
  const [notes, setNotes] = useState('');
  const [tradedAt, setTradedAt] = useState(todayLocalInputValue());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [opportunity, setOpportunity] = useState<TradeOpportunity | null>(null);
  const [opportunityLoading, setOpportunityLoading] = useState(false);

  // Busca o Stop do Turtle Soup só pra transação NOVA de compra (o momento em que o
  // usuário tipicamente esquece de programar a proteção na corretora — achado em operação
  // real registrado em PROGRESS.md 2026-10-02). Edição e venda não mostram isso: editar um
  // registro passado não é hora de agir na corretora, e venda não tem "stop de entrada".
  useEffect(() => {
    if (!isOpen || isEditing || !ticker) {
      setOpportunity(null);
      return;
    }
    const controller = new AbortController();
    setOpportunityLoading(true);
    getTradeAssetOportunidade(ticker, undefined, controller.signal)
      .then((opp) => {
        if (controller.signal.aborted) return;
        setOpportunity(opp);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setOpportunity(null);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setOpportunityLoading(false);
      });
    return () => controller.abort();
  }, [isOpen, isEditing, ticker]);

  useEffect(() => {
    if (!isOpen) return;
    if (transaction) {
      setSide(transaction.side);
      setQuantity(String(transaction.quantity));
      setPrice(String(transaction.price));
      setFees(String(transaction.fees));
      setBroker(transaction.broker || '');
      setNotes(transaction.notes || '');
      setTradedAt(toLocalInputValue(transaction.tradedAt));
    } else {
      setSide('BUY');
      setQuantity('');
      setPrice('');
      setFees('0');
      setBroker('');
      setNotes('');
      setTradedAt(todayLocalInputValue());
    }
    setFormError(null);
  }, [isOpen, transaction]);

  const handleSave = async () => {
    const qty = Number(quantity);
    const prc = Number(price);
    const feesValue = Number(fees || '0');
    if (!Number.isFinite(qty) || qty <= 0) {
      setFormError('Quantidade deve ser maior que zero.');
      return;
    }
    if (!Number.isFinite(prc) || prc <= 0) {
      setFormError('Preço deve ser maior que zero.');
      return;
    }
    if (!Number.isFinite(feesValue) || feesValue < 0) {
      setFormError('Taxas não podem ser negativas.');
      return;
    }
    if (!tradedAt) {
      setFormError('Informe a data da operação.');
      return;
    }

    setFormError(null);
    setSaving(true);
    try {
      await onSave({
        side,
        quantity: qty,
        price: prc,
        fees: feesValue,
        broker: broker.trim() || undefined,
        notes: notes.trim() || undefined,
        tradedAt: new Date(tradedAt).toISOString(),
      });
      onClose();
    } catch (err: any) {
      setFormError(err?.data?.message || err?.message || 'Não foi possível salvar a operação.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Editar operação · ${transaction?.ticker}` : `Registrar operação · ${ticker}`}
      subtitle={isEditing ? 'Altere os dados da operação já registrada.' : 'Registre uma compra ou venda para este ativo.'}
      maxWidth="480px"
      footer={(
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar operação'}
          </button>
        </div>
      )}
    >
      <div className="portfolio-tx-form">
        <div className="form-group">
          <label htmlFor="portfolio-tx-side">Operação</label>
          <div className="portfolio-tx-side-toggle" role="radiogroup" aria-label="Tipo de operação">
            <button
              type="button"
              role="radio"
              aria-checked={side === 'BUY'}
              className={`portfolio-tx-side-btn is-buy${side === 'BUY' ? ' is-active' : ''}`}
              onClick={() => setSide('BUY')}
            >
              Compra
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={side === 'SELL'}
              className={`portfolio-tx-side-btn is-sell${side === 'SELL' ? ' is-active' : ''}`}
              onClick={() => setSide('SELL')}
            >
              Venda
            </button>
          </div>
        </div>

        {!isEditing && side === 'BUY' ? (
          <StopSuggestion ticker={ticker} opportunity={opportunity} loading={opportunityLoading} />
        ) : null}

        <div className="portfolio-tx-form-row">
          <div className="form-group">
            <label htmlFor="portfolio-tx-quantity">Quantidade</label>
            <input
              id="portfolio-tx-quantity"
              className="form-input"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="100"
            />
          </div>
          <div className="form-group">
            <label htmlFor="portfolio-tx-price">Preço unitário (R$)</label>
            <input
              id="portfolio-tx-price"
              className="form-input"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="30,00"
            />
          </div>
        </div>

        <div className="portfolio-tx-form-row">
          <div className="form-group">
            <label htmlFor="portfolio-tx-fees">Taxas (R$)</label>
            <input
              id="portfolio-tx-fees"
              className="form-input"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={fees}
              onChange={(e) => setFees(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="portfolio-tx-traded-at">Data da operação</label>
            <input
              id="portfolio-tx-traded-at"
              className="form-input"
              type="datetime-local"
              value={tradedAt}
              onChange={(e) => setTradedAt(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="portfolio-tx-broker">Corretora (opcional)</label>
          <input
            id="portfolio-tx-broker"
            className="form-input"
            type="text"
            value={broker}
            onChange={(e) => setBroker(e.target.value)}
            placeholder="Ex.: Clear, XP, Rico..."
          />
        </div>

        <div className="form-group">
          <label htmlFor="portfolio-tx-notes">Notas (opcional)</label>
          <textarea
            id="portfolio-tx-notes"
            className="form-input"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observações sobre a operação"
          />
        </div>

        {formError ? <p className="portfolio-tx-error" role="alert">{formError}</p> : null}
      </div>
    </Modal>
  );
};
