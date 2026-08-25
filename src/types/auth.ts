export interface User {
  id?: string;
  codeUser: string;
  username: string;
  name?: string;
  email: string;
  roles?: string[];
  tenantId: string;
}

export interface AuthLoginRequest {
  username: string;
  password: string;
}

export interface AvailableMfaChannel {
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP';
  targetMasked: string;
  description: string;
}

export interface AuthLoginResponse {
  accessToken?: string;
  token?: string;
  refreshToken?: string;
  tokenType?: string;
  expiresIn?: number;
  expiresInSeconds?: number;
  codeUser?: string;
  username?: string;
  name?: string;
  email?: string;
  roles?: string[];
  tenantId?: string;
  status?: 'AUTHENTICATED' | 'MFA_REQUIRED';
  challengeSessionId?: string;
  isTrusted?: boolean;
  availableChannels?: AvailableMfaChannel[];
}

export interface DeviceChallengeSendRequest {
  challengeSessionId: string;
  channel: string;
}

export interface DeviceChallengeVerifyRequest {
  challengeSessionId: string;
  code: string;
  trustDevice?: boolean;
}

export interface DeviceSession {
  sessionId: string;
  deviceId: string;
  deviceName: string;
  deviceType: string;
  ipAddress: string;
  location: string;
  isCurrent: boolean;
  isTrusted: boolean;
  lastActiveAt: string;
  createdAt: string;
}

export interface RefreshTokenRequest {
  token: string;
}

export interface RefreshTokenResponse {
  accessToken?: string;
  token?: string;
  refreshToken?: string;
  expiresIn?: number;
  expiresInSeconds?: number;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  resetToken: string;
  newPassword: string;
  confirmNewPassword: string;
}

export interface HealthResponse {
  status: string;
  service?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface ApiErrorResponse {
  error?: string;
  message?: string;
  title?: string;
  detail?: string;
  errorCode?: string;
  traceId?: string;
}
