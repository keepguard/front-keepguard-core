import type {
  RegisterInitRequest,
  RegisterInitResponse,
  RegisterConfirmRequest,
  RegisterConfirmResponse,
  RegisterResendRequest,
  RegisterResendResponse,
} from '../types/register';
import { BFF_CORE_URL, customFetch } from './api';

export const registerService = {
  async init(payload: RegisterInitRequest): Promise<RegisterInitResponse> {
    return customFetch<RegisterInitResponse>(`${BFF_CORE_URL}/api/v1/register/init`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async confirm(payload: RegisterConfirmRequest): Promise<RegisterConfirmResponse> {
    return customFetch<RegisterConfirmResponse>(`${BFF_CORE_URL}/api/v1/register/confirm`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async resend(payload: RegisterResendRequest): Promise<RegisterResendResponse> {
    return customFetch<RegisterResendResponse>(`${BFF_CORE_URL}/api/v1/register/resend`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
