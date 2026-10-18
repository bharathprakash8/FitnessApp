// CORS and JSON helpers shared by all Edge Functions.

// Comma-separated list in the APP_ORIGINS secret; localhost is always allowed for development.
const allowedOrigins = new Set(
  ['http://localhost:5173', ...(Deno.env.get('APP_ORIGINS') ?? '').split(',')]
    .map((o) => o.trim())
    .filter(Boolean),
);

// Any local development server (localhost on any port) – every request still needs a
// signed-in user's token, so this only matters for testing.
const isLocalDev = (origin: string) => /^http:\/\/localhost:\d+$/.test(origin);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin':
      allowedOrigins.has(origin) || isLocalDev(origin) ? origin : 'http://localhost:5173',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'error',
  ) {
    super(message);
  }
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

/** Wrap a handler: answers CORS preflight, allows POST only, turns errors into { error }. */
export function serveJson(handler: (req: Request) => Promise<unknown>) {
  Deno.serve((req) => handleJson(req, handler));
}

/** The body of serveJson, for functions that also answer other requests (e.g. a GET callback). */
export async function handleJson(
  req: Request,
  handler: (req: Request) => Promise<unknown>,
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') {
    return json(req, 405, { error: { code: 'method_not_allowed', message: 'Use POST' } });
  }
  try {
    const data = await handler(req);
    return json(req, 200, { data });
  } catch (err) {
    if (err instanceof HttpError) {
      return json(req, err.status, { error: { code: err.code, message: err.message } });
    }
    // Log without request bodies or secrets.
    console.error('Unhandled error:', err instanceof Error ? err.message : String(err));
    return json(req, 500, { error: { code: 'internal', message: 'Something went wrong' } });
  }
}
