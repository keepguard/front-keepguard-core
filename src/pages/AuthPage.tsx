import React, { useState } from 'react';
import { LoginForm } from '../components/auth/LoginForm';
import { RegisterForm } from '../components/register/RegisterForm';
import { ForgotPasswordModal } from '../components/auth/ForgotPasswordModal';
import { ResetPasswordModal } from '../components/auth/ResetPasswordModal';
import { RegisterTokenModal } from '../components/register/RegisterTokenModal';
import { useAuth } from '../context/AuthContext';
import type { RegisterConfirmResponse } from '../types/register';

export const AuthPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const { login } = useAuth();

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
  } | null>(null);

  const handleForgotPasswordSuccess = (email: string) => {
    setResetEmail(email);
    setIsResetModalOpen(true);
  };

  const handleRegisterSuccess = (data: { email: string; phone: string; sessionId: string; requiredChannels: string[] }) => {
    setRegisterSessionData(data);
    setIsRegisterTokenModalOpen(true);
  };

  const handleRegisterConfirmSuccess = (response: RegisterConfirmResponse) => {
    if (response.token && registerSessionData?.email) {
      login(
        {
          accessToken: response.token,
          refreshToken: response.token,
          token: response.token,
          email: registerSessionData.email,
          username: registerSessionData.email,
        },
        registerSessionData.email
      );
    } else {
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

          <div className="auth-tabs" role="tablist" aria-label="Autenticação">
            <button
              type="button"
              role="tab"
              id="auth-tab-login"
              aria-selected={activeTab === 'login'}
              aria-controls="auth-tabpanel"
              className={`auth-tab-btn ${activeTab === 'login' ? 'active' : ''}`}
              onClick={() => setActiveTab('login')}
            >
              Entrar
            </button>
            <button
              type="button"
              role="tab"
              id="auth-tab-register"
              aria-selected={activeTab === 'register'}
              aria-controls="auth-tabpanel"
              className={`auth-tab-btn ${activeTab === 'register' ? 'active' : ''}`}
              onClick={() => setActiveTab('register')}
            >
              Criar Conta
            </button>
          </div>

          <div
            id="auth-tabpanel"
            role="tabpanel"
            aria-labelledby={activeTab === 'login' ? 'auth-tab-login' : 'auth-tab-register'}
          >
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
