import React, { useState } from 'react';
import { LoginForm } from '../components/auth/LoginForm';
import { RegisterForm } from '../components/register/RegisterForm';
import { ForgotPasswordModal } from '../components/auth/ForgotPasswordModal';
import { ResetPasswordModal } from '../components/auth/ResetPasswordModal';
import { RegisterTokenModal } from '../components/register/RegisterTokenModal';
import { useAuth } from '../context/AuthContext';
import type { RegisterConfirmResponse } from '../types/register';
import { Shield, Lock, Zap, CheckCircle2 } from 'lucide-react';

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
        <div className="auth-hero-section">
          <div className="hero-badge">
            <Shield size={14} className="text-primary" />
            <span>Sistema Seguro de Identidade</span>
          </div>

          <h1 className="hero-heading">
            Tudo o que você precisa <br />
            para <span className="text-gradient">proteger sua aplicação.</span>
          </h1>

          <p className="hero-subtext">
            Plataforma de segurança com autenticação JWT de alta disponibilidade, proteção inteligente contra força bruta e controle unificado de tenants.
          </p>

          <div className="feature-list">
            <div className="feature-item">
              <div className="feature-icon"><Lock size={18} /></div>
              <div>
                <strong>Proteção Força Bruta</strong>
                <p>Bloqueio inteligente e revogação dinâmica de sessões</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon"><Zap size={18} /></div>
              <div>
                <strong>Auto Refresh Token</strong>
                <p>Renovação proativa de credenciais em segundo plano</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon"><CheckCircle2 size={18} /></div>
              <div>
                <strong>Verificação em 2 Etapas</strong>
                <p>Tokens de 6 dígitos com expiração e cooldown seguro</p>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-form-section">
          <div className="auth-tabs">
            <button
              className={`auth-tab-btn ${activeTab === 'login' ? 'active' : ''}`}
              onClick={() => setActiveTab('login')}
            >
              Entrar
            </button>
            <button
              className={`auth-tab-btn ${activeTab === 'register' ? 'active' : ''}`}
              onClick={() => setActiveTab('register')}
            >
              Criar Conta
            </button>
          </div>

          <div>
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
