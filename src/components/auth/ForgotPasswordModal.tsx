import React, { useState, useEffect } from 'react';
import { Mail, Send, Timer, ArrowRight, ShieldAlert, KeyRound } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useToast } from '../../context/ToastContext';
import { authService } from '../../services/authService';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (email: string) => void;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { addToast } = useToast();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Limpa formulário ao fechar (mantém cooldown só para reenvio neste modal)
  useEffect(() => {
    if (!isOpen) {
      setIsLoading(false);
    }
  }, [isOpen]);

  const goToTokenStep = (targetEmail: string) => {
    onSuccess(targetEmail);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      addToast({
        type: 'warning',
        title: 'E-mail obrigatório',
        description: 'Digite o e-mail cadastrado na conta.',
      });
      return;
    }

    setIsLoading(true);
    try {
      await authService.forgotPassword({ email: email.trim() });
      addToast({
        type: 'success',
        title: 'Código enviado!',
        description: 'Enviamos um token de 6 dígitos para o seu e-mail.',
      });
      // Sucesso: abre o modal de token imediatamente.
      // Cooldown de reenvio fica no ResetPasswordModal.
      goToTokenStep(email.trim());
    } catch (err: any) {
      console.error('Erro no forgot-password:', err);
      const isRateLimit =
        err?.status === 429 ||
        err?.message?.includes('Aguarde') ||
        err?.data?.errorCode === 'TOO_MANY_REQUESTS';

      if (isRateLimit) {
        setCooldown(60);
        // Se já existe um código enviado recentemente, permite ir para a etapa do token
        addToast({
          type: 'warning',
          title: 'Aguarde para reenviar',
          description:
            'Já existe um código recente. Se você o recebeu, clique em “Já tenho o código”.',
        });
      } else {
        addToast({
          type: 'error',
          title: 'Erro ao enviar código',
          description: err.message || 'Não foi possível solicitar a recuperação de senha.',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Recuperação de Senha"
      subtitle="Informe seu e-mail para enviarmos o código de segurança."
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label" htmlFor="forgot-email">
            E-mail cadastrado
          </label>
          <div className="input-icon-wrapper">
            <Mail className="input-icon" size={18} />
            <input
              id="forgot-email"
              type="email"
              className="form-input with-icon"
              placeholder="seu.email@exemplo.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>
        </div>

        {cooldown > 0 && (
          <div className="alert-box alert-warning">
            <ShieldAlert size={16} />
            <span>
              Cooldown ativo. Aguarde <strong>{cooldown}s</strong> para solicitar um novo código.
              Se você já recebeu o e-mail, avance para informar o token.
            </span>
          </div>
        )}

        <div className="modal-actions" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancelar
          </button>

          {email.trim() && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => goToTokenStep(email.trim())}
              disabled={isLoading}
            >
              <KeyRound size={16} /> Já tenho o código
            </button>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading || cooldown > 0}
          >
            {isLoading ? (
              <span className="btn-spinner-content">
                <span className="spinner-small" /> Enviando...
              </span>
            ) : cooldown > 0 ? (
              <>
                <Timer size={16} /> Aguarde ({cooldown}s)
              </>
            ) : (
              <>
                <Send size={16} /> Enviar Código <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
