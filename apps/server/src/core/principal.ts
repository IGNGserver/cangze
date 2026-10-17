/** Who is acting. Every write to Home Assistant and every audit record carries one. */
export type Principal =
  | { kind: 'admin'; via: 'web' | 'device'; deviceId?: string }
  | { kind: 'session'; sessionId: string; runId: string }
  | { kind: 'agent'; agentId: string; revision: number; runId: string; sessionId?: string }
  | { kind: 'system'; reason: string };

export function principalId(p: Principal): string {
  switch (p.kind) {
    case 'admin':
      return p.deviceId ? `admin:device:${p.deviceId}` : 'admin';
    case 'session':
      return `session:${p.sessionId}`;
    case 'agent':
      return `agent:${p.agentId}@${p.revision}`;
    case 'system':
      return `system:${p.reason}`;
  }
}

export const ADMIN_WEB: Principal = { kind: 'admin', via: 'web' };
