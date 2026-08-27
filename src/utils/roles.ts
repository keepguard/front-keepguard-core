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
