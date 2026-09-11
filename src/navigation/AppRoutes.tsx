import React from 'react';
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  AccountPage,
  AdminBlacklistPage,
  AgentIncidentsPage,
  AgentsPage,
  DataSourcesPage,
  AuditsPage,
  LlmPage,
  BillingOrgPage,
  BillingPage,
  ClientSystemPage,
  ConnectionsPage,
  GuardianPage,
  KnowledgePage,
  MarketAnalyzePage,
  MarketDeskPage,
  SessionsPage,
  SettingsPage,
  TemplatesPage,
  TenantSessionsPage,
  UserBlacklistPage,
} from '../pages/DashboardPage';
import { canReadAudits, canReadLlm, canReadSession, canReadCollector, canReadGuardian, canReadOAuth, canReadOps, canReadKnowledge, canSeeBillingOrg, canSeeBillingStorefront, hasAdminRole } from '../utils/roles';
import { AppLayout } from './AppLayout';
import { PATHS } from './routes';
import { RequireAccess } from './RequireAccess';

function BillingLegacyRedirect() {
  const { user, accessToken } = useAuth();
  if (canSeeBillingOrg(accessToken, user?.roles)) {
    return <Navigate to={PATHS.billingOrg} replace />;
  }
  if (canSeeBillingStorefront(accessToken, user?.roles)) {
    return <Navigate to={PATHS.billing} replace />;
  }
  return <Navigate to={PATHS.market} replace />;
}

function MarketWatchlistRedirect() {
  const [params] = useSearchParams();
  const ticker = params.get('ticker')?.trim();
  const to = ticker
    ? `${PATHS.market}?ticker=${encodeURIComponent(ticker)}`
    : PATHS.market;
  return <Navigate to={to} replace />;
}

