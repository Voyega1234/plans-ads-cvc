// Staff emails allowed to CREATE Line Tracking client logins. Only these people can
// mint client-viewer credentials (a security decision — a client login grants outside
// visibility into a project's data).
export const LT_CLIENT_ADMINS = [
  'apps@convertcake.com',
  'bob@convertcake.com',
  'varn@convertcake.com',
]

export function canManageClients(email: string | null | undefined): boolean {
  return !!email && LT_CLIENT_ADMINS.includes(email.toLowerCase())
}
