import React, { useState } from 'react';
import { LoginForm } from '../components/auth/LoginForm';
import { RegisterForm } from '../components/register/RegisterForm';
import { ForgotPasswordModal } from '../components/auth/ForgotPasswordModal';
import { ResetPasswordModal } from '../components/auth/ResetPasswordModal';
import { RegisterTokenModal } from '../components/register/RegisterTokenModal';
import { useAuth } from '../context/AuthContext';
import type { RegisterConfirmResponse } from '../types/register';
import { Shield, Lock, Zap, CheckCircle } from 'lucide-react';

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
      // Efetua login automático com o JWT retornado e redireciona para a área logada
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
      {/* Background glow ornaments */}
      <div className="glow-orb orb-1" />
      <div className="glow-orb orb-2" />

      <div className="auth-card-wrapper animate-fade-in">
        <div className="auth-hero-section">
          <div className="hero-badge">
            <Shield size={14} className="text-primary" />
            <span>Sistema Seguro de Identidade</span>
          </div>

          <h1 className="hero-heading">
            Proteção de Acesso <br />
            <span className="text-gradient">de Nova Geração.</span>
          </h1>

          <p className="hero-subtext">
            Plataforma de segurança com autenticação JWT de alta disponibilidade, controle contra ataques de força bruta e renovação contínua de credenciais.
          </p>

          <div className="feature-list">
            <div className="feature-item">
              <div className="feature-icon"><Lock size={16} /></div>
              <div>
                <strong>Proteção Força Bruta</strong>
                <p>Bloqueio inteligente e revogação dinâmica</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon"><Zap size={16} /></div>
              <div>
                <strong>Auto Refresh Token</strong>
                <p>Renovação proativa com detecção de atividade</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon"><CheckCircle size={16} /></div>
              <div>
                <strong>Verificação em 2 Etapas</strong>
                <p>Tokens de 6 dígitos com expiração e cooldown</p>
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

          <div className="auth-form-card">
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
