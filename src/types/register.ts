export type UserType = 'PERSON' | 'COMPANY';

export interface RegisterInitRequest {
  email: string;
  nameFull: string;
  password: string;
  confirmPassword: string;
  phone: string;
  hasAcceptedTermsAndPrivacy: boolean;
  acceptedMarketing?: boolean;
  ipAddress?: string;
  userAgent?: string;
  geolocation?: string;
  type: UserType;
}

export interface RegisterInitResponse {
  registrationSessionId: string;
  email: string;
  phone?: string;
  expiresIn: number;
  requiredChannels?: string[];
  token?: string;
  tokenExpiresIn?: number;
}

export interface RegisterConfirmRequest {
  email: string;
  registrationSessionId: string;
  token?: string;
  emailToken?: string;
  smsToken?: string;
  whatsAppToken?: string;
}

export interface RegisterConfirmResponse {
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresIn?: number;
  message?: string;
}

export interface RegisterResendRequest {
  email: string;
  registrationSessionId: string;
}

export interface RegisterResendResponse {
  message: string;
  resendAttemptsRemaining: number;
  expiresIn: number;
}
