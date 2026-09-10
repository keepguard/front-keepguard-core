import React, { useState } from 'react';
import {
  Calendar,
  Check,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  Hash,
  QrCode,
  ShieldCheck,
  User,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { PixQr } from './PixQr';
import type { BillingInvoice } from '../../services/billingService';

interface InvoiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: BillingInvoice | null;
}

function formatMoney(cents: number, currency = 'BRL'): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: currency || 'BRL' });
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function compactId(value?: string | null): string {
  if (!value) return '—';
  const trimmed = value.trim();
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
}

function invoiceStatusInfo(status?: string): { label: string; className: string } {
  switch ((status || '').toLowerCase()) {
    case 'paid':
      return { label: 'Pago', className: 'billing-status-badge is-paid' };
    case 'pending':
      return { label: 'Aguardando pagamento', className: 'billing-status-badge is-pending' };
    case 'overdue':
      return { label: 'Vencida', className: 'billing-status-badge is-overdue' };
    case 'refunded':
      return { label: 'Estornada', className: 'billing-status-badge is-refunded' };
    case 'canceled':
      return { label: 'Cancelada', className: 'billing-status-badge is-canceled' };
    default:
      return { label: status || '—', className: 'billing-status-badge' };
  }
}

function paymentMethodLabel(method?: string | null): string {
  const m = (method || '').toLowerCase();
  if (m === 'pix') return 'PIX';
  if (m === 'boleto') return 'Boleto Bancário';
  if (m === 'credit_card' || m === 'creditcard') return 'Cartão de Crédito';
  return method ? method.toUpperCase() : '—';
}

