import {
  DATA_USER_AGENT,
  buildBaseHeaders,
  buildNotModifiedResponse,
  fetchUpstreamSafe,
  jsonError,
  mapUpstreamErrorStatus,
} from './proxy.js';

export const HAZEL_UPSTREAM = 'https://guearth-updater.isla.fan';
export const GITHUB_RELEASE_BASE = 'https://github.com/Proj-Pigeon/GuEarth/releases/download';

export const HAZEL_API_TIMEOUT_MS = 10000;
export const HAZEL_ASSET_TIMEOUT_MS = 120000;
export const UPDATE_CACHE_SMAXAGE = 300;
export const ASSET_CACHE_SMAXAGE = 2592000;

const PLATFORM_RE = /^[A-Za-z0-9_-]+$/;
const VERSION_RE = /^[0-9A-Za-z.+-]+$/;
const TAG_RE = /^v?[0-9][0-9A-Za-z.-]*$/;
const ENCODED_TRAVERSAL_RE = /%(?:2e|2f|5c)/i;
const GITHUB_ASSET_URL_RE =
  /https:\/\/github\.com\/Proj-Pigeon\/GuEarth\/releases\/download\/[^\s"'<>]+/g;

const DIRECT_PASSTHROUGH_HEADERS = [
  'content-type',
  'content-disposition',
  'etag',
  'last-modified',
];

/**
 * Extract the URL query string (`?foo=bar`) safely from a Request.
 */
export function extractRequestSearch(request) {
  if (!request?.url) return '';
  try {
    return new URL(request.url).search;
  } catch {
    return '';
  }
}

/**
 * Validate Hazel platform parameter (e.g. win32, darwin, AppImage, AppImage_arm64).
 */
export function isValidPlatform(raw) {
  return typeof raw === 'string' && raw.length > 0 && raw.length <= 64 && PLATFORM_RE.test(raw);
}

/**
 * Validate Hazel version parameter (e.g. 0.1.17, 1.0.0-beta.1+build).
 */
export function isValidVersion(raw) {
  return (
    typeof raw === 'string' &&
    raw.length > 0 &&
    raw.length <= 64 &&
    VERSION_RE.test(raw) &&
    !raw.includes('..')
  );
}

/**
 * Validate GitHub release tag segment (e.g. v0.1.17, 0.1.17-rc.1).
 */
export function isValidTag(raw) {
  return (
    typeof raw === 'string' &&
    raw.length > 0 &&
    raw.length <= 64 &&
    TAG_RE.test(raw) &&
    !raw.includes('..')
  );
}

/**
 * Validate GitHub release asset filename segment against path traversal.
 */
export function isValidAssetFile(raw) {
  return (
    typeof raw === 'string' &&
    raw.length > 0 &&
    raw.length <= 255 &&
    raw !== '.' &&
    raw !== '..' &&
    !raw.includes('..') &&
    !raw.includes('/') &&
    !raw.includes('\\') &&
    !ENCODED_TRAVERSAL_RE.test(raw) &&
    !/[\x00-\x1f\x7f?#]/.test(raw)
  );
}

/**
 * Extract `{ tag, file }` from a GuEarth GitHub release asset URL.
 * Returns null if the URL does not match the expected GitHub Releases pattern.
 */
export function parseGitHubAssetUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return null;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
    return null;
  }
  const expectedPrefix = '/Proj-Pigeon/GuEarth/releases/download/';
  if (!parsed.pathname.startsWith(expectedPrefix)) {
    return null;
  }
  const rest = parsed.pathname.slice(expectedPrefix.length);
  const parts = rest.split('/').filter(Boolean);
  if (parts.length !== 2) return null;
  const [tag, file] = parts;
  if (!isValidTag(tag) || !isValidAssetFile(file)) return null;
  return { tag, file };
}

/**
 * Build the mirrored download URL on the current proxy origin.
 */
export function buildMirrorDownloadUrl(requestUrl, platform, tag, file) {
  const path = `/download/${encodeURIComponent(platform)}/${encodeURIComponent(tag)}/${encodeURIComponent(file)}`;
  try {
    return new URL(path, requestUrl).toString();
  } catch {
    return path;
  }
}

