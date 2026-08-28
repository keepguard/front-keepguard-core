import type { ConnectionTarget } from '../data/connectionsCatalog';

export type ProbeStatus = 'healthy' | 'unhealthy' | 'checking';

export interface ProbeResult {
  status: Exclude<ProbeStatus, 'checking'>;
  latencyMs: number;
  checkedAt: number;
}

export async function probeConnection(target: ConnectionTarget): Promise<ProbeResult> {
  const started = performance.now();
  try {
    const response = await fetch(target.path, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'manual',
    });
    const latencyMs = Math.round(performance.now() - started);
    let ok = response.status >= 200 && response.status < 400;

    if (target.treatAuthAsUp && (response.status === 401 || response.status === 403)) {
      ok = true;
    }

    const contentType = response.headers.get('content-type') || '';
    if (ok && contentType.includes('application/json')) {
      try {
        const body = await response.json() as { status?: string };
        if (typeof body.status === 'string' && body.status.toUpperCase() === 'DOWN') {
          ok = false;
        }
      } catch {
        // corpo vazio ou não JSON — status HTTP já vale
      }
    }

    return {
      status: ok ? 'healthy' : 'unhealthy',
      latencyMs,
      checkedAt: Date.now(),
    };
  } catch {
    return {
      status: 'unhealthy',
      latencyMs: Math.round(performance.now() - started),
      checkedAt: Date.now(),
    };
  }
}
