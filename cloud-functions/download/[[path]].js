import { DATA_USER_AGENT, buildCacheControl, jsonError, proxyResponse } from '../lib/proxy.js';
import {
  ASSET_CACHE_SMAXAGE,
  GITHUB_RELEASE_BASE,
  HAZEL_ASSET_TIMEOUT_MS,
  HAZEL_UPSTREAM,
  UPDATE_CACHE_SMAXAGE,
  extractRequestSearch,
  isValidAssetFile,
  isValidPlatform,
  isValidTag,
  proxyHazelDownloadRedirect,
} from '../lib/hazel.js';

export function extractDownloadSegments(context) {
  const rawParam = context?.params?.path ?? context?.params?.file;
  if (Array.isArray(rawParam)) {
    return rawParam.filter(Boolean);
  }
  if (typeof rawParam === 'string' && rawParam.length > 0) {
    return rawParam.split('/').filter(Boolean);
  }
  if (context?.request?.url) {
    try {
      const { pathname } = new URL(context.request.url);
      const prefix = '/download/';
      const idx = pathname.indexOf(prefix);
      if (idx !== -1) {
        return pathname
          .slice(idx + prefix.length)
          .split('/')
          .filter(Boolean);
      }
    } catch {
      // Ignore invalid URL
    }
  }
  return [];
}

export function buildGitHubAssetUrl(tag, file) {
  return `${GITHUB_RELEASE_BASE}/${encodeURIComponent(tag)}/${encodeURIComponent(file)}`;
}

async function handle(context) {
  const segments = extractDownloadSegments(context);

  if (segments.length === 1) {
    const [platform] = segments;
    if (!isValidPlatform(platform)) {
      return jsonError(400, 'Invalid platform parameter');
    }
    const upstreamUrl = `${HAZEL_UPSTREAM}/download/${encodeURIComponent(platform)}${extractRequestSearch(context?.request)}`;
    const cacheControl = buildCacheControl({
      sMaxage: UPDATE_CACHE_SMAXAGE,
      maxAge: UPDATE_CACHE_SMAXAGE,
    });
    return proxyHazelDownloadRedirect(context, upstreamUrl, {
      platform,
      cacheControl,
    });
  }

  if (segments.length !== 3) {
    return jsonError(400, 'Expected path /download/{platform}/{tag}/{file}');
  }

  const [platform, tag, file] = segments;
  if (!isValidPlatform(platform)) {
    return jsonError(400, 'Invalid platform parameter');
  }
  if (!isValidTag(tag)) {
    return jsonError(400, 'Invalid release tag parameter');
  }
  if (!isValidAssetFile(file)) {
    return jsonError(400, 'Invalid asset filename parameter');
  }

  const upstreamUrl = buildGitHubAssetUrl(tag, file);
  return proxyResponse(context, upstreamUrl, {
    sMaxage: ASSET_CACHE_SMAXAGE,
    maxAge: ASSET_CACHE_SMAXAGE,
    userAgent: DATA_USER_AGENT,
    timeoutMs: HAZEL_ASSET_TIMEOUT_MS,
    accept: '*/*',
  });
}

export const onRequestGet = handle;
export const onRequestHead = handle;
