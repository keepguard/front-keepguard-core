import type {
  AuthLoginRequest,
  AuthLoginResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  HealthResponse,
} from '../types/auth';
import { BFF_AUTH_URL, customFetch } from './api';

export const authService = {
  async getHealth(): Promise<HealthResponse> {
    return customFetch<HealthResponse>(`${BFF_AUTH_URL}/health`, {
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
};
