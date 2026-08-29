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

export interface DeviceBlacklistEntry {
  id?: string;
  tenantId?: string;
  codeUser?: string;
  deviceId: string;
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
  blockedBy?: string;
  blockedAt?: string;
  expiresAt?: string;
}

export interface AddDeviceBlacklistRequest {
  deviceId: string;
  deviceName?: string;
  reason?: string;
}

export interface AdminAddDeviceBlacklistRequest {
  userId: string;
  deviceId: string;
  deviceName?: string;
  reason?: string;
  expiresAt?: string;
}

export interface AdminBlacklistSearchParams {
  userId?: string;
  deviceId?: string;
  deviceName?: string;
  ipAddress?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  size?: number;
  sort?: string;
}

export interface PaginatedDeviceBlacklist {
  content: DeviceBlacklistEntry[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
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

export interface MePersonProfile {
  fullName?: string;
}

export interface MeProfile {
  email: string;
  phoneE164?: string;
  preferredLocale?: string;
  timezone?: string;
  avatarUrl?: string;
  displayHandle?: string;
  type?: string;
  status?: string;
  createdAt?: string;
  personProfile?: MePersonProfile;
}

export interface AccountLifecycleRequest {
  reason: string;
}

export interface ApiErrorResponse {
  error?: string;
  message?: string;
  title?: string;
  detail?: string;
  errorCode?: string;
  correlationId?: string;
  traceId?: string;
}
