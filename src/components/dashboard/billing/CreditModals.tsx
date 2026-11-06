import React, { useId, useState } from 'react';
import { Modal } from '../../common/Modal';
import { useAuth } from '../../../context/AuthContext';
import {
  grantBillingCredit,
  reverseBillingCredit,
  type BillingCreditItem,
} from '../../../services/billingService';
import {
  brl,
  dateInputToExpiry,
  parseBrlToCents,
  shortDate,
  signedBrl,
} from '../../../utils/billingMoney';
import { Field, MoneyErrorNotice, REASON_HINT } from './BillingMoneyUi';
import { useMoneyWrite } from './useBillingFeatures';

function submitLabel(idle: string, busy: boolean, canRetrySame: boolean): string {
  if (busy) return 'Enviando…';
  return canRetrySame ? 'Tentar de novo' : idle;
}

export const GrantCreditModal: React.FC<{
  userId: string;
  subtitle: string;
  availableCents: number;
  onClose: () => void;
  onDone: (message: string) => void;
}> = ({ userId, subtitle, availableCents, onClose, onDone }) => {
  const { getAccessToken } = useAuth();
  const write = useMoneyWrite();
  const baseId = useId();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [publicText, setPublicText] = useState('');
  const [expiry, setExpiry] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; reason?: string; expiry?: string }>({});

  const cents = parseBrlToCents(amount);
  const valid = cents !== null && cents > 0;
  const today = new Date().toLocaleDateString('sv-SE');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!valid) next.amount = 'Informe um valor maior que zero, como 19,40.';
    if (!reason.trim()) next.reason = 'Escreva o motivo.';
    if (expiry && expiry < today) next.expiry = 'A validade não pode ser no passado.';
    setErrors(next);
    const access = getAccessToken();
    if (Object.keys(next).length > 0 || !access || cents === null) return;
    const body = {
      userId,
      amountCents: cents,
      reason: reason.trim(),
      ...(publicText.trim() ? { publicText: publicText.trim() } : {}),
      ...(expiry ? { expiresAt: dateInputToExpiry(expiry) } : {}),
    };
    const result = await write.run((key) => grantBillingCredit(body, key, access));
    if (result) onDone(`Crédito de ${brl(cents)} lançado.`);
  };

  const formId = `${baseId}-form`;
  return (
    <Modal
      isOpen
      trapFocus
      onClose={() => { if (!write.busy) onClose(); }}
      title="Lançar crédito"
      subtitle={subtitle}
      maxWidth="520px"
      footer={(
        <div className="modal-actions bm-footer">
          <button type="button" className="btn btn-secondary btn-pill" onClick={onClose} disabled={write.busy}>Cancelar</button>
          <button type="submit" form={formId} className="btn btn-primary btn-pill bm-btn" disabled={write.busy || write.blocked}>
            {submitLabel('Lançar crédito', write.busy, write.canRetrySame)}
          </button>
        </div>
      )}
    >
      <form id={formId} noValidate onSubmit={handleSubmit}>
        {write.error ? <MoneyErrorNotice error={write.error} /> : null}
        <Field id={`${baseId}-amount`} label="Valor" required error={errors.amount}>
          {(describedBy) => (
            <input
              id={`${baseId}-amount`}
              className="form-input"
              inputMode="decimal"
              autoComplete="off"
              placeholder="R$ 0,00"
              value={amount}
              disabled={write.frozen}
              aria-required="true"
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={describedBy}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </Field>
        <Field id={`${baseId}-reason`} label="Motivo" required hint={REASON_HINT} error={errors.reason}>
          {(describedBy) => (
            <textarea
              id={`${baseId}-reason`}
              className="form-input bm-textarea"
              value={reason}
              disabled={write.frozen}
              aria-required="true"
              aria-invalid={Boolean(errors.reason)}
              aria-describedby={describedBy}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
        <Field id={`${baseId}-public`} label="Texto que o cliente vê (opcional)" hint="Sem texto, vale o padrão: Crédito da equipe.">
          {(describedBy) => (
            <input
              id={`${baseId}-public`}
              className="form-input"
              maxLength={120}
              placeholder="Crédito da equipe"
              value={publicText}
              disabled={write.frozen}
              aria-describedby={describedBy}
              onChange={(e) => setPublicText(e.target.value)}
            />
          )}
        </Field>
        <Field id={`${baseId}-expiry`} label="Vence em (opcional)" hint="Em branco, não vence." error={errors.expiry}>
          {(describedBy) => (
            <input
              id={`${baseId}-expiry`}
              className="form-input"
              type="date"
              min={today}
              value={expiry}
              disabled={write.frozen}
              aria-invalid={Boolean(errors.expiry)}
              aria-describedby={describedBy}
              onChange={(e) => setExpiry(e.target.value)}
            />
          )}
        </Field>
        <div className="bm-preview" aria-live="polite">
          <h4>Prévia</h4>
          <dl>
            <dt>Entra em {new Date().toLocaleDateString('pt-BR')}</dt>
            <dd>{valid ? `+${brl(cents)}` : '—'}</dd>
            <dt>Disponível agora</dt>
            <dd>{brl(availableCents)}</dd>
            <dt>Disponível depois</dt>
            <dd>{valid ? brl(availableCents + cents) : '—'}</dd>
            <dt>Validade</dt>
            <dd>{expiry ? expiry.split('-').reverse().join('/') : 'Não vence'}</dd>
          </dl>
          <p className="bm-preview-note">Depois de lançado, não dá para editar. Corrigir é lançar o contrário.</p>
        </div>
      </form>
    </Modal>
  );
};

export const ReverseCreditModal: React.FC<{
  item: BillingCreditItem;
  availableCents: number;
  onClose: () => void;
  onDone: (message: string) => void;
}> = ({ item, availableCents, onClose, onDone }) => {
  const { getAccessToken } = useAuth();
  const write = useMoneyWrite();
  const baseId = useId();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const remaining = item.remainingCents ?? 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const access = getAccessToken();
    if (!reason.trim()) {
      setReasonError('Escreva o motivo.');
      return;
    }
    setReasonError(undefined);
    if (!access) return;
    const result = await write.run((key) => reverseBillingCredit(item.id, { reason: reason.trim() }, key, access));
    if (result) onDone(`Lançamento contrário de ${brl(Math.abs(result.amountCents))} registrado.`);
  };

  const formId = `${baseId}-form`;
  return (
    <Modal
      isOpen
      trapFocus
      onClose={() => { if (!write.busy) onClose(); }}
      title="Lançar contrário"
      subtitle={`Corrige o lançamento de ${shortDate(item.createdAt)}. A linha original continua no extrato.`}
      maxWidth="520px"
      footer={(
        <div className="modal-actions bm-footer">
          <button type="button" className="btn btn-secondary btn-pill" onClick={onClose} disabled={write.busy}>Cancelar</button>
          <button type="submit" form={formId} className="btn btn-primary btn-pill bm-btn" disabled={write.busy || write.blocked}>
            {submitLabel('Lançar contrário', write.busy, write.canRetrySame)}
          </button>
        </div>
      )}
    >
      <form id={formId} noValidate onSubmit={handleSubmit}>
        {write.error ? <MoneyErrorNotice error={write.error} /> : null}
        <div className="bm-preview">
          <h4>Prévia</h4>
          <dl>
            <dt>Valor original</dt>
            <dd>{signedBrl(item.amountCents)}</dd>
            <dt>Sai do saldo em {new Date().toLocaleDateString('pt-BR')}</dt>
            <dd>−{brl(remaining)}</dd>
            <dt>Disponível depois</dt>
            <dd>{brl(Math.max(0, availableCents - remaining))}</dd>
          </dl>
        </div>
        <p className="bm-hint bm-block-hint">
          Só sai o que resta do lançamento. O que já foi usado em fatura paga fica com a pessoa; o que está reservado sai quando voltar.
        </p>
        <Field id={`${baseId}-reason`} label="Motivo" required hint={REASON_HINT} error={reasonError}>
          {(describedBy) => (
            <textarea
              id={`${baseId}-reason`}
              className="form-input bm-textarea"
              value={reason}
              disabled={write.frozen}
              aria-required="true"
              aria-invalid={Boolean(reasonError)}
              aria-describedby={describedBy}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Modal>
  );
};
