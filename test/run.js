import assert from 'node:assert/strict';
import {
  parseSegmentInt,
  parseTileCoords,
  isValidIsoDate,
  buildCacheControl,
  proxyResponse,
  TILE_USER_AGENT,
} from '../cloud-functions/lib/proxy.js';
import { onRequestGet as osmGet } from '../cloud-functions/tiles/osm/[z]/[x]/[y].js';
import { onRequestGet as esriGet } from '../cloud-functions/tiles/esri/[z]/[y]/[x].js';
import { onRequestGet as openTopoGet } from '../cloud-functions/tiles/opentopo/[z]/[x]/[y].js';
import { onRequestGet as viirsGet } from '../cloud-functions/tiles/viirs/[date]/[z]/[y]/[x].js';
import { onRequestGet as arcgisMetaGet } from '../cloud-functions/arcgis/index.js';
import { onRequestGet as arcgisTileGet } from '../cloud-functions/arcgis/[[tile]].js';
import { onRequestGet as earthquakesGet } from '../cloud-functions/datasets/earthquakes.js';
import { onRequestGet as modelsDevGet } from '../cloud-functions/modelsdev.js';
import { onRequestGet as updateGet } from '../cloud-functions/update/[platform]/[version]/index.js';
import { onRequestGet as updateReleasesGet } from '../cloud-functions/update/[platform]/[version]/RELEASES.js';
import { onRequestGet as downloadAutoGet } from '../cloud-functions/download/index.js';
import { onRequestGet as downloadLatestGet } from '../cloud-functions/download/[platform]/index.js';
import { onRequestGet as downloadAssetGet } from '../cloud-functions/download/[platform]/[[file]].js';
import { onRequestGet as healthGet } from '../cloud-functions/health.js';
import { onRequestGet as rootGet } from '../cloud-functions/index.js';

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`✓ ${name}`);
}

await test('parseSegmentInt & parseTileCoords & isValidIsoDate', async () => {
  assert.equal(parseSegmentInt('12.png', '.png'), 12);
  assert.equal(parseSegmentInt('12', '.png'), 12);
  assert.equal(parseSegmentInt('12.jpg', '.png'), null);
  assert.equal(parseSegmentInt('-1'), null);

  assert.deepEqual(
    parseTileCoords({ zRaw: '0', xRaw: '0', yRaw: '0.png', maxLevel: 19, yExt: '.png' }),
    { ok: true, z: 0, x: 0, y: 0 }
  );
  assert.equal(parseTileCoords({ zRaw: '20', xRaw: '0', yRaw: '0', maxLevel: 19 }).ok, false);
  assert.equal(parseTileCoords({ zRaw: '2', xRaw: '4', yRaw: '0', maxLevel: 19 }).ok, false);

  assert.equal(isValidIsoDate('2026-11-15'), true);
  assert.equal(isValidIsoDate('2024-02-29'), true);
  assert.equal(isValidIsoDate('2025-02-29'), false);
  assert.equal(
    buildCacheControl({ sMaxage: 2592000, maxAge: 604800 }),
    'public, s-maxage=2592000, max-age=604800'
  );
});

const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url, init });
  return new Response('ok-body', {
    status: 200,
    headers: { 'Content-Type': 'image/png', ETag: '"e1"' },
  });
};

