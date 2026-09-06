export function normalizeRole(role: string): string {
  return (role || '').trim().toUpperCase().replace(/^ROLE_/, '');
}

export function hasAdminRole(roles?: string[] | null): boolean {
  if (!roles || roles.length === 0) {
    return false;
  }
  return roles.some((role) => {
    const n = normalizeRole(role);
    return n === 'ADMIN' || n === 'SYSTEM';
  });
}

export function hasAdminOrManagerRole(roles?: string[] | null): boolean {
  if (!roles || roles.length === 0) {
    return false;
  }
  return roles.some((role) => {
    const n = normalizeRole(role);
    return n === 'ADMIN' || n === 'MANAGER';
  });
}

export function canAccessTenantDevices(roles?: string[] | null): boolean {
  if (!roles || roles.length === 0) {
    return false;
  }
  return roles.some((role) => {
    const n = normalizeRole(role);
    return n === 'ADMIN' || n === 'SYSTEM' || n === 'MANAGER';
  });
}

export function canWriteTenantDevice(writable?: boolean | null): boolean {
  return writable === true;
}

export function parseJwtPayload(token?: string | null): Record<string, unknown> | null {
  if (!token) return null;
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const jsonPayload = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function authoritiesFromJwt(token?: string | null): string[] {
  const claims = parseJwtPayload(token);
  const authorities = claims?.authorities;
  if (!Array.isArray(authorities)) return [];
  return authorities.filter((item): item is string => typeof item === 'string');
}

export function isRegularUserRank(roles?: string[] | null): boolean {
  if (hasAdminOrManagerRole(roles)) {
    return false;
  }
  if (!roles || roles.length === 0) {
    return true;
  }
  return roles.some((role) => normalizeRole(role) === 'USER');
}

export const AUDIT_READ_AUTHORITY = 'audit:read';
export const LLM_READ_AUTHORITY = 'llm:read';
export const LLM_WRITE_AUTHORITY = 'llm:write';

export function canReadAudits(
  token: string | null | undefined,
  roles?: string[] | null
): boolean {
  return hasJwtAuthority(token, roles, AUDIT_READ_AUTHORITY);
}

export function canReadLlm(
  token: string | null | undefined,
  roles?: string[] | null
): boolean {
  return hasJwtAuthority(token, roles, LLM_READ_AUTHORITY);
}

export function canWriteLlm(
  token: string | null | undefined,
  roles?: string[] | null
): boolean {
  return hasJwtAuthority(token, roles, LLM_WRITE_AUTHORITY);
}

function hasJwtAuthority(
  token: string | null | undefined,
  roles: string[] | null | undefined,
  authority: string
): boolean {
  if (hasAdminRole(roles)) {
    return true;
  }
  return authoritiesFromJwt(token).includes(authority);
}

export const COLLECTOR_READ_AUTHORITY = 'collector:read';
export const COLLECTOR_WRITE_AUTHORITY = 'collector:write';
export const GUARDIAN_READ_AUTHORITY = 'guardian:read';
export const GUARDIAN_WRITE_AUTHORITY = 'guardian:write';
export const OAUTH_READ_AUTHORITY = 'oauth:read';
export const OAUTH_WRITE_AUTHORITY = 'oauth:write';
export const SESSION_READ_AUTHORITY = 'session:read';
export const SESSION_WRITE_AUTHORITY = 'session:write';
export const OPS_READ_AUTHORITY = 'ops:read';
export const KNOWLEDGE_READ_AUTHORITY = 'knowledge:read';

export function canReadCollector(token: string | null | undefined, roles?: string[] | null): boolean {
  return hasJwtAuthority(token, roles, COLLECTOR_READ_AUTHORITY);
}

export function canWriteCollector(token: string | null | undefined, roles?: string[] | null): boolean {
  return hasJwtAuthority(token, roles, COLLECTOR_WRITE_AUTHORITY);
}

export function canReadGuardian(token: string | null | undefined, roles?: string[] | null): boolean {
  return hasJwtAuthority(token, roles, GUARDIAN_READ_AUTHORITY);
}

export function canWriteGuardian(token: string | null | undefined, roles?: string[] | null): boolean {
  return hasJwtAuthority(token, roles, GUARDIAN_WRITE_AUTHORITY);
}

export function canReadOAuth(token: string | null | undefined, roles?: string[] | null): boolean {
  return hasJwtAuthority(token, roles, OAUTH_READ_AUTHORITY);
}

export function canWriteOAuth(token: string | null | undefined, roles?: string[] | null): boolean {
  return hasJwtAuthority(token, roles, OAUTH_WRITE_AUTHORITY);
}

export function canReadSession(token: string | null | undefined, roles?: string[] | null): boolean {
  return hasJwtAuthority(token, roles, SESSION_READ_AUTHORITY);
}

export function canWriteSession(token: string | null | undefined, roles?: string[] | null): boolean {
  return hasJwtAuthority(token, roles, SESSION_WRITE_AUTHORITY);
}

export function canReadOps(token: string | null | undefined, roles?: string[] | null): boolean {
  return hasJwtAuthority(token, roles, OPS_READ_AUTHORITY);
}

export function canReadKnowledge(token: string | null | undefined, roles?: string[] | null): boolean {
  return hasJwtAuthority(token, roles, KNOWLEDGE_READ_AUTHORITY);
}

export type AccountSelfServiceAction = 'block' | 'delete';

export function canSelfServiceAccount(
  token: string | null | undefined,
  roles: string[] | null | undefined,
  action: AccountSelfServiceAction
): boolean {
  if (!isRegularUserRank(roles)) {
    return false;
  }
  const needed = action === 'block' ? 'user:block' : 'user:delete';
  return authoritiesFromJwt(token).includes(needed);
}

export const ACCOUNT_SELF_SERVICE_VISIBILITY_CASES: Array<{
  name: string;
  tokenPayload: Record<string, unknown>;
  roles: string[];
  canBlock: boolean;
  canDelete: boolean;
}> = [
  {
    name: 'USER com user:block e user:delete',
    tokenPayload: { authorities: ['user:block', 'user:delete'] },
    roles: ['ROLE_USER'],
    canBlock: true,
    canDelete: true,
  },
  {
    name: 'USER só com user:block',
    tokenPayload: { authorities: ['user:block'] },
    roles: ['USER'],
    canBlock: true,
    canDelete: false,
  },
  {
    name: 'USER sem authorities de self-service',
    tokenPayload: { authorities: [] },
    roles: ['ROLE_USER'],
    canBlock: false,
    canDelete: false,
  },
  {
    name: 'ADMIN mesmo com user:delete',
    tokenPayload: { authorities: ['user:block', 'user:delete'] },
    roles: ['ROLE_ADMIN'],
    canBlock: false,
    canDelete: false,
  },
  {
    name: 'MANAGER mesmo com user:block',
    tokenPayload: { authorities: ['user:block', 'user:delete'] },
    roles: ['ROLE_MANAGER', 'ROLE_USER'],
    canBlock: false,
    canDelete: false,
  },
];

export function encodeTestJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `${header}.${body}.sig`;
}

