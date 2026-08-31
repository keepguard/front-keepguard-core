import type {
  AuthLoginRequest,
  AuthLoginResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  HealthResponse,
  DeviceBlacklistEntry,
  AddDeviceBlacklistRequest,
  AdminAddDeviceBlacklistRequest,
  AdminBlacklistSearchParams,
  PaginatedDeviceBlacklist,
  TenantSessionSearchParams,
  PaginatedDeviceSessions,
  MeProfile,
  AccountLifecycleRequest,
} from '../types/auth';
import { BFF_AUTH_URL, BFF_CORE_URL, customFetch } from './api';

export const authService = {
  async getHealth(): Promise<HealthResponse> {
    return customFetch<HealthResponse>(`${BFF_AUTH_URL}/health`, {
      method: 'GET',
    });
  },

  async getCoreHealth(): Promise<HealthResponse> {
    return customFetch<HealthResponse>(`${BFF_CORE_URL}/health`, {
      method: 'GET',
    });
  },

  async login(payload: AuthLoginRequest): Promise<AuthLoginResponse> {
    return customFetch<AuthLoginResponse>(`${BFF_AUTH_URL}/api/v1/auth/login`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async refresh(payload: RefreshTokenRequest): Promise<RefreshTokenResponse> {
    return customFetch<RefreshTokenResponse>(`${BFF_AUTH_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async validateToken(token: string): Promise<void> {
    return customFetch<void>(`${BFF_AUTH_URL}/api/v1/auth/validate`, {
      method: 'POST',
      body: JSON.stringify({ token }),
    }, token);
  },

  async logout(token?: string): Promise<{ success: boolean; message: string }> {
    return customFetch<{ success: boolean; message: string }>(`${BFF_AUTH_URL}/api/v1/auth/logout`, {
      method: 'POST',
      body: JSON.stringify({ token: token || '' }),
    }, token);
  },

  async changePassword(payload: ChangePasswordRequest, token: string): Promise<void> {
    return customFetch<void>(`${BFF_AUTH_URL}/api/v1/auth/change-password`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token);
  },

  async forgotPassword(payload: ForgotPasswordRequest): Promise<{ success: boolean; message: string }> {
    return customFetch<{ success: boolean; message: string }>(`${BFF_AUTH_URL}/api/v1/auth/forgot-password`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async resetPassword(payload: ResetPasswordRequest): Promise<{ success: boolean; message: string }> {
    return customFetch<{ success: boolean; message: string }>(`${BFF_AUTH_URL}/api/v1/auth/reset-password`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async sendDeviceChallenge(payload: { challengeSessionId: string; channel: string }): Promise<{ message: string; channel: string; expiresIn: number; resendCooldown: number }> {
    return customFetch<{ message: string; channel: string; expiresIn: number; resendCooldown: number }>(`${BFF_AUTH_URL}/api/v1/auth/device/challenge/send`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async verifyDeviceChallenge(payload: { challengeSessionId: string; code: string; trustDevice?: boolean }): Promise<AuthLoginResponse> {
    return customFetch<AuthLoginResponse>(`${BFF_AUTH_URL}/api/v1/auth/device/challenge/verify`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async listUserSessions(token: string): Promise<import('../types/auth').DeviceSession[]> {
    return customFetch<import('../types/auth').DeviceSession[]>(`${BFF_AUTH_URL}/api/v1/users/me/sessions`, {
      method: 'GET',
    }, token);
  },

  async revokeSession(deviceId: string, token: string): Promise<void> {
    return customFetch<void>(`${BFF_AUTH_URL}/api/v1/users/me/sessions/${deviceId}`, {
      method: 'DELETE',
    }, token);
  },

  async revokeAllOtherSessions(token: string): Promise<void> {
    return customFetch<void>(`${BFF_AUTH_URL}/api/v1/users/me/sessions`, {
      method: 'DELETE',
    }, token);
  },

  async listMyDeviceBlacklist(token: string): Promise<DeviceBlacklistEntry[]> {
    const data = await customFetch<DeviceBlacklistEntry[] | { content?: DeviceBlacklistEntry[] }>(
      `${BFF_AUTH_URL}/api/v1/users/me/devices/blacklist`,
      { method: 'GET' },
      token
    );
    if (Array.isArray(data)) {
      return data;
    }
    return data?.content || [];
  },

  async addMyDeviceToBlacklist(payload: AddDeviceBlacklistRequest, token: string): Promise<void> {
    return customFetch<void>(`${BFF_AUTH_URL}/api/v1/users/me/devices/blacklist`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token);
  },

  async removeMyDeviceFromBlacklist(deviceId: string, token: string): Promise<void> {
    return customFetch<void>(
      `${BFF_AUTH_URL}/api/v1/users/me/devices/blacklist/${encodeURIComponent(deviceId)}`,
      { method: 'DELETE' },
      token
    );
  },

  async searchTenantDeviceBlacklist(
    params: AdminBlacklistSearchParams,
    token: string
  ): Promise<PaginatedDeviceBlacklist> {
    const query = new URLSearchParams();
    if (params.userId) query.set('userId', params.userId);
    if (params.deviceId) query.set('deviceId', params.deviceId);
    if (params.deviceName) query.set('deviceName', params.deviceName);
    if (params.ipAddress) query.set('ipAddress', params.ipAddress);
    if (params.startDate) query.set('startDate', params.startDate);
    if (params.endDate) query.set('endDate', params.endDate);
    query.set('page', String(params.page ?? 0));
    query.set('size', String(params.size ?? 20));
    query.set('sort', params.sort || 'blockedAt,desc');

    const data = await customFetch<any>(
      `${BFF_AUTH_URL}/api/v1/devices/blacklist?${query.toString()}`,
      { method: 'GET' },
      token
    );

    const content: DeviceBlacklistEntry[] = Array.isArray(data)
      ? data
      : (data?.content || []);
    const page = data?.number ?? data?.page ?? params.page ?? 0;
    const size = data?.size ?? params.size ?? 20;
    const totalElements = data?.totalElements ?? content.length;
    const totalPages = data?.totalPages ?? 1;

    return {
      content,
      page,
      size,
      totalElements,
      totalPages,
      first: data?.first ?? page <= 0,
      last: data?.last ?? page >= totalPages - 1,
    };
  },

  async searchAdminDeviceBlacklist(
    params: AdminBlacklistSearchParams,
    token: string
  ): Promise<PaginatedDeviceBlacklist> {
    return authService.searchTenantDeviceBlacklist(params, token);
  },

  async adminAddDeviceToBlacklist(payload: AdminAddDeviceBlacklistRequest, token: string): Promise<void> {
    return customFetch<void>(
      `${BFF_AUTH_URL}/api/v1/users/${encodeURIComponent(payload.userId)}/devices/blacklist`,
      {
        method: 'POST',
        body: JSON.stringify({
          deviceId: payload.deviceId,
          deviceName: payload.deviceName,
          reason: payload.reason,
          expiresAt: payload.expiresAt,
        }),
      },
      token
    );
  },

  async adminRemoveDeviceFromBlacklist(deviceId: string, userId: string, token: string): Promise<void> {
    return customFetch<void>(
      `${BFF_AUTH_URL}/api/v1/users/${encodeURIComponent(userId)}/devices/blacklist/${encodeURIComponent(deviceId)}`,
      { method: 'DELETE' },
      token
    );
  },

  async searchTenantSessions(
    params: TenantSessionSearchParams,
    token: string
  ): Promise<PaginatedDeviceSessions> {
    const query = new URLSearchParams();
    if (params.userId) query.set('userId', params.userId);
    if (params.deviceId) query.set('deviceId', params.deviceId);
    query.set('page', String(params.page ?? 0));
    query.set('size', String(params.size ?? 20));
    query.set('sort', params.sort || 'lastActiveAt,desc');

    const data = await customFetch<any>(
      `${BFF_AUTH_URL}/api/v1/sessions?${query.toString()}`,
      { method: 'GET' },
      token
    );

    const content: import('../types/auth').DeviceSession[] = Array.isArray(data)
      ? data
      : (data?.content || []);
    const page = data?.number ?? data?.page ?? params.page ?? 0;
    const size = data?.size ?? params.size ?? 20;
    const totalElements = data?.totalElements ?? content.length;
    const totalPages = data?.totalPages ?? 1;

    return {
      content,
      page,
      size,
      totalElements,
      totalPages,
      first: data?.first ?? page <= 0,
      last: data?.last ?? page >= totalPages - 1,
    };
  },

  async revokeTenantUserSession(userId: string, deviceId: string, token: string): Promise<void> {
    return customFetch<void>(
      `${BFF_AUTH_URL}/api/v1/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(deviceId)}`,
      { method: 'DELETE' },
      token
    );
  },

  async getMe(token: string): Promise<MeProfile> {
    return customFetch<MeProfile>(`${BFF_CORE_URL}/api/v1/users/me`, {
      method: 'GET',
    }, token);
  },

  async blockMe(payload: AccountLifecycleRequest, token: string): Promise<void> {
    return customFetch<void>(`${BFF_AUTH_URL}/api/v1/users/me/block`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token);
  },

  async deleteMe(payload: AccountLifecycleRequest, token: string): Promise<void> {
    return customFetch<void>(`${BFF_AUTH_URL}/api/v1/users/me`, {
      method: 'DELETE',
      body: JSON.stringify(payload),
    }, token);
  },
};
