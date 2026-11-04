let cachedCsrfToken: string | null = null;
let pendingBootstrap: Promise<string> | null = null;

/** Obtain the session-bound anti-CSRF token; it is kept in memory, never in localStorage. */
export async function getAegisCsrfToken(): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken;
  if (pendingBootstrap) return pendingBootstrap;

  pendingBootstrap = (async () => {
    const response = await fetch('/api/session/bootstrap', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) throw new Error('Aegis session bootstrap failed');
    const payload = (await response.json()) as { csrfToken?: unknown };
    if (typeof payload.csrfToken !== 'string' || !/^[a-f0-9]{64}$/.test(payload.csrfToken)) {
      throw new Error('Invalid Aegis session token');
    }
    cachedCsrfToken = payload.csrfToken;
    return cachedCsrfToken;
  })();

  try {
    return await pendingBootstrap;
  } finally {
    pendingBootstrap = null;
  }
}
