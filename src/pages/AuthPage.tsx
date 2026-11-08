import React, { useState } from 'react';
import { LoginForm } from '../components/auth/LoginForm';
import { RegisterForm } from '../components/register/RegisterForm';
import { ForgotPasswordModal } from '../components/auth/ForgotPasswordModal';
import { ResetPasswordModal } from '../components/auth/ResetPasswordModal';
import { RegisterTokenModal } from '../components/register/RegisterTokenModal';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import { useToast } from '../context/ToastContext';
import type { RegisterConfirmResponse } from '../types/register';

export const AuthPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const { login } = useAuth();
  const { addToast } = useToast();

  // Modais de recuperação de senha
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  // Modal de validação de token do cadastro
  const [isRegisterTokenModalOpen, setIsRegisterTokenModalOpen] = useState(false);
  const [registerSessionData, setRegisterSessionData] = useState<{
    email: string;
    phone: string;
    sessionId: string;
    requiredChannels: string[];
    password?: string;
  } | null>(null);

  const handleForgotPasswordSuccess = (email: string) => {
    setResetEmail(email);
    setIsResetModalOpen(true);
  };

  const handleRegisterSuccess = (data: { email: string; phone: string; sessionId: string; requiredChannels: string[]; password?: string }) => {
    setRegisterSessionData(data);
    setIsRegisterTokenModalOpen(true);
  };

  // Depois de confirmar o cadastro, entra pelo bff-auth (sessão completa, com refresh em cookie). No mesmo aparelho e com
  // só e-mail de canal de MFA, o ms-auth não pede o código de aparelho: o código do cadastro já provou o e-mail.
  // Antes, o token da confirmação ia como access e refresh ao mesmo tempo, e a sessão caía quando ele vencia.
  const handleRegisterConfirmSuccess = async (_response: RegisterConfirmResponse) => {
    const email = registerSessionData?.email;
    const password = registerSessionData?.password;
    setRegisterSessionData((d) => (d ? { ...d, password: undefined } : d));
    if (!email || !password) {
      setActiveTab('login');
      return;
    }
    try {
      const auth = await authService.login({ username: email, password });
      if (auth.status === 'MFA_REQUIRED') {
        addToast({ type: 'info', title: 'Conta criada!', description: 'Entre com seu e-mail e senha para confirmar este aparelho.' });
        setActiveTab('login');
        return;
      }
      login(auth, email);
    } catch {
      addToast({ type: 'info', title: 'Conta criada!', description: 'Entre com seu e-mail e senha.' });
      setActiveTab('login');
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card-wrapper animate-fade-in">
        <div className="auth-form-section">
          <h1 className="auth-heading">
            {activeTab === 'login' ? 'Acesse sua conta' : 'Crie sua conta'}
          </h1>

          <div key={activeTab} className="auth-view animate-fade-in">
            {activeTab === 'login' ? (
              <LoginForm
                onForgotPasswordClick={() => setIsForgotModalOpen(true)}
                onRegisterClick={() => setActiveTab('register')}
              />
            ) : (
              <RegisterForm
                onSuccess={handleRegisterSuccess}
                onBackToLogin={() => setActiveTab('login')}
              />
            )}
          </div>
        </div>
      </div>

      {/* Modais de Fluxos de Segurança */}
      <ForgotPasswordModal
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
        onSuccess={handleForgotPasswordSuccess}
      />

      <ResetPasswordModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        defaultEmail={resetEmail}
        onSuccess={() => setActiveTab('login')}
      />

      {registerSessionData && (
        <RegisterTokenModal
          isOpen={isRegisterTokenModalOpen}
          onClose={() => setIsRegisterTokenModalOpen(false)}
          email={registerSessionData.email}
          phone={registerSessionData.phone}
          sessionId={registerSessionData.sessionId}
          requiredChannels={registerSessionData.requiredChannels}
          onSuccess={handleRegisterConfirmSuccess}
        />
      )}
    </div>
  );
};
