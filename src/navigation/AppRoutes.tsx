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
import { canAccessTenantDevices, canReadAudits, canReadLlm, hasAdminOrManagerRole, hasAdminRole } from '../utils/roles';
import { AppLayout } from './AppLayout';
import { PATHS } from './routes';
import { RequireAccess } from './RequireAccess';

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
  const canSeeTenantDevices = canAccessTenantDevices(user?.roles);
  const canSeeAdmin = hasAdminRole(user?.roles);
  const canSeeAgentIncidents = hasAdminOrManagerRole(user?.roles);
  const canSeeAudits = canReadAudits(accessToken, user?.roles);
  const canSeeLlm = canReadLlm(accessToken, user?.roles);

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
            <RequireAccess allowed={canSeeTenantDevices} description="Somente ADMIN, SYSTEM ou MANAGER veem as sessões da organização.">
              <TenantSessionsPage />
            </RequireAccess>
          )}
        />
        <Route
          path={PATHS.adminBlacklist}
          element={(
            <RequireAccess allowed={canSeeTenantDevices} description="Somente ADMIN, SYSTEM ou MANAGER veem os bloqueios da organização.">
              <AdminBlacklistPage />
            </RequireAccess>
          )}
        />
        <Route
          path={PATHS.connections}
          element={(
            <RequireAccess allowed={canSeeAdmin} description="Somente ADMIN ou SYSTEM consultam as conexões.">
              <ConnectionsPage />
            </RequireAccess>
          )}
        />
        <Route
          path={PATHS.guardian}
          element={(
            <RequireAccess allowed={canSeeAdmin} description="Somente ADMIN ou SYSTEM acessam o Guardian.">
              <GuardianPage />
            </RequireAccess>
          )}
        />
        <Route
          path={PATHS.clientSystem}
          element={(
            <RequireAccess allowed={canSeeAdmin} description="Somente ADMIN ou SYSTEM gerenciam OAuth clients.">
              <ClientSystemPage />
            </RequireAccess>
          )}
        />
        <Route
          path={PATHS.agentIncidents}
          element={(
            <RequireAccess allowed={canSeeAgentIncidents} description="Somente ADMIN ou MANAGER consultam incidentes de coleta.">
              <AgentIncidentsPage />
            </RequireAccess>
          )}
        />
        <Route
          path={PATHS.agents}
          element={(
            <RequireAccess allowed={canSeeAdmin} description="Somente ADMIN ou SYSTEM gerenciam agents.">
              <AgentsPage />
            </RequireAccess>
          )}
        />
        <Route
          path={PATHS.dataSources}
          element={(
            <RequireAccess allowed={canSeeAdmin} description="Somente ADMIN ou SYSTEM gerenciam fontes de dados.">
              <DataSourcesPage />
            </RequireAccess>
          )}
        />
        <Route
          path={PATHS.knowledge}
          element={(
            <RequireAccess allowed={canSeeAdmin} description="Somente ADMIN ou SYSTEM consultam o conhecimento.">
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
        <Route path={PATHS.templates} element={<TemplatesPage />} />
        <Route path={PATHS.account} element={<AccountPage />} />
        <Route path={PATHS.settings} element={<SettingsPage />} />
        <Route path="*" element={<Navigate to={PATHS.market} replace />} />
      </Route>
    </Routes>
  );
};