await test('OSM, Esri, OpenTopo, VIIRS, ArcGIS, USGS, models.dev route handlers', async () => {
  calls.length = 0;
  let res = await osmGet({
    request: new Request('https://m.test/tiles/osm/5/16/11.png'),
    params: { z: '5', x: '16', y: '11.png' },
  });
  assert.equal(res.status, 200);
  assert.equal(calls.at(-1).url, 'https://tile.openstreetmap.org/5/16/11.png');

  res = await esriGet({
    request: new Request('https://m.test/tiles/esri/21/500/1000'),
    params: { z: '21', y: '500', x: '1000' },
  });
  assert.equal(res.status, 200);
  assert.equal(
    calls.at(-1).url,
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/21/500/1000'
  );

  res = await openTopoGet({
    request: new Request('https://m.test/tiles/opentopo/4/2/3.png'),
    params: { z: '4', x: '2', y: '3.png' },
  });
  assert.equal(res.status, 200);
  assert.equal(calls.at(-1).url, 'https://c.tile.opentopomap.org/4/2/3.png');

  res = await viirsGet({
    request: new Request('https://m.test/tiles/viirs/2026-11-15/6/20/35.jpeg'),
    params: { date: '2026-11-15', z: '6', y: '20', x: '35.jpeg' },
  });
  assert.equal(res.status, 200);
  assert.equal(
    calls.at(-1).url,
    'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_DayNightBand_AtSensor_M15/default/2026-11-15/GoogleMapsCompatible_Level8/6/20/35.jpeg'
  );

  res = await arcgisMetaGet({
    request: new Request('https://m.test/arcgis?f=json'),
    params: {},
  });
  assert.equal(res.status, 200);
  assert.equal(
    calls.at(-1).url,
    'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer?f=json'
  );

  res = await arcgisTileGet({
    request: new Request('https://m.test/arcgis/tile/5/10/15'),
    params: { tile: 'tile/5/10/15' },
  });
  assert.equal(res.status, 200);
  assert.equal(
    calls.at(-1).url,
    'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile/5/10/15'
  );

  res = await earthquakesGet({ request: new Request('https://m.test/datasets/earthquakes') });
  assert.equal(res.status, 200);
  assert.equal(
    calls.at(-1).url,
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson'
  );

  res = await modelsDevGet({ request: new Request('https://m.test/modelsdev') });
  assert.equal(res.status, 200);
  assert.equal(calls.at(-1).url, 'https://models.dev/api.json');

  res = await downloadAssetGet({
    request: new Request('https://m.test/download/win32/v0.1.17/guearth-0.1.17-x64-setup.exe'),
    params: { platform: 'win32', file: ['v0.1.17', 'guearth-0.1.17-x64-setup.exe'] },
  });
  assert.equal(res.status, 200);
  assert.equal(
    calls.at(-1).url,
    'https://github.com/Proj-Pigeon/GuEarth/releases/download/v0.1.17/guearth-0.1.17-x64-setup.exe'
  );

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status: 204 });
  };
  res = await updateGet({
    request: new Request('https://m.test/update/win32/0.1.17'),
    params: { platform: 'win32', version: '0.1.17' },
  });
  assert.equal(res.status, 204);
  assert.equal(calls.at(-1).url, 'https://guearth-updater.isla.fan/update/win32/0.1.17');

  res = await updateReleasesGet({
    request: new Request('https://m.test/update/win32/0.1.17/RELEASES'),
    params: { platform: 'win32', version: '0.1.17' },
  });
  assert.equal(res.status, 204);
  assert.equal(calls.at(-1).url, 'https://guearth-updater.isla.fan/update/win32/0.1.17/RELEASES');

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(null, {
      status: 302,
      headers: {
        Location:
          'https://github.com/Proj-Pigeon/GuEarth/releases/download/v0.1.17/guearth-0.1.17-x64-setup.exe',
      },
    });
  };
  res = await downloadAutoGet({
    request: new Request('https://m.test/download', { headers: { 'User-Agent': 'Windows' } }),
  });
  assert.equal(res.status, 302);
  assert.equal(
    res.headers.get('Location'),
    'https://m.test/download/auto/v0.1.17/guearth-0.1.17-x64-setup.exe'
  );

  res = await downloadLatestGet({
    request: new Request('https://m.test/download/AppImage'),
    params: { platform: 'AppImage' },
  });
  assert.equal(res.status, 302);
  assert.equal(
    res.headers.get('Location'),
    'https://m.test/download/AppImage/v0.1.17/guearth-0.1.17-x64-setup.exe'
  );

  const hRes = await healthGet();
  assert.equal(hRes.status, 200);
  const rRes = await rootGet();
  assert.equal(rRes.status, 200);
});

await test('304, 404, 502, 504 error mappings', async () => {
  globalThis.fetch = async () => new Response(null, { status: 304, headers: { ETag: '"v1"' } });
  let res = await proxyResponse(
    { request: new Request('https://m.test/x', { headers: { 'If-None-Match': '"v1"' } }) },
    'https://up.test/x',
    { sMaxage: 600, userAgent: TILE_USER_AGENT }
  );
  assert.equal(res.status, 304);
  assert.equal(res.headers.get('ETag'), '"v1"');

  globalThis.fetch = async () => new Response('missing', { status: 404 });
  res = await proxyResponse({ request: new Request('https://m.test/x') }, 'https://up.test/x');
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');

  globalThis.fetch = async () => new Response('err', { status: 500 });
  res = await proxyResponse({ request: new Request('https://m.test/x') }, 'https://up.test/x');
  assert.equal(res.status, 502);

  globalThis.fetch = async () => {
    throw new DOMException('Timed out', 'TimeoutError');
  };
  res = await proxyResponse({ request: new Request('https://m.test/x') }, 'https://up.test/x');
  assert.equal(res.status, 504);
});

console.log(`All ${passed} test suites passed!`);
