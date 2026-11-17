import { proxyResponse, jsonError, DATA_USER_AGENT } from '../lib/proxy.js';

export const ARCGIS_TERRAIN_BASE_URL =
  'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer';

export function buildArcgisMetadataUrl(requestUrl) {
  let format = 'json';
  if (requestUrl) {
    try {
      const url = new URL(requestUrl);
      const f = url.searchParams.get('f');
      if (f) {
        if (f !== 'json' && f !== 'pjson') {
          return null;
        }
        format = f;
      }
    } catch {
      // Fallback to default f=json
    }
  }
  return `${ARCGIS_TERRAIN_BASE_URL}?f=${encodeURIComponent(format)}`;
}

async function handle(context) {
  const upstreamUrl = buildArcgisMetadataUrl(context?.request?.url);
  if (!upstreamUrl) {
    return jsonError(400, 'Unsupported query format parameter (only f=json or f=pjson allowed)');
  }

  return proxyResponse(context, upstreamUrl, {
    sMaxage: 86400, // 1 day
    maxAge: 3600,   // 1 hour
    userAgent: DATA_USER_AGENT,
    accept: 'application/json, */*',
  });
}

export const onRequestGet = handle;
export const onRequestHead = handle;
