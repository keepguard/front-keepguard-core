import React, { useState } from 'react';
import { Eye, EyeOff, Lock, User as UserIcon, LogIn } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { authService } from '../../services/authService';
import { DeviceChallengeModal } from './DeviceChallengeModal';
import type { AvailableMfaChannel, AuthLoginResponse } from '../../types/auth';

interface LoginFormProps {
  onForgotPasswordClick: () => void;
  onRegisterClick: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  onForgotPasswordClick,
  onRegisterClick,
}) => {
  const { login } = useAuth();
  const { addToast } = useToast();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Estados para Desafio de Dispositivo (MFA Step-Up)
  const [isChallengeOpen, setIsChallengeOpen] = useState(false);
  const [challengeSessionId, setChallengeSessionId] = useState('');
  const [availableChannels, setAvailableChannels] = useState<AvailableMfaChannel[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      addToast({
        type: 'warning',
        title: 'Campos obrigatórios',
        description: 'Por favor preencha usuário/e-mail e senha.',
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await authService.login({
        username: username.trim(),
        password,
      });

      // Se for requerido desafio MFA de dispositivo não confiável
      if (response.status === 'MFA_REQUIRED' && response.challengeSessionId) {
        setChallengeSessionId(response.challengeSessionId);
        setAvailableChannels(response.availableChannels || []);
        setIsChallengeOpen(true);
        return;
      }

      login(response, username.trim());

      addToast({
        type: 'success',
        title: 'Login efetuado com sucesso!',
        description: `Bem-vindo(a) ao KeepGuard, ${username}!`,
      });
    } catch (err: any) {
      console.error('Erro no login:', err);
      const isLocked = err?.status === 423 || err?.message?.includes('bloqueada') || err?.data?.errorCode === 'ACCOUNT_LOCKED';
      
      addToast({
        type: isLocked ? 'error' : 'error',
        title: isLocked ? 'Conta Bloqueada' : 'Falha na Autenticação',
        description: err.message || 'Credenciais inválidas. Tente novamente.',
        duration: isLocked ? 8000 : 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChallengeSuccess = (authResponse: AuthLoginResponse) => {
    setIsChallengeOpen(false);
    login(authResponse, username.trim());
    addToast({
      type: 'success',
      title: 'Dispositivo autorizado com sucesso!',
      description: `Bem-vindo(a) ao KeepGuard, ${username}!`,
    });
  };

  return (
    <>
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label" htmlFor="login-username">
            Usuário ou E-mail
          </label>
          <div className="input-icon-wrapper">
            <UserIcon className="input-icon" size={18} />
            <input
              id="login-username"
              type="text"
              className="form-input with-icon"
              placeholder="seu.email@exemplo.com"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <div className="form-label-row">
            <label className="form-label" htmlFor="login-password">
              Senha
            </label>
            <button
              type="button"
              className="link-btn"
              onClick={onForgotPasswordClick}
              tabIndex={-1}
            >
              Esqueceu a senha?
            </button>
          </div>
          <div className="input-icon-wrapper">
            <Lock className="input-icon" size={18} />
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              className="form-input with-icon with-action"
              placeholder="••••••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
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

        <button
          type="submit"
          className="btn btn-primary btn-block btn-glow"
          disabled={isLoading}
        >
          {isLoading ? (
            <span className="btn-spinner-content">
              <span className="spinner-small" /> Autenticando...
            </span>
          ) : (
            <>
              <LogIn size={18} /> Entrar na Plataforma
            </>
          )}
        </button>

        <div className="form-footer">
          <span>Não possui uma conta?</span>
          <button
            type="button"
            className="link-btn primary"
            onClick={onRegisterClick}
            disabled={isLoading}
          >
            Criar nova conta
          </button>
        </div>
      </form>

      <DeviceChallengeModal
        isOpen={isChallengeOpen}
        challengeSessionId={challengeSessionId}
        availableChannels={availableChannels}
        username={username}
        onSuccess={handleChallengeSuccess}
        onCancel={() => setIsChallengeOpen(false)}
      />
    </>
  );
};
