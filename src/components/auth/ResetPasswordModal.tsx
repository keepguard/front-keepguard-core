import React, { useState, useEffect } from 'react';
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  ShieldAlert,
  KeyRound,
  Send,
  Timer,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { OtpInput } from '../common/OtpInput';
import { useToast } from '../../context/ToastContext';
import { authService } from '../../services/authService';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEmail?: string;
  onSuccess: () => void;
}

export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({
  isOpen,
  onClose,
  defaultEmail = '',
  onSuccess,
}) => {
  const { addToast } = useToast();
  const [email, setEmail] = useState(defaultEmail);
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [attemptsInfo, setAttemptsInfo] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(60);

  React.useEffect(() => {
    if (defaultEmail) {
      setEmail(defaultEmail);
    }
    if (isOpen) {
      // Ao abrir após envio bem-sucedido, inicia cooldown de reenvio
      setResendCooldown(60);
      setToken('');
      setAttemptsInfo(null);
    }
  }, [defaultEmail, isOpen]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleResendCode = async () => {
    if (!email.trim() || resendCooldown > 0 || isResending) return;

    setIsResending(true);
    try {
      await authService.forgotPassword({ email: email.trim() });
      setResendCooldown(60);
      addToast({
        type: 'success',
        title: 'Novo código enviado',
        description: 'Verifique seu e-mail novamente.',
      });
    } catch (err: any) {
      const isRateLimit =
        err?.status === 429 ||
        err?.message?.includes('Aguarde') ||
        err?.data?.errorCode === 'TOO_MANY_REQUESTS';

      if (isRateLimit) {
        setResendCooldown(60);
      }

      addToast({
        type: isRateLimit ? 'warning' : 'error',
        title: isRateLimit ? 'Aguarde para reenviar' : 'Erro ao reenviar',
        description: err.message || 'Não foi possível reenviar o código.',
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || token.length !== 6 || !newPassword || !confirmNewPassword) {
      addToast({
        type: 'warning',
        title: 'Formulário incompleto',
        description: 'Preencha todos os campos e o código de 6 dígitos.',
      });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      addToast({
        type: 'warning',
        title: 'Senhas divergentes',
        description: 'A nova senha e a confirmação devem ser idênticas.',
      });
      return;
    }

    setIsLoading(true);
    try {
      await authService.resetPassword({
        email: email.trim(),
        resetToken: token.trim(),
        newPassword,
        confirmNewPassword,
      });

      addToast({
        type: 'success',
        title: 'Senha alterada com sucesso!',
        description: 'Você já pode realizar login com sua nova credencial.',
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao resetar senha:', err);
      const isInvalidToken = err?.status === 401 || err?.message?.includes('token');

      if (isInvalidToken) {
        setAttemptsInfo(
          'Token incorreto ou expirado. Lembre-se: 3 tentativas incorretas revogam o token.'
        );
      }

      addToast({
        type: 'error',
        title: 'Erro na redefinição',
        description: err.message || 'Código de reset inválido ou expirado.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Validar Código & Nova Senha"
      subtitle="Digite o token recebido no e-mail e sua nova senha segura."
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label" htmlFor="reset-email">
            E-mail
          </label>
          <input
            id="reset-email"
            type="email"
            className="form-input"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label text-center">Código de Verificação (6 dígitos)</label>
          <OtpInput value={token} onChange={setToken} disabled={isLoading} />
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginTop: '0.75rem',
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleResendCode}
              disabled={isLoading || isResending || resendCooldown > 0 || !email.trim()}
              style={{ fontSize: '0.85rem' }}
            >
              {isResending ? (
                <span className="btn-spinner-content">
                  <span className="spinner-small" /> Reenviando...
                </span>
              ) : resendCooldown > 0 ? (
                <>
                  <Timer size={14} /> Reenviar em {resendCooldown}s
                </>
              ) : (
                <>
                  <Send size={14} /> Reenviar código
                </>
              )}
            </button>
          </div>
        </div>

        {attemptsInfo && (
          <div className="alert-box alert-warning">
            <ShieldAlert size={16} />
            <span>{attemptsInfo}</span>
          </div>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="reset-new-password">
            Nova Senha
          </label>
          <div className="input-icon-wrapper">
            <Lock className="input-icon" size={18} />
            <input
              id="reset-new-password"
              type={showPassword ? 'text' : 'password'}
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
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="reset-confirm-password">
            Confirmar Nova Senha
          </label>
          <div className="input-icon-wrapper">
            <KeyRound className="input-icon" size={18} />
            <input
              id="reset-confirm-password"
              type={showPassword ? 'text' : 'password'}
              className="form-input with-icon"
              placeholder="Repita a nova senha"
              value={confirmNewPassword}
              onChange={e => setConfirmNewPassword(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            Voltar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading || token.length !== 6}
          >
            {isLoading ? (
              <span className="btn-spinner-content">
                <span className="spinner-small" /> Salvando...
              </span>
            ) : (
              <>
                <CheckCircle2 size={16} /> Redefinir Senha
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
