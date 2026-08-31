import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from 'react';
import type { User, AuthLoginResponse } from '../types/auth';
import { authService } from '../services/authService';
import {
  clearProactiveRefresh,
  clearTokens,
  ensureFreshToken,
  getAccessToken,
  getRefreshToken,
  getTokenMetaSnapshot,
  hydrateFromStorage,
  markActivity,
  onSessionEnded,
  parseJwtPayload,
  resetRefreshMeta,
  scheduleProactiveRefresh,
  setRefreshExecutor,
  setTokens,
  subscribe,
  USER_STORAGE_KEY,
} from '../services/tokenStore';

interface AuthContextType {
  user: User | null;
  /**
   * Preferir getAccessToken() na hora da chamada HTTP.
   * Este campo só muda em login/logout (não a cada refresh).
   */
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  isLoading: boolean;
  getAccessToken: () => string | null;
  login: (data: AuthLoginResponse, username: string) => void;
  logout: () => Promise<void>;
  performRefreshToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function rolesFromJwt(token?: string | null): string[] {
  if (!token) return [];
  const claims = parseJwtPayload(token);
  const roles = claims?.roles;
  return Array.isArray(roles) ? roles.filter((r: unknown): r is string => typeof r === 'string') : [];
}

function readStoredUser(token: string | null): User | null {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem(USER_STORAGE_KEY);
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved) as User;
    const jwtRoles = rolesFromJwt(token);
    if (parsed && jwtRoles.length > 0) {
      return { ...parsed, roles: jwtRoles };
    }
    return parsed;
  } catch {
    return null;
  }
}

setRefreshExecutor(async (token) => authService.refresh({ token }));

/**
 * Hook opcional: só telas que precisam mostrar o JWT / métricas de refresh
 * (ex.: SecurityCredentialsView). Não usar no layout geral.
 */
export function useTokenMeta() {
  return useSyncExternalStore(subscribe, getTokenMetaSnapshot, getTokenMetaSnapshot);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const hydrated = useMemo(() => hydrateFromStorage(), []);
  const [user, setUser] = useState<User | null>(() => readStoredUser(hydrated.accessToken));
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!hydrated.accessToken);
  const [isInitializing, setIsInitializing] = useState<boolean>(() => !!hydrated.accessToken);
  // Epoch só muda em login/logout — mantém accessToken estável no Context entre refreshes
  const [sessionEpoch, setSessionEpoch] = useState(0);

  const login = useCallback((data: AuthLoginResponse, username: string) => {
    const token = data.accessToken || data.token || '';
    const rToken = data.refreshToken || token;
    const claims = parseJwtPayload(token);
    const jwtRoles = rolesFromJwt(token);

    const userData: User = {
      codeUser: data.codeUser || (typeof claims?.sub === 'string' ? claims.sub : '') || '',
      username: data.username || username,
      name: data.name || (typeof claims?.name === 'string' ? claims.name : username),
      email: data.email || (username.includes('@') ? username : `${username}@keepguard.local`),
      roles: (data.roles && data.roles.length > 0) ? data.roles : (jwtRoles.length > 0 ? jwtRoles : ['USER']),
      tenantId: data.tenantId
        || (typeof claims?.tenant_id === 'string' ? claims.tenant_id : undefined)
        || 'f7fc7350-b9fc-4e54-9c58-ac9385b23ae3',
    };

    setTokens(token, rToken);
    resetRefreshMeta();
    setUser(userData);
    setIsAuthenticated(true);
    setIsInitializing(false);
    setSessionEpoch((n) => n + 1);

    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
    markActivity();
    scheduleProactiveRefresh();
  }, []);

  const endSessionLocally = useCallback(() => {
    clearProactiveRefresh();
    clearTokens({ notifySessionEnded: false });
    setUser(null);
    setIsAuthenticated(false);
    setIsInitializing(false);
    setSessionEpoch((n) => n + 1);
  }, []);

  const logout = useCallback(async () => {
    try {
      const token = getAccessToken();
      if (token) {
        await authService.logout(token);
      }
    } catch (e) {
      console.warn('Erro ao efetuar logout no servidor:', e);
    } finally {
      endSessionLocally();
    }
  }, [endSessionLocally]);

  const performRefreshToken = useCallback(async (): Promise<boolean> => {
    markActivity();
    return ensureFreshToken({ force: true });
  }, []);

  useEffect(() => {
    onSessionEnded(() => {
      setUser(null);
      setIsAuthenticated(false);
      setIsInitializing(false);
      setSessionEpoch((n) => n + 1);
    });
    return () => onSessionEnded(null);
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setIsAuthenticated(false);
      setIsInitializing(false);
      setSessionEpoch((n) => n + 1);
    };
    window.addEventListener('keepguard_auth_unauthorized', handleUnauthorized);
    return () => window.removeEventListener('keepguard_auth_unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    const handleActivity = () => markActivity();
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('click', handleActivity);
    window.addEventListener('scroll', handleActivity);
    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('scroll', handleActivity);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const token = getAccessToken();
      if (!token) {
        setIsInitializing(false);
        return;
      }

      try {
        await authService.validateToken(token);
        if (cancelled) return;
        scheduleProactiveRefresh();
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        const errorCode = (err as { data?: { error?: string; errorCode?: string } })?.data?.errorCode
          || (err as { data?: { error?: string } })?.data?.error;

        if (status === 401 || errorCode === 'TOKEN_REVOKED' || errorCode === 'INVALID_TOKEN') {
          const refreshed = await ensureFreshToken({ force: true });
          if (cancelled) return;
          if (!refreshed) {
            endSessionLocally();
          } else {
            scheduleProactiveRefresh();
          }
        } else {
          scheduleProactiveRefresh();
        }
      } finally {
        if (!cancelled) {
          setIsInitializing(false);
        }
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [endSessionLocally]);

  const value = useMemo<AuthContextType>(() => ({
    user,
    accessToken: isAuthenticated ? getAccessToken() : null,
    refreshToken: isAuthenticated ? getRefreshToken() : null,
    isAuthenticated,
    isInitializing,
    isLoading: isInitializing,
    getAccessToken,
    login,
    logout,
    performRefreshToken,
  }), [
    user,
    isAuthenticated,
    isInitializing,
    sessionEpoch,
    login,
    logout,
    performRefreshToken,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
};