/**
 * Rewrite the `url` field of a Hazel update JSON payload to point to this mirror.
 * Preserves all other fields and passes through non-GitHub URLs unchanged.
 */
export function rewriteUpdatePayload(payload, requestUrl, platform) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  if (typeof payload.url !== 'string') {
    return payload;
  }
  const asset = parseGitHubAssetUrl(payload.url);
  if (!asset) {
    return payload;
  }
  return {
    ...payload,
    url: buildMirrorDownloadUrl(requestUrl, platform, asset.tag, asset.file),
  };
}

/**
 * Rewrite GitHub release asset URLs inside a Squirrel RELEASES manifest body
 * to point to this mirror's /download/{platform}/{tag}/{file} route.
 */
export function rewriteReleasesText(text, requestUrl, platform) {
  if (typeof text !== 'string' || text.length === 0) {
    return text;
  }
  return text.replace(GITHUB_ASSET_URL_RE, (match) => {
    const asset = parseGitHubAssetUrl(match);
    if (!asset) return match;
    return buildMirrorDownloadUrl(requestUrl, platform, asset.tag, asset.file);
  });
}

/**
 * Proxy a Hazel download redirect endpoint (/download or /download/{platform}),
 * rewriting 302 GitHub asset Locations to the local mirror download path.
 */
export async function proxyHazelDownloadRedirect(
  context,
  upstreamUrl,
  {
    platform = 'auto',
    cacheControl,
    forwardUserAgent = false,
    extraHeaders = {},
  } = {}
) {
  const request = context?.request;
  const method = (request?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return jsonError(405, `Method ${method} not allowed`);
  }

  const userAgent =
    (forwardUserAgent && request?.headers?.get('user-agent')) || DATA_USER_AGENT;

  const fetched = await fetchUpstreamSafe(upstreamUrl, {
    request,
    userAgent,
    timeoutMs: HAZEL_API_TIMEOUT_MS,
    accept: '*/*',
    method,
    redirect: 'manual',
  });
  if (!fetched.ok) {
    return fetched.errorResponse;
  }

  const upstreamRes = fetched.response;

  if (upstreamRes.status === 304) {
    return buildNotModifiedResponse(upstreamRes, cacheControl, upstreamUrl, extraHeaders);
  }

  if (upstreamRes.status >= 300 && upstreamRes.status < 400) {
    const location = upstreamRes.headers.get('location');
    if (!location) {
      return jsonError(502, 'Upstream redirect missing Location header', {
        upstream: upstreamUrl,
        upstreamStatus: upstreamRes.status,
      });
    }

    let resolvedLocation = location;
    try {
      resolvedLocation = new URL(location, upstreamUrl).toString();
    } catch {
      // Keep raw location if not parseable
    }

    const asset = parseGitHubAssetUrl(resolvedLocation);
    const targetLocation = asset
      ? buildMirrorDownloadUrl(request?.url, platform, asset.tag, asset.file)
      : resolvedLocation;

    return new Response(null, {
      status: 302,
      headers: buildBaseHeaders(cacheControl, upstreamUrl, {
        Location: targetLocation,
        ...extraHeaders,
      }),
    });
  }

  if (!upstreamRes.ok) {
    return mapUpstreamErrorStatus(upstreamRes, upstreamUrl);
  }

  const resHeaders = buildBaseHeaders(cacheControl, upstreamUrl, extraHeaders);
  for (const h of DIRECT_PASSTHROUGH_HEADERS) {
    const val = upstreamRes.headers.get(h);
    if (val) resHeaders.set(h, val);
  }
  if (!upstreamRes.headers.get('content-encoding')) {
    const contentLength = upstreamRes.headers.get('content-length');
    if (contentLength) resHeaders.set('content-length', contentLength);
  }

  const body = method === 'HEAD' ? null : upstreamRes.body;
  return new Response(body, {
    status: 200,
    headers: resHeaders,
  });
}
