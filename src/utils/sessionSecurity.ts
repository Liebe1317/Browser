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

/**
 * Send a same-origin state-changing request with the current session CSRF token.
 * If the server process restarted or evicted this session, refresh the token and retry once.
 * Only replay string/empty bodies, which are safe to resend in the current browser API usage.
 */
export async function fetchWithAegisCsrf(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  let token = await getAegisCsrfToken();
  const replayable = init.body == null || typeof init.body === 'string';

  for (let attempt = 0; attempt < 2; attempt++) {
    const headers = new Headers(init.headers);
    headers.set('X-Aegis-CSRF', token);
    const response = await fetch(input, {
      ...init,
      credentials: 'same-origin',
      headers,
    });

    if (response.status !== 403 || attempt !== 0 || !replayable) return response;

    cachedCsrfToken = null;
    token = await getAegisCsrfToken();
  }

  throw new Error('Aegis request could not be authenticated');
}
