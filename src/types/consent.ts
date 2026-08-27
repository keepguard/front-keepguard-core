export type ConsentType = 
  | 'TERMS_OF_USE'
  | 'PRIVACY_POLICY'
  | 'LGPD_COMPLIANCE'
  | 'DATA_PROCESSING'
  | 'ESSENTIAL_COOKIES'
  | 'ANALYTICS'
  | 'MARKETING_EMAIL';

export interface ConsentDocument {
  id: string;
  title: string;
  description: string;
  type: ConsentType;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  s3Url: string;
  contentHash: string;
  fileSizeBytes: number;
  mimeType: string;
  createdBy: string;
  createdAt: string;
  publishedAt?: string;
}

export interface TermsManifestDocument {
  id: string;
  type: ConsentType;
  category: 'ESSENTIAL' | 'FUNCTIONAL' | 'ANALYTICS' | 'MARKETING';
  title: string;
  version: number;
  mandatory: boolean;
  contentHash: string;
  url: string;
}

export interface TermsManifest {
  tenantId?: string;
  version: string;
  publishedAt: string;
  effectiveAt: string;
  gracePeriodDays: number;
  documents: TermsManifestDocument[];
}

export interface ConsentItemRequest {
  documentId: string;
  version: number;
  accepted: boolean;
  contentHash: string;
}

export interface UserConsentBatchRequest {
  userId: string;
  email: string;
  acceptedAt: string;
  geolocation?: string;
  consents: ConsentItemRequest[];
}
