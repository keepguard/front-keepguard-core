import { BFF_CORE_URL, customFetch } from './api';
import type { ConsentDocument, ConsentType } from '../types/consent';

export const MINIO_PUBLIC_URL = import.meta.env.VITE_MINIO_PUBLIC_URL || (
  typeof window !== 'undefined' && (window.location.hostname.endsWith('keepguard.com.br') || window.location.hostname === '31.97.175.92')
    ? 'https://minio.keepguard.com.br'
    : 'http://localhost:9000'
);

export const consentService = {
  async getPublishedConsents(): Promise<ConsentDocument[]> {
    return customFetch<ConsentDocument[]>(`${BFF_CORE_URL}/api/v1/consents/published`);
  },

  async getLatestByType(type: ConsentType): Promise<ConsentDocument> {
    return customFetch<ConsentDocument>(`${BFF_CORE_URL}/api/v1/consents/type/${type}/latest`);
  },

  async acceptBatch(request: import('../types/consent').UserConsentBatchRequest, token?: string): Promise<any> {
    return customFetch(`${BFF_CORE_URL}/api/v1/user-consents/accept-batch`, {
      method: 'POST',
      body: JSON.stringify(request)
    }, token);
  },

  formatDocumentUrl(s3Url: string): string {
    if (!s3Url) return '#';
    // Se a URL estiver como http://minio:9000 (rede interna do docker), ajusta para o endpoint acessível no navegador
    return s3Url.replace('http://minio:9000', MINIO_PUBLIC_URL);
  }
};
