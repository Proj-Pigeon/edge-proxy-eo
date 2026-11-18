import { buildCacheControl, jsonError } from '../../lib/proxy.js';
import {
  HAZEL_UPSTREAM,
  UPDATE_CACHE_SMAXAGE,
  extractRequestSearch,
  isValidPlatform,
  proxyHazelDownloadRedirect,
} from '../../lib/hazel.js';

export function buildHazelDownloadLatestUrl(platform, search = '') {
  return `${HAZEL_UPSTREAM}/download/${encodeURIComponent(platform)}${search}`;
}

async function handle(context) {
  const platform = context?.params?.platform;
  if (!isValidPlatform(platform)) {
    return jsonError(400, 'Invalid platform parameter');
  }

  const upstreamUrl = buildHazelDownloadLatestUrl(platform, extractRequestSearch(context?.request));
  const cacheControl = buildCacheControl({
    sMaxage: UPDATE_CACHE_SMAXAGE,
    maxAge: UPDATE_CACHE_SMAXAGE,
  });

  return proxyHazelDownloadRedirect(context, upstreamUrl, {
    platform,
    cacheControl,
  });
}

export const onRequestGet = handle;
export const onRequestHead = handle;
