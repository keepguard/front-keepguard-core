import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  AccountPage,
  AdminBlacklistPage,
  AgentIncidentsPage,
  AgentsPage,
  DataSourcesPage,
  AuditsPage,
  ClientSystemPage,
  ConnectionsPage,
  GuardianPage,
  KnowledgePage,
  MarketAnalyzePage,
  OverviewPage,
  SessionsPage,
  SettingsPage,
  TemplatesPage,
  TenantSessionsPage,
  UserBlacklistPage,
} from '../pages/DashboardPage';
import { canAccessTenantDevices, canReadAudits, hasAdminOrManagerRole, hasAdminRole } from '../utils/roles';
import { AppLayout } from './AppLayout';
import { PATHS } from './routes';
import { RequireAccess } from './RequireAccess';

export const AppRoutes: React.FC = () => {
  const { user, accessToken } = useAuth();
  const canSeeTenantDevices = canAccessTenantDevices(user?.roles);
  const canSeeAdmin = hasAdminRole(user?.roles);
  const canSeeAgentIncidents = hasAdminOrManagerRole(user?.roles);
  const canSeeAudits = canReadAudits(accessToken, user?.roles);

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path={PATHS.overview} element={<OverviewPage />} />
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
        <Route
          path={PATHS.audits}
          element={(
            <RequireAccess allowed={canSeeAudits} description="Somente ADMIN, SYSTEM ou quem tiver audit:read consultam a auditoria.">
              <AuditsPage />
            </RequireAccess>
          )}
        />
        <Route path={PATHS.templates} element={<TemplatesPage />} />
        <Route path={PATHS.account} element={<AccountPage />} />
        <Route path={PATHS.settings} element={<SettingsPage />} />
        <Route path="*" element={<Navigate to={PATHS.overview} replace />} />
      </Route>
    </Routes>
  );
};
