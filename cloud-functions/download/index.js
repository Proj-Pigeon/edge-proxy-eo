import {
  HAZEL_UPSTREAM,
  extractRequestSearch,
  proxyHazelDownloadRedirect,
} from '../lib/hazel.js';

export function buildHazelDownloadAutoUrl(search = '') {
  return `${HAZEL_UPSTREAM}/download${search}`;
}

async function handle(context) {
  const upstreamUrl = buildHazelDownloadAutoUrl(extractRequestSearch(context?.request));

  return proxyHazelDownloadRedirect(context, upstreamUrl, {
    platform: 'auto',
    cacheControl: 'no-store',
    forwardUserAgent: true,
    extraHeaders: { Vary: 'User-Agent' },
  });
}

export const onRequestGet = handle;
export const onRequestHead = handle;