export function assertAccountSelfServiceVisibility(): string[] {
  const failures: string[] = [];
  for (const testCase of ACCOUNT_SELF_SERVICE_VISIBILITY_CASES) {
    const token = encodeTestJwt(testCase.tokenPayload);
    const canBlock = canSelfServiceAccount(token, testCase.roles, 'block');
    const canDelete = canSelfServiceAccount(token, testCase.roles, 'delete');
    if (canBlock !== testCase.canBlock) {
      failures.push(`${testCase.name}: block esperado ${testCase.canBlock}, obtido ${canBlock}`);
    }
    if (canDelete !== testCase.canDelete) {
      failures.push(`${testCase.name}: delete esperado ${testCase.canDelete}, obtido ${canDelete}`);
    }
  }
  return failures;
}

export const AUDIT_READ_VISIBILITY_CASES: Array<{
  name: string;
  tokenPayload: Record<string, unknown>;
  roles: string[];
  canRead: boolean;
}> = [
  { name: 'ADMIN sem authority', tokenPayload: { authorities: [] }, roles: ['ROLE_ADMIN'], canRead: true },
  { name: 'SYSTEM sem authority', tokenPayload: { authorities: [] }, roles: ['ROLE_SYSTEM'], canRead: true },
  { name: 'USER com audit:read', tokenPayload: { authorities: ['audit:read'] }, roles: ['ROLE_USER'], canRead: true },
  { name: 'USER sem audit:read', tokenPayload: { authorities: [] }, roles: ['ROLE_USER'], canRead: false },
  { name: 'MANAGER sem audit:read', tokenPayload: { authorities: ['user:block'] }, roles: ['ROLE_MANAGER'], canRead: false },
];

