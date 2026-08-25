import React, { useState } from 'react';
import { Lock, Eye, EyeOff, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { authService } from '../../services/authService';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { accessToken } = useAuth();
  const { addToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      addToast({
        type: 'warning',
        title: 'Campos obrigatórios',
        description: 'Preencha todos os campos do formulário.',
      });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      addToast({
        type: 'warning',
        title: 'Senhas divergentes',
        description: 'A nova senha e a confirmação devem ser iguais.',
      });
      return;
    }

    if (!accessToken) {
      addToast({
        type: 'error',
        title: 'Sessão inválida',
        description: 'Você precisa estar logado para alterar sua senha.',
      });
      return;
    }

    setIsLoading(true);
    try {
      await authService.changePassword(
        {
          currentPassword,
          newPassword,
          confirmNewPassword,
        },
        accessToken
      );

      addToast({
        type: 'success',
        title: 'Senha alterada!',
        description: 'Sua senha de acesso foi atualizada com sucesso.',
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      onClose();
    } catch (err: any) {
      console.error('Erro ao alterar senha:', err);
      addToast({
        type: 'error',
        title: 'Erro na alteração',
        description: err.message || 'Verifique se a senha atual está correta.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Alterar Senha de Acesso"
      subtitle="Defina uma nova senha para sua conta autenticada."
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label" htmlFor="cp-current">
            Senha Atual
          </label>
          <div className="input-icon-wrapper">
            <Lock className="input-icon" size={18} />
            <input
              id="cp-current"
              type={showCurrent ? 'text' : 'password'}
              className="form-input with-icon with-action"
              placeholder="Digite sua senha atual"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              disabled={isLoading}
              required
            />
            <button
              type="button"
              className="input-action-btn"
              onClick={() => setShowCurrent(!showCurrent)}
              tabIndex={-1}
            >
              {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="cp-new">
            Nova Senha
          </label>
          <div className="input-icon-wrapper">
            <Lock className="input-icon" size={18} />
            <input
              id="cp-new"
              type={showNew ? 'text' : 'password'}
              className="form-input with-icon with-action"
              placeholder="Mínimo 8 caracteres"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              disabled={isLoading}
              required
            />
            <button
              type="button"
              className="input-action-btn"
              onClick={() => setShowNew(!showNew)}
              tabIndex={-1}
            >
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="cp-confirm">
            Confirmar Nova Senha
          </label>
          <div className="input-icon-wrapper">
            <Lock className="input-icon" size={18} />
            <input
              id="cp-confirm"
              type={showNew ? 'text' : 'password'}
              className="form-input with-icon"
              placeholder="Repita a nova senha"
              value={confirmNewPassword}
              onChange={e => setConfirmNewPassword(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>
        </div>

        <div className="alert-box alert-info">
          <ShieldAlert size={16} />
          <span>A nova senha não pode ser igual a nenhuma das suas últimas 5 senhas utilizadas.</span>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="btn-spinner-content">
                <span className="spinner-small" /> Atualizando...
              </span>
            ) : (
              <>
                <CheckCircle2 size={16} /> Salvar Nova Senha
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
