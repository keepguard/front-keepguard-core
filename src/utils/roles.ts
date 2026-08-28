export function normalizeRole(role: string): string {
  return (role || '').trim().toUpperCase().replace(/^ROLE_/, '');
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
