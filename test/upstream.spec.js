import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as osmGet } from '../cloud-functions/tiles/osm/[z]/[x]/[y].js';
import { onRequestGet as esriGet } from '../cloud-functions/tiles/esri/[z]/[y]/[x].js';
import { onRequestGet as openTopoGet } from '../cloud-functions/tiles/opentopo/[z]/[x]/[y].js';
import { onRequestGet as viirsGet } from '../cloud-functions/tiles/viirs/[date]/[z]/[y]/[x].js';
import { onRequestGet as arcgisMetaGet } from '../cloud-functions/arcgis/index.js';
import { onRequestGet as arcgisTileGet } from '../cloud-functions/arcgis/[[tile]].js';
import { onRequestGet as earthquakesGet } from '../cloud-functions/datasets/earthquakes.js';
import { onRequestGet as modelsDevGet } from '../cloud-functions/modelsdev.js';
import { onRequestGet as healthGet } from '../cloud-functions/health.js';
import { onRequestGet as rootGet } from '../cloud-functions/index.js';

describe('Route upstream URL construction & validation', () => {
  const originalFetch = globalThis.fetch;
  let calls = [];

  beforeEach(() => {
    calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return new Response('mock-body', {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': '9',
          ETag: '"abc123"',
        },
      });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('constructs OSM tile URL and strips .png from y parameter', async () => {
    const res = await osmGet({
      request: new Request('https://mirror.example.com/tiles/osm/5/16/11.png'),
      params: { z: '5', x: '16', y: '11.png' },
    });
    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://tile.openstreetmap.org/5/16/11.png');
    assert.equal(res.headers.get('X-Proxy-Upstream'), 'https://tile.openstreetmap.org/5/16/11.png');
    assert.equal(res.headers.get('Cache-Control'), 'public, s-maxage=2592000, max-age=604800');
  });

  it('rejects OSM zoom > 19 with 400 without calling upstream', async () => {
    const res = await osmGet({
      request: new Request('https://mirror.example.com/tiles/osm/20/0/0.png'),
      params: { z: '20', x: '0', y: '0.png' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.equal(calls.length, 0);
  });

  it('constructs Esri World Imagery URL in z/y/x order up to z=23', async () => {
    const res = await esriGet({
      request: new Request('https://mirror.example.com/tiles/esri/21/500/1000'),
      params: { z: '21', y: '500', x: '1000' },
    });
    assert.equal(res.status, 200);
    assert.equal(
      calls[0].url,
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/21/500/1000'
    );
  });

  it('rotates OpenTopoMap subdomain a/b/c by x % 3 and enforces z <= 17', async () => {
    for (const [x, sub] of [
      ['0', 'a'],
      ['1', 'b'],
      ['2', 'c'],
      ['5', 'c'],
    ]) {
      calls = [];
      const res = await openTopoGet({
        request: new Request(`https://mirror.example.com/tiles/opentopo/4/${x}/3.png`),
        params: { z: '4', x, y: '3.png' },
      });
      assert.equal(res.status, 200);
      assert.equal(calls[0].url, `https://${sub}.tile.opentopomap.org/4/${x}/3.png`);
    }

    calls = [];
    const badZoom = await openTopoGet({
      request: new Request('https://mirror.example.com/tiles/opentopo/18/0/0.png'),
      params: { z: '18', x: '0', y: '0.png' },
    });
    assert.equal(badZoom.status, 400);
    assert.equal(calls.length, 0);
  });

  it('constructs NASA VIIRS URL with date and z/y/x.jpeg (z <= 8)', async () => {
    const res = await viirsGet({
      request: new Request('https://mirror.example.com/tiles/viirs/2026-11-15/6/20/35.jpeg'),
      params: { date: '2026-11-15', z: '6', y: '20', x: '35.jpeg' },
    });
    assert.equal(res.status, 200);
    assert.equal(
      calls[0].url,
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_DayNightBand_AtSensor_M15/default/2026-11-15/GoogleMapsCompatible_Level8/6/20/35.jpeg'
    );

    calls = [];
    const badDate = await viirsGet({
      request: new Request('https://mirror.example.com/tiles/viirs/bad-date/6/20/35.jpeg'),
      params: { date: 'bad-date', z: '6', y: '20', x: '35.jpeg' },
    });
    assert.equal(badDate.status, 400);
    assert.equal(calls.length, 0);

    const badZoom = await viirsGet({
      request: new Request('https://mirror.example.com/tiles/viirs/2026-11-15/9/0/0.jpeg'),
      params: { date: '2026-11-15', z: '9', y: '0', x: '0.jpeg' },
    });
    assert.equal(badZoom.status, 400);
    assert.equal(calls.length, 0);
  });

  it('constructs ArcGIS metadata URL and tile catch-all URL', async () => {
    const metaRes = await arcgisMetaGet({
      request: new Request('https://mirror.example.com/arcgis?f=json'),
      params: {},
    });
    assert.equal(metaRes.status, 200);
    assert.equal(
      calls[0].url,
      'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer?f=json'
    );
    assert.equal(metaRes.headers.get('Cache-Control'), 'public, s-maxage=86400, max-age=3600');

    calls = [];
    const tileRes = await arcgisTileGet({
      request: new Request('https://mirror.example.com/arcgis/tile/5/10/15'),
      params: { tile: 'tile/5/10/15' },
    });
    assert.equal(tileRes.status, 200);
    assert.equal(
      calls[0].url,
      'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile/5/10/15'
    );

    calls = [];
    const badArcgisPath = await arcgisTileGet({
      request: new Request('https://mirror.example.com/arcgis/other/1/2/3'),
      params: { tile: ['other', '1', '2', '3'] },
    });
    assert.equal(badArcgisPath.status, 400);
    assert.equal(calls.length, 0);
  });

  it('constructs USGS earthquakes and models.dev URLs with appropriate TTLs', async () => {
    const eqRes = await earthquakesGet({
      request: new Request('https://mirror.example.com/datasets/earthquakes'),
    });
    assert.equal(eqRes.status, 200);
    assert.equal(
      calls[0].url,
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson'
    );
    assert.equal(eqRes.headers.get('Cache-Control'), 'public, s-maxage=600, max-age=300');

    calls = [];
    const mdRes = await modelsDevGet({
      request: new Request('https://mirror.example.com/modelsdev'),
    });
    assert.equal(mdRes.status, 200);
    assert.equal(calls[0].url, 'https://models.dev/api.json');
    assert.equal(mdRes.headers.get('Cache-Control'), 'public, s-maxage=21600, max-age=3600');
  });

  it('serves /health and / manifest locally with no-store', async () => {
    const hRes = await healthGet();
    assert.equal(hRes.status, 200);
    assert.equal(hRes.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await hRes.json(), { ok: true, service: 'edge-proxy-eo' });

    const rRes = await rootGet();
    assert.equal(rRes.status, 200);
    assert.equal(rRes.headers.get('Cache-Control'), 'no-store');
    const manifest = await rRes.json();
    assert.equal(manifest.service, 'edge-proxy-eo');
    assert.equal(Array.isArray(manifest.routes), true);
    assert.equal(calls.length, 0);
  });
});
