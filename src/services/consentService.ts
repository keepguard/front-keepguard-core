import { BFF_CORE_URL, customFetch } from './api';
import type { ConsentDocument, ConsentType } from '../types/consent';

export const consentService = {
  async getPublishedConsents(): Promise<ConsentDocument[]> {
    return customFetch<ConsentDocument[]>(`${BFF_CORE_URL}/api/v1/consents/published`);
  },

  async getLatestByType(type: ConsentType): Promise<ConsentDocument> {
    return customFetch<ConsentDocument>(`${BFF_CORE_URL}/api/v1/consents/type/${type}/latest`);
  },

  formatDocumentUrl(s3Url: string): string {
    if (!s3Url) return '#';
    // Se a URL estiver como http://minio:9000 (rede interna do docker), ajusta para localhost:9000 para acesso no navegador do usuário
    return s3Url.replace('http://minio:9000', 'http://localhost:9000');
  }
};
