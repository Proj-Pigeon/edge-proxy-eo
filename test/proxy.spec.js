import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { proxyResponse, TILE_USER_AGENT } from '../cloud-functions/lib/proxy.js';

describe('proxyResponse behavior', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('passes conditional headers to upstream and returns 304 on upstream 304', async () => {
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return new Response(null, {
        status: 304,
        headers: {
          ETag: '"tile-etag-1"',
          'Last-Modified': 'Wed, 21 Oct 2026 07:28:00 GMT',
        },
      });
    };

    const req = new Request('https://mirror.example.com/tiles/osm/0/0/0.png', {
      headers: {
        'If-None-Match': '"tile-etag-1"',
        'If-Modified-Since': 'Wed, 21 Oct 2026 07:28:00 GMT',
      },
    });

    const res = await proxyResponse(
      { request: req },
      'https://tile.openstreetmap.org/0/0/0.png',
      { sMaxage: 2592000, maxAge: 604800, userAgent: TILE_USER_AGENT }
    );

    assert.equal(res.status, 304);
    assert.equal(res.headers.get('ETag'), '"tile-etag-1"');
    assert.equal(res.headers.get('Last-Modified'), 'Wed, 21 Oct 2026 07:28:00 GMT');
    assert.equal(res.headers.get('Cache-Control'), 'public, s-maxage=2592000, max-age=604800');

    const sentHeaders = calls[0].init.headers;
    assert.equal(sentHeaders.get('If-None-Match'), '"tile-etag-1"');
    assert.equal(sentHeaders.get('If-Modified-Since'), 'Wed, 21 Oct 2026 07:28:00 GMT');
    assert.equal(sentHeaders.get('User-Agent'), TILE_USER_AGENT);
  });

  it('maps upstream 404 to 404 JSON with Cache-Control: no-store', async () => {
    globalThis.fetch = async () => new Response('Not Found', { status: 404 });

    const res = await proxyResponse(
      { request: new Request('https://mirror.example.com/tiles/osm/0/0/0.png') },
      'https://tile.openstreetmap.org/0/0/0.png'
    );

    assert.equal(res.status, 404);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    const body = await res.json();
    assert.equal(body.status, 404);
  });

  it('maps upstream 5xx to 502 Bad Gateway with Cache-Control: no-store', async () => {
    globalThis.fetch = async () => new Response('Server Error', { status: 503 });

    const res = await proxyResponse(
      { request: new Request('https://mirror.example.com/datasets/earthquakes') },
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson'
    );

    assert.equal(res.status, 502);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    const body = await res.json();
    assert.equal(body.upstreamStatus, 503);
  });

  it('maps TimeoutError / AbortError to 504 Gateway Timeout', async () => {
    globalThis.fetch = async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    };

    const res = await proxyResponse(
      { request: new Request('https://mirror.example.com/tiles/osm/0/0/0.png') },
      'https://tile.openstreetmap.org/0/0/0.png'
    );

    assert.equal(res.status, 504);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
  });

  it('maps generic network errors to 502 Bad Gateway', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('fetch failed');
    };

    const res = await proxyResponse(
      { request: new Request('https://mirror.example.com/tiles/osm/0/0/0.png') },
      'https://tile.openstreetmap.org/0/0/0.png'
    );

    assert.equal(res.status, 502);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
  });

  it('supports HEAD method with null body and rejects POST with 405', async () => {
    globalThis.fetch = async () =>
      new Response('hello', {
        status: 200,
        headers: { 'Content-Type': 'text/plain', 'Content-Length': '5' },
      });

    const headRes = await proxyResponse(
      { request: new Request('https://mirror.example.com/modelsdev', { method: 'HEAD' }) },
      'https://models.dev/api.json'
    );
    assert.equal(headRes.status, 200);
    assert.equal(headRes.headers.get('Content-Length'), '5');
    assert.equal(await headRes.text(), '');

    const postRes = await proxyResponse(
      { request: new Request('https://mirror.example.com/modelsdev', { method: 'POST' }) },
      'https://models.dev/api.json'
    );
    assert.equal(postRes.status, 405);
  });
});
