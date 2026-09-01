import React, { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Sidebar } from '../components/layout/Sidebar';
import { AuthPage } from '../pages/AuthPage';
import { TermsConsentModal } from '../components/common/TermsConsentModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { DEFAULT_TENANT_ID } from '../services/api';
import { termsSyncService, type CheckTermsResult } from '../services/termsSyncService';
import { PATHS, pathFromTab, routeMetaFromPath } from './routes';

const LegacyTabRedirect: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  if (!tab) return null;

  const targetPath = pathFromTab(tab);
  const next = new URLSearchParams(searchParams);
  next.delete('tab');
  const search = next.toString();
  const to = `${targetPath}${search ? `?${search}` : ''}`;
  return <Navigate to={to} replace />;
};

export const AppLayout: React.FC = () => {
  const { isAuthenticated, isInitializing, user, getAccessToken, logout } = useAuth();
  const { addToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [termsState, setTermsState] = useState<CheckTermsResult>({
    hasPending: false,
    pendingDocuments: [],
    tenantId: DEFAULT_TENANT_ID,
  });
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);

  useEffect(() => {
    const meta = routeMetaFromPath(location.pathname);
    document.title = meta ? `${meta.title} · KeepGuard` : 'KeepGuard';
  }, [location.pathname]);

  useEffect(() => {
    if (isAuthenticated && !isInitializing && user) {
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
        window.requestIdleCallback(() => {
          void triggerTermsCheck();
        });
      } else {
        setTimeout(() => {
          void triggerTermsCheck();
        }, 1500);
      }
    } else {
      setIsTermsModalOpen(false);
    }
  }, [isAuthenticated, isInitializing, user]);

  const handleLogout = async () => {
    await logout();
    navigate(PATHS.overview, { replace: true });
    addToast({
      type: 'info',
      title: 'Sessão finalizada',
      description: 'Você saiu da sua conta com segurança.',
    });
  };

  if (isInitializing) {
    return (
      <div className="app-layout">
        <main className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}>
          <p className="text-muted">Validando sessão…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <LegacyTabRedirect />
      <Header
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
        onLogout={handleLogout}
        homeLink={isAuthenticated}
      />
      {isAuthenticated ? (
        <div className="app-body-container">
          <Sidebar
            isOpenMobile={isMobileMenuOpen}
            onCloseMobile={() => setIsMobileMenuOpen(false)}
          />
          <main className="app-content">
            <Outlet />
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
          token={getAccessToken() || undefined}
          onSuccess={() => {
            setIsTermsModalOpen(false);
            addToast({
              type: 'success',
              title: 'Termos Atualizados',
              description: 'Seu consentimento foi registrado com sucesso.',
            });
          }}
          onLogout={logout}
        />
      )}
    </div>
  );
};