export const AppRoutes: React.FC = () => {
  const { user, accessToken } = useAuth();
  const canSeeTenantDevices = canReadSession(accessToken, user?.roles);
  const canSeeAdmin = hasAdminRole(user?.roles);
  const canSeeCollector = canReadCollector(accessToken, user?.roles);
  const canSeeGuardian = canReadGuardian(accessToken, user?.roles);
  const canSeeOAuth = canReadOAuth(accessToken, user?.roles);
  const canSeeOps = canReadOps(accessToken, user?.roles);
  const canSeeKnowledge = canReadKnowledge(accessToken, user?.roles);
  const canSeeAudits = canReadAudits(accessToken, user?.roles);
  const canSeeLlm = canReadLlm(accessToken, user?.roles);
  const canSeeBillingStorefrontNav = canSeeBillingStorefront(accessToken, user?.roles);
  const canSeeBillingOrgNav = canSeeBillingOrg(accessToken, user?.roles);

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path={PATHS.overview} element={<Navigate to={PATHS.market} replace />} />
        <Route path={PATHS.market} element={<MarketDeskPage />} />
        <Route path={PATHS.sessions} element={<SessionsPage />} />
        <Route path={PATHS.blacklist} element={<UserBlacklistPage />} />
        <Route
          path={PATHS.tenantSessions}
          element={(
            <RequireAccess allowed={canSeeTenantDevices} description="Somente ADMIN, SYSTEM ou quem tiver session:read veem as sessões da organização.">
              <TenantSessionsPage />
            </RequireAccess>
          )}
        />
        <Route
          path={PATHS.adminBlacklist}
          element={(
            <RequireAccess allowed={canSeeTenantDevices} description="Somente ADMIN, SYSTEM ou quem tiver session:read veem os bloqueios da organização.">
              <AdminBlacklistPage />
            </RequireAccess>
          )}
        />
        <Route
          path={PATHS.connections}
          element={(
            <RequireAccess allowed={canSeeOps} description="Somente ADMIN, SYSTEM ou quem tiver ops:read consultam as conexões.">
              <ConnectionsPage />
            </RequireAccess>
          )}
        />
        <Route
          path={PATHS.guardian}
          element={(
            <RequireAccess allowed={canSeeGuardian} description="Somente ADMIN, SYSTEM ou quem tiver guardian:read acessam o Guardian.">
              <GuardianPage />
            </RequireAccess>
          )}
        />
        <Route
          path={PATHS.clientSystem}
          element={(
            <RequireAccess allowed={canSeeOAuth} description="Somente ADMIN, SYSTEM ou quem tiver oauth:read gerenciam OAuth clients.">
              <ClientSystemPage />
            </RequireAccess>
          )}
        />
        <Route
          path={PATHS.agentIncidents}
          element={(
            <RequireAccess allowed={canSeeCollector} description="Somente ADMIN, SYSTEM ou quem tiver collector:read consultam incidentes de coleta.">
              <AgentIncidentsPage />
            </RequireAccess>
          )}
        />
        <Route
          path={PATHS.agents}
          element={(
            <RequireAccess allowed={canSeeCollector} description="Somente ADMIN, SYSTEM ou quem tiver collector:read gerenciam agents.">
              <AgentsPage />
            </RequireAccess>
          )}
        />
        <Route
          path={PATHS.dataSources}
          element={(
            <RequireAccess allowed={canSeeCollector} description="Somente ADMIN, SYSTEM ou quem tiver collector:read gerenciam fontes de dados.">
              <DataSourcesPage />
            </RequireAccess>
          )}
        />
        <Route
          path={PATHS.knowledge}
          element={(
            <RequireAccess allowed={canSeeKnowledge} description="Somente ADMIN, SYSTEM ou quem tiver knowledge:read consultam o conhecimento.">
              <KnowledgePage />
            </RequireAccess>
          )}
        />
        <Route
          path={PATHS.marketAnalyze}
          element={(
            <RequireAccess allowed={canSeeAdmin} description="Somente ADMIN ou SYSTEM analisam ativos.">
              <MarketAnalyzePage />
            </RequireAccess>
          )}
        />
        <Route path={PATHS.marketWatchlist} element={<MarketWatchlistRedirect />} />
        <Route
          path={PATHS.audits}
          element={(
            <RequireAccess allowed={canSeeAudits} description="Somente ADMIN, SYSTEM ou quem tiver audit:read consultam a auditoria.">
              <AuditsPage />
            </RequireAccess>
          )}
        />
        <Route
          path={PATHS.llm}
          element={(
            <RequireAccess allowed={canSeeLlm} description="Somente ADMIN, SYSTEM ou quem tiver llm:read consultam o uso de LLM.">
              <LlmPage />
            </RequireAccess>
          )}
        />
        <Route
          path={PATHS.billing}
          element={(
            <RequireAccess allowed={canSeeBillingStorefrontNav} description="USER com billing:read, ADMIN ou SYSTEM acessam os planos e a própria assinatura.">
              <BillingPage />
            </RequireAccess>
          )}
        />
        <Route
          path={PATHS.billingOrg}
          element={(
            <RequireAccess allowed={canSeeBillingOrgNav} description="Somente ADMIN, SYSTEM ou MANAGER com billing:read acessam o Billing da organização.">
              <BillingOrgPage />
            </RequireAccess>
          )}
        />
        <Route path={PATHS.billingOrgLegacy} element={<Navigate to={PATHS.billingOrg} replace />} />
        <Route path={PATHS.billingLegacy} element={<BillingLegacyRedirect />} />
        <Route path={PATHS.templates} element={<TemplatesPage />} />
        <Route path={PATHS.account} element={<AccountPage />} />
        <Route
          path={PATHS.settings}
          element={(
            <RequireAccess allowed={canSeeAdmin} description="Somente usuários ADMIN ou SYSTEM acessam as configurações.">
              <SettingsPage />
            </RequireAccess>
          )}
        />
        <Route path="*" element={<Navigate to={PATHS.market} replace />} />
      </Route>
    </Routes>
  );
};
