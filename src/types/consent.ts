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
