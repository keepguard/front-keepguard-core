import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import type { Mt5Account, Mt5AccountInput, Mt5Ambiente } from '../../services/mt5AccountService';

interface Mt5AccountFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Mt5Account | null;
  onSave: (input: Mt5AccountInput) => Promise<void>;
}

export function Mt5AccountFormModal({ isOpen, onClose, account, onSave }: Mt5AccountFormModalProps) {
  const [ambiente, setAmbiente] = useState<Mt5Ambiente>('demo');
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAmbiente(account?.ambiente ?? 'demo');
      setGatewayUrl(account?.gatewayUrl ?? '');
      setFormError(null);
    }
  }, [isOpen, account]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gatewayUrl.trim()) {
      setFormError('Informe a URL do gateway MT5.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await onSave({ ambiente, gatewayUrl: gatewayUrl.trim() });
      onClose();
    } catch (err) {
      const e = err as { data?: { message?: string }; message?: string };
      setFormError(e?.data?.message || e?.message || 'Não foi possível salvar o vínculo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={account ? 'Editar conta MT5' : 'Vincular conta MT5'}
      subtitle="Informe só o ambiente e a URL do gateway — nunca o login ou a senha da corretora."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" form="mt5-account-form" className="btn" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="mt5-account-form" onSubmit={handleSubmit}>
        {formError ? (
          <p className="trade-note is-warn" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="form-group">
          <label htmlFor="mt5-ambiente">Ambiente</label>
          <select
            id="mt5-ambiente"
            className="form-input"
            value={ambiente}
            onChange={(e) => setAmbiente(e.target.value as Mt5Ambiente)}
            disabled={saving}
          >
            <option value="demo">Demo</option>
            <option value="real">Real</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="mt5-gateway-url">URL do gateway</label>
          <input
            id="mt5-gateway-url"
            type="text"
            className="form-input"
            value={gatewayUrl}
            onChange={(e) => setGatewayUrl(e.target.value)}
            placeholder="http://mt5-gw-rafael:8671"
            disabled={saving}
          />
        </div>
      </form>
    </Modal>
  );
}
