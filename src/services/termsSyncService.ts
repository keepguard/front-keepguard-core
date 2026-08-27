import { MINIO_PUBLIC_URL } from './consentService';
import { DEFAULT_TENANT_ID } from './api';
import type { TermsManifest, TermsManifestDocument } from '../types/consent';

const SYNC_INTERVAL_DAYS = 7;
const SYNC_INTERVAL_MS = SYNC_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

export interface CheckTermsResult {
  hasPending: boolean;
  manifest?: TermsManifest;
  pendingDocuments: TermsManifestDocument[];
  tenantId: string;
}

export const termsSyncService = {
  /**
   * Obtém a chave do timestamp de sincronização isolada por tenant
   */
  getSyncTimestampKey(tenantId: string): string {
    return `keepguard_terms_sync_at_${tenantId}`;
  },

  /**
   * Obtém a chave da versão de termos aceita por usuário e tenant
   */
  getUserAcceptedVersionKey(tenantId: string, userId: string): string {
    return `keepguard_terms_version_${tenantId}_${userId}`;
  },

  /**
   * Obtém a chave do mapa de documentos individuais aceitos (DocId -> Version)
   */
  getUserAcceptedDocsKey(tenantId: string, userId: string): string {
    return `keepguard_terms_accepted_docs_${tenantId}_${userId}`;
  },

  /**
   * Registra no localStorage que o usuário aceitou os documentos
   */
  recordLocalAcceptance(tenantId: string, userId: string, manifestVersion: string, acceptedDocs: { documentId: string; version: number }[]) {
    try {
      localStorage.setItem(this.getUserAcceptedVersionKey(tenantId, userId), manifestVersion);
      
      const currentMapStr = localStorage.getItem(this.getUserAcceptedDocsKey(tenantId, userId));
      const currentMap: Record<string, number> = currentMapStr ? JSON.parse(currentMapStr) : {};
      
      acceptedDocs.forEach(doc => {
        currentMap[doc.documentId] = doc.version;
      });
      
      localStorage.setItem(this.getUserAcceptedDocsKey(tenantId, userId), JSON.stringify(currentMap));
    } catch (e) {
      console.warn('[TermsSync] Falha ao salvar aceites no localStorage:', e);
    }
  },

  /**
   * Executa a checagem semanal de termos no MinIO de forma não-bloqueante
   */
  async checkTermsOnAppOpen(tenantId: string = DEFAULT_TENANT_ID, userId: string, forceCheck = false): Promise<CheckTermsResult> {
    if (!userId) {
      return { hasPending: false, pendingDocuments: [], tenantId };
    }

    const syncKey = this.getSyncTimestampKey(tenantId);
    const lastSyncStr = localStorage.getItem(syncKey);
    const lastSyncTimestamp = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
    const now = Date.now();

    const elapsedTime = now - lastSyncTimestamp;

    // Se ainda não passou 7 dias e não for forçado, ignora requisição de rede
    if (!forceCheck && elapsedTime < SYNC_INTERVAL_MS) {
      const daysLeft = Math.ceil((SYNC_INTERVAL_MS - elapsedTime) / (1000 * 60 * 60 * 24));
      console.debug(`[TermsSync] Checagem de termos ignorada. Próxima busca em ${daysLeft} dias.`);
      return { hasPending: false, pendingDocuments: [], tenantId };
    }

    try {
      console.info(`[TermsSync] Buscando manifesto de termos para o tenant ${tenantId} no MinIO...`);
      
      // Tenta buscar no bucket público do MinIO particionado por tenant
      const manifestUrl = `${MINIO_PUBLIC_URL}/keepguard-consents/public-legal/${tenantId}/terms-manifest.json`;
      const response = await fetch(manifestUrl, { cache: 'no-cache' });

      if (!response.ok) {
        // Se o tenant ainda não tiver manifesto próprio, tenta o global
        if (response.status === 404) {
          const globalUrl = `${MINIO_PUBLIC_URL}/keepguard-consents/public-legal/global/terms-manifest.json`;
          const globalRes = await fetch(globalUrl, { cache: 'no-cache' });
          if (!globalRes.ok) {
            console.debug('[TermsSync] Nenhum manifesto de termos publicado no MinIO.');
            return { hasPending: false, pendingDocuments: [], tenantId };
          }
          return this.processManifest(await globalRes.json(), tenantId, userId, now);
        }
        return { hasPending: false, pendingDocuments: [], tenantId };
      }

      const manifest: TermsManifest = await response.json();
      return this.processManifest(manifest, tenantId, userId, now);

    } catch (error) {
      console.warn('[TermsSync] Erro ao sincronizar termos do MinIO (tentará novamente na próxima sessão):', error);
      return { hasPending: false, pendingDocuments: [], tenantId };
    }
  },

  processManifest(manifest: TermsManifest, tenantId: string, userId: string, syncTimestamp: number): CheckTermsResult {
    // Atualiza o carimbo de data da última busca bem-sucedida
    localStorage.setItem(this.getSyncTimestampKey(tenantId), syncTimestamp.toString());

    // Obtém o mapa de documentos já aceitos pelo usuário
    const docsMapStr = localStorage.getItem(this.getUserAcceptedDocsKey(tenantId, userId));
    const acceptedMap: Record<string, number> = docsMapStr ? JSON.parse(docsMapStr) : {};

    // Filtra documentos pendentes (aqueles que o usuário ainda não assinou na versão do manifesto)
    const pendingDocuments = (manifest.documents || []).filter(doc => {
      const acceptedVersion = acceptedMap[doc.id];
      return acceptedVersion === undefined || acceptedVersion < doc.version;
    });

    return {
      hasPending: pendingDocuments.length > 0,
      manifest,
      pendingDocuments,
      tenantId
    };
  }
};