export function assertAuditReadVisibility(): string[] {
  const failures: string[] = [];
  for (const testCase of AUDIT_READ_VISIBILITY_CASES) {
    const token = encodeTestJwt(testCase.tokenPayload);
    const canRead = canReadAudits(token, testCase.roles);
    if (canRead !== testCase.canRead) {
      failures.push(`${testCase.name}: esperado ${testCase.canRead}, obtido ${canRead}`);
    }
  }
  return failures;
}

export const LLM_READ_VISIBILITY_CASES: Array<{
  name: string;
  tokenPayload: Record<string, unknown>;
  roles: string[];
  canRead: boolean;
  canWrite: boolean;
}> = [
  { name: 'ADMIN sem authority', tokenPayload: { authorities: [] }, roles: ['ROLE_ADMIN'], canRead: true, canWrite: true },
  { name: 'SYSTEM sem authority', tokenPayload: { authorities: [] }, roles: ['ROLE_SYSTEM'], canRead: true, canWrite: true },
  { name: 'MANAGER com llm:read', tokenPayload: { authorities: ['llm:read'] }, roles: ['ROLE_MANAGER'], canRead: true, canWrite: false },
  { name: 'MANAGER sem llm:read', tokenPayload: { authorities: [] }, roles: ['ROLE_MANAGER'], canRead: false, canWrite: false },
  { name: 'USER com llm:write', tokenPayload: { authorities: ['llm:write'] }, roles: ['ROLE_USER'], canRead: false, canWrite: true },
];

export function assertLlmVisibility(): string[] {
  const failures: string[] = [];
  for (const testCase of LLM_READ_VISIBILITY_CASES) {
    const token = encodeTestJwt(testCase.tokenPayload);
    const canRead = canReadLlm(token, testCase.roles);
    const canWrite = canWriteLlm(token, testCase.roles);
    if (canRead !== testCase.canRead) {
      failures.push(`${testCase.name}: leitura esperada ${testCase.canRead}, obtida ${canRead}`);
    }
    if (canWrite !== testCase.canWrite) {
      failures.push(`${testCase.name}: escrita esperada ${testCase.canWrite}, obtida ${canWrite}`);
    }
  }
  return failures;
}

export const TENANT_DEVICES_VISIBILITY_CASES: Array<{
  name: string;
  tokenPayload: Record<string, unknown>;
  roles: string[];
  canAccess: boolean;
}> = [
  { name: 'ADMIN acessa tenant', tokenPayload: { authorities: [] }, roles: ['ROLE_ADMIN'], canAccess: true },
  { name: 'SYSTEM acessa tenant', tokenPayload: { authorities: [] }, roles: ['ROLE_SYSTEM'], canAccess: true },
  { name: 'MANAGER com session:read', tokenPayload: { authorities: ['session:read'] }, roles: ['ROLE_MANAGER'], canAccess: true },
  { name: 'MANAGER sem session:read', tokenPayload: { authorities: [] }, roles: ['ROLE_MANAGER'], canAccess: false },
  { name: 'USER não acessa tenant', tokenPayload: { authorities: [] }, roles: ['ROLE_USER'], canAccess: false },
];

