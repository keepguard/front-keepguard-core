import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { termsSyncService, type CheckTermsResult } from './services/termsSyncService';
import { TermsConsentModal } from './components/common/TermsConsentModal';
import { DEFAULT_TENANT_ID } from './services/api';

const MainContent: React.FC = () => {
  const { isAuthenticated, user, accessToken, logout } = useAuth();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [termsState, setTermsState] = useState<CheckTermsResult>({
    hasPending: false,
    pendingDocuments: [],
    tenantId: DEFAULT_TENANT_ID
  });
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);

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

  const handleLogout = async () => {
    await logout();
    setActiveTab('overview');
    addToast({
      type: 'info',
      title: 'Sessão finalizada',
      description: 'Você saiu da sua conta com segurança.',
    });
  };

  return (
    <div className="app-layout">
      <Header
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
        onNavigateTab={setActiveTab}
        onLogout={handleLogout}
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
