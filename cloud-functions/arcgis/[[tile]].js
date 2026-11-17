import { parseTileCoords, proxyResponse, jsonError, TILE_USER_AGENT } from '../lib/proxy.js';
import { ARCGIS_TERRAIN_BASE_URL } from './index.js';

const MAX_ARCGIS_TERRAIN_LEVEL = 23;

export function extractArcgisSegments(context) {
  const rawParam = context?.params?.tile;
  if (Array.isArray(rawParam)) {
    return rawParam.filter(Boolean);
  }
  if (typeof rawParam === 'string' && rawParam.length > 0) {
    return rawParam.split('/').filter(Boolean);
  }
  if (context?.request?.url) {
    try {
      const { pathname } = new URL(context.request.url);
      const idx = pathname.indexOf('/arcgis/');
      if (idx !== -1) {
        return pathname
          .slice(idx + '/arcgis/'.length)
          .split('/')
          .filter(Boolean);
      }
    } catch {
      // Ignore invalid URL
    }
  }
  return [];
}

export function buildArcgisTileUrl({ z, y, x }) {
  return `${ARCGIS_TERRAIN_BASE_URL}/tile/${z}/${y}/${x}`;
}

async function handle(context) {
  const segments = extractArcgisSegments(context);
  if (segments.length !== 4 || segments[0] !== 'tile') {
    return jsonError(400, 'Expected path /arcgis/tile/{z}/{y}/{x}');
  }

  const parsed = parseTileCoords({
    zRaw: segments[1],
    yRaw: segments[2],
    xRaw: segments[3],
    maxLevel: MAX_ARCGIS_TERRAIN_LEVEL,
  });

  if (!parsed.ok) {
    return jsonError(400, parsed.error);
  }

  const upstreamUrl = buildArcgisTileUrl(parsed);
  return proxyResponse(context, upstreamUrl, {
    sMaxage: 86400, // 1 day
    maxAge: 86400,  // 1 day
    userAgent: TILE_USER_AGENT,
    accept: '*/*',
  });
}

export const onRequestGet = handle;
export const onRequestHead = handle;