function maskPix(payload: string): string {
  if (payload.length <= 36) return payload;
  return `${payload.slice(0, 20)}…${payload.slice(-12)}`;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  isOpen,
  onClose,
  invoice,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!invoice) return null;

  const statusInfo = invoiceStatusInfo(invoice.status);
  const isPix = (invoice.paymentMethod || '').toLowerCase() === 'pix';
  const isPending = (invoice.status || '').toLowerCase() === 'pending';

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 2000);
    } catch {
      setCopiedKey(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Detalhes da transação"
      subtitle={`Fatura ${compactId(invoice.id)}`}
      maxWidth="620px"
      footer={(
        <div className="modal-actions" style={{ justifyContent: 'flex-end', width: '100%' }}>
          <button type="button" className="btn btn-primary btn-pill" onClick={onClose}>
            Fechar
          </button>
        </div>
      )}
    >
      <div className="billing-detail-content">
        {/* Card Destaque: Valor, Status e Método */}
        <div className="billing-detail-hero">
          <div className="billing-detail-hero-main">
            <span className="billing-detail-amount">
              {formatMoney(invoice.amountCents, invoice.currency)}
            </span>
            <div className="billing-detail-hero-badges">
              <span className={statusInfo.className}>
                {invoice.status === 'paid' ? <ShieldCheck size={14} /> : <Clock size={14} />}
                {statusInfo.label}
              </span>
              <span className="billing-method-badge">
                <CreditCard size={14} />
                {paymentMethodLabel(invoice.paymentMethod)}
              </span>
            </div>
          </div>
        </div>

        {/* Bloco de Ações Imediatas: PIX (quando pendente) */}
        {isPix && invoice.pixPayload && isPending ? (
          <section className="billing-detail-card billing-detail-pix-card" aria-label="Pagamento via PIX">
            <div className="billing-detail-card-header">
              <QrCode size={18} className="billing-detail-icon" />
              <strong>Pagamento PIX</strong>
            </div>
            <div className="billing-detail-pix-body">
              <div className="billing-qr-frame">
                <PixQr payload={invoice.pixPayload} />
              </div>
              <div className="billing-detail-pix-actions">
                <p className="billing-checkout-hint">
                  Escaneie o QR Code no app do banco ou copie o código abaixo para pagar:
                </p>
                <div className="billing-pix-preview" title="Código Copia e Cola">
                  {maskPix(invoice.pixPayload)}
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-pill billing-detail-action-btn"
                  onClick={() => void copy(invoice.pixPayload!, 'pix')}
                >
                  {copiedKey === 'pix' ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copiedKey === 'pix' ? 'Código PIX copiado!' : 'Copiar código PIX'}</span>
                </button>
                <details className="billing-pix-details">
                  <summary>Ver chave completa</summary>
                  <p className="billing-pix-full">{invoice.pixPayload}</p>
                </details>
              </div>
            </div>
          </section>
        ) : null}

        {/* Bloco de Ações Imediatas: Boleto */}
        {invoice.bankSlipUrl ? (
          <section className="billing-detail-card" aria-label="Boleto Bancário">
            <div className="billing-detail-card-header">
              <FileText size={18} className="billing-detail-icon" />
              <strong>Boleto Bancário</strong>
            </div>
            <div className="billing-detail-row" style={{ alignItems: 'center' }}>
              <span className="billing-detail-label">PDF do boleto emitido no gateway:</span>
              <a
                href={invoice.bankSlipUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary btn-pill"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <ExternalLink size={15} />
                <span>Visualizar / Imprimir Boleto</span>
              </a>
            </div>
          </section>
        ) : null}

        {/* Bloco de Ações Imediatas: Nota Fiscal */}
        {invoice.nfUrl || invoice.nfId ? (
          <section className="billing-detail-card" aria-label="Nota Fiscal">
            <div className="billing-detail-card-header">
              <FileText size={18} className="billing-detail-icon" />
              <strong>Nota Fiscal</strong>
            </div>
            <div className="billing-detail-row" style={{ alignItems: 'center' }}>
              <span className="billing-detail-label">
                {invoice.nfId ? `Nota Fiscal nº ${invoice.nfId}` : 'Documento Fiscal'}
              </span>
              {invoice.nfUrl ? (
                <a
                  href={invoice.nfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-pill"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <ExternalLink size={15} />
                  <span>Acessar Nota Fiscal</span>
                </a>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* Dados do Pagador */}
        <section className="billing-detail-card" aria-label="Dados do Pagador">
          <div className="billing-detail-card-header">
            <User size={18} className="billing-detail-icon" />
            <strong>Dados do Pagador</strong>
          </div>
          <div className="billing-detail-grid">
            <div className="billing-detail-item">
              <span className="billing-detail-label">Nome</span>
              <span className="billing-detail-value">{invoice.payerName || 'Não informado'}</span>
            </div>
            <div className="billing-detail-item">
              <span className="billing-detail-label">E-mail</span>
              <span className="billing-detail-value">{invoice.payerEmail || 'Não informado'}</span>
            </div>
            <div className="billing-detail-item billing-detail-item-full">
              <span className="billing-detail-label">ID do Usuário (UUID)</span>
              <div className="billing-detail-id-box">
                <code>{invoice.payerUserId}</code>
                <button
                  type="button"
                  className="btn-icon-subtle"
                  title="Copiar ID do usuário"
                  onClick={() => void copy(invoice.payerUserId, 'payerUserId')}
                >
                  {copiedKey === 'payerUserId' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Linha do Tempo e Datas */}
        <section className="billing-detail-card" aria-label="Linha do Tempo">
          <div className="billing-detail-card-header">
            <Calendar size={18} className="billing-detail-icon" />
            <strong>Ciclo e Prazos</strong>
          </div>
          <div className="billing-detail-grid">
            <div className="billing-detail-item">
              <span className="billing-detail-label">Data de Emissão</span>
              <span className="billing-detail-value">{formatDate(invoice.issuedAt)}</span>
            </div>
            <div className="billing-detail-item">
              <span className="billing-detail-label">Vencimento</span>
              <span className="billing-detail-value">{formatDate(invoice.dueAt)}</span>
            </div>
            <div className="billing-detail-item">
              <span className="billing-detail-label">Data de Pagamento</span>
              <span className="billing-detail-value">
                {invoice.status === 'paid' ? formatDate(invoice.paidAt) : 'Aguardando liquidação'}
              </span>
            </div>
            <div className="billing-detail-item">
              <span className="billing-detail-label">Limite de Carência</span>
              <span className="billing-detail-value">
                {invoice.graceEndsAt ? formatDate(invoice.graceEndsAt) : 'Sem carência'}
              </span>
            </div>
          </div>
        </section>

        {/* Auditoria e Conciliação Técnica */}
        <section className="billing-detail-card" aria-label="Identificadores e Conciliação">
          <div className="billing-detail-card-header">
            <Hash size={18} className="billing-detail-icon" />
            <strong>Rastreabilidade & Auditoria</strong>
          </div>
          <div className="billing-detail-grid">
            <div className="billing-detail-item billing-detail-item-full">
              <span className="billing-detail-label">ID da Transação (KeepGuard)</span>
              <div className="billing-detail-id-box">
                <code>{invoice.id}</code>
                <button
                  type="button"
                  className="btn-icon-subtle"
                  title="Copiar ID da transação"
                  onClick={() => void copy(invoice.id, 'invoiceId')}
                >
                  {copiedKey === 'invoiceId' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            {invoice.subscriptionId ? (
              <div className="billing-detail-item billing-detail-item-full">
                <span className="billing-detail-label">ID da Assinatura Vinculada</span>
                <div className="billing-detail-id-box">
                  <code>{invoice.subscriptionId}</code>
                  <button
                    type="button"
                    className="btn-icon-subtle"
                    title="Copiar ID da assinatura"
                    onClick={() => void copy(invoice.subscriptionId!, 'subscriptionId')}
                  >
                    {copiedKey === 'subscriptionId' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="billing-detail-item billing-detail-item-full">
                <span className="billing-detail-label">Tipo de Cobrança</span>
                <span className="billing-detail-value table-cell-muted">Cobrança avulsa / sem assinatura</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
};
