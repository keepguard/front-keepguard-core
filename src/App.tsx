import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { authService } from './services/authService';
import { termsSyncService, type CheckTermsResult } from './services/termsSyncService';
import { TermsConsentModal } from './components/common/TermsConsentModal';
import { DEFAULT_TENANT_ID } from './services/api';

const MainContent: React.FC = () => {
  const { isAuthenticated, user, accessToken, logout } = useAuth();
  const { addToast } = useToast();
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'unhealthy' | 'checking'>('checking');
  const [activeTab, setActiveTab] = useState('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Estado para controle de consentimento de termos
  const [termsState, setTermsState] = useState<CheckTermsResult>({
    hasPending: false,
    pendingDocuments: [],
    tenantId: DEFAULT_TENANT_ID
  });
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);

  const checkHealth = async (showSuccessToast = false) => {
    setHealthStatus('checking');
    try {
      await authService.getHealth();
      setHealthStatus('healthy');
      if (showSuccessToast) {
        addToast({
          type: 'success',
          title: 'BFF-Auth Online',
          description: 'Serviço de autenticação e comunicação operando normalmente.',
        });
      }
    } catch (e) {
      setHealthStatus('unhealthy');
    }
  };

  useEffect(() => {
    checkHealth(false);
  }, []);

  // Executa checagem semanal de termos de forma não-bloqueante após login
  useEffect(() => {
    if (isAuthenticated && user) {
      const tenantId = user.tenantId || DEFAULT_TENANT_ID;
      const userId = user.id || user.codeUser;

      const triggerTermsCheck = async () => {
        const result = await termsSyncService.checkTermsOnAppOpen(tenantId, userId);
        if (result.hasPending) {
          setTermsState(result);
          setIsTermsModalOpen(true);
        }
      };

      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => triggerTermsCheck());
      } else {
        setTimeout(triggerTermsCheck, 1500);
      }
    } else {
      setIsTermsModalOpen(false);
    }
  }, [isAuthenticated, user]);

  return (
    <div className="app-layout">
      <Header
        healthStatus={healthStatus}
        onCheckHealth={() => checkHealth(true)}
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
      />
      {isAuthenticated ? (
        <div className="app-body-container">
          <Sidebar
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            isOpenMobile={isMobileMenuOpen}
            onCloseMobile={() => setIsMobileMenuOpen(false)}
          />
          <main className="app-content">
            <DashboardPage activeTab={activeTab} onNavigateTab={setActiveTab} />
          </main>
        </div>
      ) : (
        <main className="app-content">
          <AuthPage />
        </main>
      )}

      {/* Modal Bloqueante de Aceite de Termos quando pendente */}
      {isAuthenticated && user && (
        <TermsConsentModal
          isOpen={isTermsModalOpen}
          manifest={termsState.manifest}
          pendingDocuments={termsState.pendingDocuments}
          tenantId={user.tenantId || DEFAULT_TENANT_ID}
          userId={user.id || user.codeUser}
          userEmail={user.email}
          token={accessToken || undefined}
          onSuccess={() => {
            setIsTermsModalOpen(false);
            addToast({
              type: 'success',
              title: 'Termos Atualizados',
              description: 'Seu consentimento foi registrado com sucesso.'
            });
          }}
          onLogout={logout}
        />
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <MainContent />
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;
