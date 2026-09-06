const adminRoles = new Set(['admin']);

export function hasAdminAccess(role: unknown): boolean {
  if (Array.isArray(role)) return role.some((item) => hasAdminAccess(item));
  if (typeof role !== 'string') return false;

  return role
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .some((item) => adminRoles.has(item));
}
