import {
  DATA_USER_AGENT,
  buildBaseHeaders,
  buildCacheControl,
  buildNotModifiedResponse,
  fetchUpstreamSafe,
  jsonError,
  mapUpstreamErrorStatus,
} from '../../../lib/proxy.js';
import {
  HAZEL_API_TIMEOUT_MS,
  HAZEL_UPSTREAM,
  UPDATE_CACHE_SMAXAGE,
  extractRequestSearch,
  isValidPlatform,
  isValidVersion,
  rewriteUpdatePayload,
} from '../../../lib/hazel.js';

export function buildHazelUpdateUrl(platform, version, search = '') {
  return `${HAZEL_UPSTREAM}/update/${encodeURIComponent(platform)}/${encodeURIComponent(version)}${search}`;
}

async function handle(context) {
  const request = context?.request;
  const method = (request?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return jsonError(405, `Method ${method} not allowed`);
  }

  const params = context?.params || {};
  const { platform, version } = params;

  if (!isValidPlatform(platform)) {
    return jsonError(400, 'Invalid platform parameter');
  }
  if (!isValidVersion(version)) {
    return jsonError(400, 'Invalid version parameter');
  }

  const upstreamUrl = buildHazelUpdateUrl(platform, version, extractRequestSearch(request));
  const fetched = await fetchUpstreamSafe(upstreamUrl, {
    request,
    userAgent: DATA_USER_AGENT,
    timeoutMs: HAZEL_API_TIMEOUT_MS,
    accept: 'application/json, */*',
    method,
  });
  if (!fetched.ok) {
    return fetched.errorResponse;
  }

  const upstreamRes = fetched.response;
  const cacheControl = buildCacheControl({
    sMaxage: UPDATE_CACHE_SMAXAGE,
    maxAge: UPDATE_CACHE_SMAXAGE,
  });

  if (upstreamRes.status === 204) {
    return new Response(null, {
      status: 204,
      headers: buildBaseHeaders(cacheControl, upstreamUrl),
    });
  }

  if (upstreamRes.status === 304) {
    return buildNotModifiedResponse(upstreamRes, cacheControl, upstreamUrl);
  }

  if (!upstreamRes.ok) {
    return mapUpstreamErrorStatus(upstreamRes, upstreamUrl);
  }

  const headers = buildBaseHeaders(cacheControl, upstreamUrl, {
    'Content-Type': 'application/json; charset=utf-8',
  });

  if (method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }

  let payload;
  try {
    payload = await upstreamRes.json();
  } catch {
    return jsonError(502, 'Upstream returned invalid JSON', { upstream: upstreamUrl });
  }

  const rewritten = rewriteUpdatePayload(payload, request?.url, platform);
  return new Response(JSON.stringify(rewritten), {
    status: 200,
    headers,
  });
}

export const onRequestGet = handle;
export const onRequestHead = handle;
