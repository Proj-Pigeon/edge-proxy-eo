export const TILE_USER_AGENT =
  'GuEarth-Edge-Proxy/1.0 (https://github.com/Proj-Pigeon/edge-proxy-eo; tiles for GuEarth)';
export const DATA_USER_AGENT = 'GuEarth-Edge-Proxy/1.0';
export const DEFAULT_TIMEOUT_MS = 6000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const INT_RE = /^\d+$/;

const PASSTHROUGH_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-encoding',
  'etag',
  'last-modified',
];

export function parseSegmentInt(raw, expectedExt) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  let numStr = raw;
  if (expectedExt) {
    if (raw.endsWith(expectedExt)) {
      numStr = raw.slice(0, -expectedExt.length);
    } else if (raw.includes('.')) {
      return null;
    }
  } else if (raw.includes('.')) {
    return null;
  }
  if (!INT_RE.test(numStr)) return null;
  const n = Number(numStr);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

/**
 * Validate tile coordinates z, x, y against maxLevel and 2^z bounds.
 */
export function parseTileCoords({ zRaw, xRaw, yRaw, maxLevel, xExt, yExt }) {
  const z = parseSegmentInt(zRaw);
  const x = parseSegmentInt(xRaw, xExt);
  const y = parseSegmentInt(yRaw, yExt);

  if (z === null || x === null || y === null) {
    return { ok: false, error: 'Invalid tile coordinate format (must be non-negative integers)' };
  }
  if (z > maxLevel) {
    return { ok: false, error: `Zoom level z=${z} exceeds maximum allowed (${maxLevel})` };
  }
  const limit = 2 ** z;
  if (x >= limit || y >= limit) {
    return { ok: false, error: `Tile coordinates (${x}, ${y}) out of range for z=${z} (max ${limit - 1})` };
  }
  return { ok: true, z, x, y };
}

/**
 * Validate YYYY-MM-DD calendar date string.
 */
export function isValidIsoDate(raw) {
  if (typeof raw !== 'string' || !DATE_RE.test(raw)) return false;
  const [y, m, d] = raw.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Build a JSON error Response with Cache-Control: no-store and CORS headers.
 */
export function jsonError(status, message, extra = {}) {
  return new Response(
    JSON.stringify({ error: message, status, ...extra }),
    {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
}

/**
 * Build Cache-Control header value for successful responses.
 */
export function buildCacheControl({ sMaxage, maxAge }) {
  const edgeTtl = sMaxage ?? 86400;
  const clientTtl = maxAge ?? Math.min(edgeTtl, 86400);
  return `public, s-maxage=${edgeTtl}, max-age=${clientTtl}`;
}

/**
 * Fetch an upstream URL with timeout and conditional request headers.
 */
export async function fetchUpstream(upstreamUrl, {
  request,
  userAgent = DATA_USER_AGENT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  accept = '*/*',
  method = 'GET',
} = {}) {
  const headers = new Headers({
    'User-Agent': userAgent,
    'Accept': accept,
  });

  if (request?.headers) {
    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch) headers.set('If-None-Match', ifNoneMatch);

    const ifModifiedSince = request.headers.get('if-modified-since');
    if (ifModifiedSince) headers.set('If-Modified-Since', ifModifiedSince);

    const acceptEncoding = request.headers.get('accept-encoding');
    if (acceptEncoding) headers.set('Accept-Encoding', acceptEncoding);
  }

  return fetch(upstreamUrl, {
    method,
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Execute an upstream proxy request and format the edge response.
 */
export async function proxyResponse(context, upstreamUrl, {
  sMaxage = 86400,
  maxAge,
  userAgent = DATA_USER_AGENT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  accept = '*/*',
} = {}) {
  const request = context?.request;
  const method = (request?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return jsonError(405, `Method ${method} not allowed`);
  }

  let upstreamRes;
  try {
    upstreamRes = await fetchUpstream(upstreamUrl, {
      request,
      userAgent,
      timeoutMs,
      accept,
      method,
    });
  } catch (err) {
    const isTimeout =
      err?.name === 'TimeoutError' ||
      err?.name === 'AbortError' ||
      /timeout|aborted/i.test(String(err?.message || ''));
    if (isTimeout) {
      return jsonError(504, 'Upstream request timed out', { upstream: upstreamUrl });
    }
    return jsonError(502, 'Upstream fetch failed', {
      upstream: upstreamUrl,
      detail: err?.message || String(err),
    });
  }

  const cacheControl = buildCacheControl({ sMaxage, maxAge });

  // Handle 304 Not Modified
  if (upstreamRes.status === 304) {
    const headers = new Headers({
      'Cache-Control': cacheControl,
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
      'X-Proxy-Upstream': upstreamUrl,
    });
    for (const h of ['etag', 'last-modified']) {
      const val = upstreamRes.headers.get(h);
      if (val) headers.set(h, val);
    }
    return new Response(null, { status: 304, headers });
  }

  // Handle upstream 404 / 400 / 410 as 404 Not Found with no-store
  if (upstreamRes.status === 404 || upstreamRes.status === 400 || upstreamRes.status === 410) {
    return jsonError(404, 'Upstream resource not found', {
      upstream: upstreamUrl,
      upstreamStatus: upstreamRes.status,
    });
  }

  // Handle upstream 5xx or other non-2xx errors as 502 Bad Gateway with no-store
  if (!upstreamRes.ok) {
    return jsonError(502, `Upstream returned HTTP ${upstreamRes.status}`, {
      upstream: upstreamUrl,
      upstreamStatus: upstreamRes.status,
    });
  }

  const resHeaders = new Headers();
  for (const h of PASSTHROUGH_RESPONSE_HEADERS) {
    const val = upstreamRes.headers.get(h);
    if (val) resHeaders.set(h, val);
  }
  resHeaders.set('Cache-Control', cacheControl);
  resHeaders.set('Access-Control-Allow-Origin', '*');
  resHeaders.set('X-Content-Type-Options', 'nosniff');
  resHeaders.set('X-Proxy-Upstream', upstreamUrl);

  const body = method === 'HEAD' ? null : upstreamRes.body;
  return new Response(body, {
    status: 200,
    headers: resHeaders,
  });
}

/**
 * Create `onRequestGet` and `onRequestHead` handlers for a standard XYZ / ZYX tile endpoint.
 */
export function createTileHandlers({
  buildUrl,
  maxLevel,
  sMaxage = 2592000,
  maxAge = 604800,
  xExt,
  yExt,
  requireDate = false,
}) {
  async function handle(context) {
    const params = context?.params || {};
    let date;
    if (requireDate) {
      date = params.date;
      if (!isValidIsoDate(date)) {
        return jsonError(400, 'Invalid date parameter (expected YYYY-MM-DD)');
      }
    }

    const parsed = parseTileCoords({
      zRaw: params.z,
      xRaw: params.x,
      yRaw: params.y,
      maxLevel,
      xExt,
      yExt,
    });

    if (!parsed.ok) {
      return jsonError(400, parsed.error);
    }

    const upstreamUrl = buildUrl({
      date,
      z: parsed.z,
      x: parsed.x,
      y: parsed.y,
    });

    return proxyResponse(context, upstreamUrl, {
      sMaxage,
      maxAge,
      userAgent: TILE_USER_AGENT,
      accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
    });
  }

  return {
    onRequestGet: handle,
    onRequestHead: handle,
  };
}