export function assertTenantDevicesVisibility(): string[] {
  const failures: string[] = [];
  for (const testCase of TENANT_DEVICES_VISIBILITY_CASES) {
    const token = encodeTestJwt(testCase.tokenPayload);
    const canAccess = canReadSession(token, testCase.roles);
    if (canAccess !== testCase.canAccess) {
      failures.push(`${testCase.name}: esperado ${testCase.canAccess}, obtido ${canAccess}`);
    }
  }
  if (canWriteTenantDevice(true) !== true) {
    failures.push('writable true deve permitir ação');
  }
  if (canWriteTenantDevice(false) !== false) {
    failures.push('writable false deve bloquear ação');
  }
  if (canWriteTenantDevice(undefined) !== false) {
    failures.push('writable omitido deve bloquear ação');
  }
  return failures;
}

export const COLLECTOR_VISIBILITY_CASES: Array<{
  name: string;
  tokenPayload: Record<string, unknown>;
  roles: string[];
  canRead: boolean;
  canWrite: boolean;
}> = [
  { name: 'ADMIN sem authority', tokenPayload: { authorities: [] }, roles: ['ROLE_ADMIN'], canRead: true, canWrite: true },
  { name: 'MANAGER com collector:read', tokenPayload: { authorities: ['collector:read'] }, roles: ['ROLE_MANAGER'], canRead: true, canWrite: false },
  { name: 'MANAGER sem collector:read', tokenPayload: { authorities: [] }, roles: ['ROLE_MANAGER'], canRead: false, canWrite: false },
  { name: 'USER com collector:read', tokenPayload: { authorities: ['collector:read'] }, roles: ['ROLE_USER'], canRead: true, canWrite: false },
];

export function assertCollectorVisibility(): string[] {
  const failures: string[] = [];
  for (const testCase of COLLECTOR_VISIBILITY_CASES) {
    const token = encodeTestJwt(testCase.tokenPayload);
    const canRead = canReadCollector(token, testCase.roles);
    const canWrite = canWriteCollector(token, testCase.roles);
    if (canRead !== testCase.canRead) {
      failures.push(`${testCase.name}: leitura esperada ${testCase.canRead}, obtida ${canRead}`);
    }
    if (canWrite !== testCase.canWrite) {
      failures.push(`${testCase.name}: escrita esperada ${testCase.canWrite}, obtida ${canWrite}`);
    }
  }
  return failures;
}

export const KNOWLEDGE_READ_VISIBILITY_CASES: Array<{
  name: string;
  tokenPayload: Record<string, unknown>;
  roles: string[];
  canRead: boolean;
}> = [
  { name: 'ADMIN sem authority', tokenPayload: { authorities: [] }, roles: ['ROLE_ADMIN'], canRead: true },
  { name: 'USER com knowledge:read', tokenPayload: { authorities: ['knowledge:read'] }, roles: ['ROLE_USER'], canRead: true },
  { name: 'MANAGER sem knowledge:read', tokenPayload: { authorities: ['collector:read'] }, roles: ['ROLE_MANAGER'], canRead: false },
];

export function assertKnowledgeReadVisibility(): string[] {
  const failures: string[] = [];
  for (const testCase of KNOWLEDGE_READ_VISIBILITY_CASES) {
    const token = encodeTestJwt(testCase.tokenPayload);
    const canRead = canReadKnowledge(token, testCase.roles);
    if (canRead !== testCase.canRead) {
      failures.push(`${testCase.name}: esperado ${testCase.canRead}, obtido ${canRead}`);
    }
  }
  return failures;
}
