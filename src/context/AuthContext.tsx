import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { User, AuthLoginResponse } from '../types/auth';
import { authService } from '../services/authService';

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  lastRefreshTime: Date | null;
  refreshCount: number;
  login: (data: AuthLoginResponse, username: string) => void;
  logout: () => Promise<void>;
  performRefreshToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'keepguard_access_token';
const REFRESH_STORAGE_KEY = 'keepguard_refresh_token';
const USER_STORAGE_KEY = 'keepguard_user';
const LAST_REFRESH_STORAGE_KEY = 'keepguard_last_refresh_time';
const REFRESH_COUNT_STORAGE_KEY = 'keepguard_refresh_count';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem(USER_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  });
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  });
  const [refreshToken, setRefreshToken] = useState<string | null>(() => {
    return localStorage.getItem(REFRESH_STORAGE_KEY);
  });
  const [isLoading] = useState<boolean>(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(() => {
    const saved = localStorage.getItem(LAST_REFRESH_STORAGE_KEY);
    return saved ? new Date(saved) : null;
  });
  const [refreshCount, setRefreshCount] = useState<number>(() => {
    const saved = localStorage.getItem(REFRESH_COUNT_STORAGE_KEY);
    return saved ? parseInt(saved, 10) || 0 : 0;
  });

  const lastActivityRef = useRef<number>(Date.now());
  const isRefreshingRef = useRef<boolean>(false);

  // Monitorar atividade do usuário (mouse, teclado, clique)
  useEffect(() => {
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

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

  const parseJwt = (token: string) => {
    try {
      const base64Url = token.split('.')[1];
      if (!base64Url) return null;
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  };

  const login = useCallback((data: AuthLoginResponse, username: string) => {
    const token = data.accessToken || data.token || '';
    const rToken = data.refreshToken || token;
    const claims = parseJwt(token);

    const userData: User = {
      codeUser: data.codeUser || claims?.sub || '',
      username: data.username || username,
      name: data.name || claims?.name || username,
      email: data.email || (username.includes('@') ? username : `${username}@keepguard.local`),
      roles: data.roles || claims?.roles || ['USER'],
      tenantId: data.tenantId || claims?.tenant_id || 'f7fc7350-b9fc-4e54-9c58-ac9385b23ae3',
    };

    setAccessToken(token);
    setRefreshToken(rToken);
    setUser(userData);
    setLastRefreshTime(null);
    setRefreshCount(0);

    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(REFRESH_STORAGE_KEY, rToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
    localStorage.removeItem(LAST_REFRESH_STORAGE_KEY);
    localStorage.setItem(REFRESH_COUNT_STORAGE_KEY, '0');
    lastActivityRef.current = Date.now();
  }, []);

  const logout = useCallback(async () => {
    try {
      const token = accessToken || localStorage.getItem(TOKEN_STORAGE_KEY);
      if (token) {
        await authService.logout(token);
      }
    } catch (e) {
      console.warn('Erro ao efetuar logout no servidor:', e);
    } finally {
      setAccessToken(null);
      setRefreshToken(null);
      setUser(null);
      setLastRefreshTime(null);
      setRefreshCount(0);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(REFRESH_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
      localStorage.removeItem(LAST_REFRESH_STORAGE_KEY);
      localStorage.removeItem(REFRESH_COUNT_STORAGE_KEY);
    }
  }, [accessToken]);

  const performRefreshToken = useCallback(async (): Promise<boolean> => {
    const tokenToUse = refreshToken || localStorage.getItem(REFRESH_STORAGE_KEY) || accessToken || localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!tokenToUse || isRefreshingRef.current) {
      return false;
    }

    try {
      isRefreshingRef.current = true;
      const res = await authService.refresh({ token: tokenToUse });
      const newAccess = res.accessToken || res.token;
      // No KeepGuard, a API retorna { token, expiresIn } que é o novo token JWT ativo
      const newRefresh = res.refreshToken || res.token || res.accessToken || tokenToUse;

      if (newAccess) {
        setAccessToken(newAccess);
        localStorage.setItem(TOKEN_STORAGE_KEY, newAccess);
      }
      if (newRefresh) {
        setRefreshToken(newRefresh);
        localStorage.setItem(REFRESH_STORAGE_KEY, newRefresh);
      }

      const now = new Date();
      setLastRefreshTime(now);
      localStorage.setItem(LAST_REFRESH_STORAGE_KEY, now.toISOString());

      setRefreshCount(prev => {
        const next = prev + 1;
        localStorage.setItem(REFRESH_COUNT_STORAGE_KEY, next.toString());
        return next;
      });

      lastActivityRef.current = Date.now();
      return true;
    } catch (err: any) {
      console.error('Falha ao renovar token:', err);
      // Se refresh token for rejeitado com 401 ou revogado, finaliza a sessão
      if (err?.status === 401 || err?.data?.errorCode === 'TOKEN_REVOKED' || err?.data?.errorCode === 'INVALID_TOKEN') {
        await logout();
      }
      return false;
    } finally {
      isRefreshingRef.current = false;
    }
  }, [refreshToken, accessToken, logout]);

  // Intervalo de auto-refresh se usuário esteve ativo nos últimos 5 minutos
  useEffect(() => {
    if (!accessToken && !localStorage.getItem(TOKEN_STORAGE_KEY)) return;

    // Checa a cada 45 segundos se deve renovar
    const interval = setInterval(() => {
      const now = Date.now();
      const inactiveDuration = now - lastActivityRef.current;
      const fiveMinutes = 5 * 60 * 1000;

      // Se o usuário interagiu recentemente, renova proativamente
      if (inactiveDuration < fiveMinutes) {
        performRefreshToken();
      }
    }, 45 * 1000);

    return () => clearInterval(interval);
  }, [accessToken, performRefreshToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        refreshToken,
        isAuthenticated: !!accessToken,
        isLoading,
        lastRefreshTime,
        refreshCount,
        login,
        logout,
        performRefreshToken,
      }}
    >
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
