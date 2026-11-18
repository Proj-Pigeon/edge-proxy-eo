import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import {
  DATA_USER_AGENT,
  buildBaseHeaders,
  buildCacheControl,
  buildNotModifiedResponse,
  fetchUpstreamSafe,
  jsonError,
  mapUpstreamErrorStatus,
  proxyResponse,
} from './lib/proxy.js';

export const MODELS_DEV_URL = 'https://models.dev/api.json';
const COMPRESS_THRESHOLD_BYTES = 256 * 1024;
const MODELS_DEV_SMAXAGE = 21600; // 6 hours
const MODELS_DEV_MAX_AGE = 3600; // 1 hour

function selectEncoding(acceptEncoding) {
  if (typeof acceptEncoding !== 'string' || acceptEncoding.length === 0) return null;
  const lower = acceptEncoding.toLowerCase();
  if (/\bbr\b/.test(lower)) return 'br';
  if (/\bgzip\b/.test(lower)) return 'gzip';
  return null;
}

async function handle(context) {
  const request = context?.request;
  const method = (request?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return jsonError(405, `Method ${method} not allowed`);
  }

  if (method === 'HEAD') {
    return proxyResponse(context, MODELS_DEV_URL, {
      sMaxage: MODELS_DEV_SMAXAGE,
      maxAge: MODELS_DEV_MAX_AGE,
      userAgent: DATA_USER_AGENT,
      accept: 'application/json, */*',
    });
  }

  const fetched = await fetchUpstreamSafe(MODELS_DEV_URL, {
    request,
    userAgent: DATA_USER_AGENT,
    accept: 'application/json, */*',
    method: 'GET',
  });
  if (!fetched.ok) {
    return fetched.errorResponse;
  }
  const upstreamRes = fetched.response;
  const cacheControl = buildCacheControl({ sMaxage: MODELS_DEV_SMAXAGE, maxAge: MODELS_DEV_MAX_AGE });

  if (upstreamRes.status === 304) {
    return buildNotModifiedResponse(upstreamRes, cacheControl, MODELS_DEV_URL);
  }
  if (!upstreamRes.ok) {
    return mapUpstreamErrorStatus(upstreamRes, MODELS_DEV_URL);
  }

  const rawBuf = Buffer.from(await upstreamRes.arrayBuffer());
  const encoding = rawBuf.byteLength > COMPRESS_THRESHOLD_BYTES
    ? selectEncoding(request?.headers?.get('accept-encoding'))
    : null;

  let payload = rawBuf;
  const headers = buildBaseHeaders(cacheControl, MODELS_DEV_URL, {
    'Content-Type': upstreamRes.headers.get('content-type') || 'application/json; charset=utf-8',
    Vary: 'Accept-Encoding',
  });
  for (const h of ['etag', 'last-modified']) {
    const val = upstreamRes.headers.get(h);
    if (val) headers.set(h, val);
  }

  if (encoding === 'br') {
    payload = brotliCompressSync(rawBuf, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 },
    });
    headers.set('Content-Encoding', 'br');
  } else if (encoding === 'gzip') {
    payload = gzipSync(rawBuf, { level: 6 });
    headers.set('Content-Encoding', 'gzip');
  }
  headers.set('Content-Length', String(payload.byteLength));

  return new Response(new Uint8Array(payload), {
    status: 200,
    headers,
  });
}

export const onRequestGet = handle;
export const onRequestHead = handle;
