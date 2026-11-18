import { DATA_USER_AGENT, jsonError, proxyResponse } from '../../lib/proxy.js';
import {
  ASSET_CACHE_SMAXAGE,
  GITHUB_RELEASE_BASE,
  HAZEL_ASSET_TIMEOUT_MS,
  isValidAssetFile,
  isValidPlatform,
  isValidTag,
} from '../../lib/hazel.js';

export function extractDownloadSegments(context, platform) {
  const rawParam = context?.params?.file;
  if (Array.isArray(rawParam)) {
    return rawParam.filter(Boolean);
  }
  if (typeof rawParam === 'string' && rawParam.length > 0) {
    return rawParam.split('/').filter(Boolean);
  }
  if (context?.request?.url && platform) {
    try {
      const { pathname } = new URL(context.request.url);
      const prefix = `/download/${platform}/`;
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
  const platform = context?.params?.platform;
  if (!isValidPlatform(platform)) {
    return jsonError(400, 'Invalid platform parameter');
  }

  const segments = extractDownloadSegments(context, platform);
  if (segments.length !== 2) {
    return jsonError(400, 'Expected path /download/{platform}/{tag}/{file}');
  }

  const [tag, file] = segments;
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
