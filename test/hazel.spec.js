import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchUpstream } from '../cloud-functions/lib/proxy.js';
import {
  isValidPlatform,
  isValidVersion,
  isValidTag,
  isValidAssetFile,
  parseGitHubAssetUrl,
  rewriteUpdatePayload,
  rewriteReleasesText,
} from '../cloud-functions/lib/hazel.js';
import {
  onRequestGet as updateGet,
  onRequestHead as updateHead,
} from '../cloud-functions/update/[platform]/[version]/index.js';
import {
  onRequestGet as updateReleasesGet,
  onRequestHead as updateReleasesHead,
} from '../cloud-functions/update/[platform]/[version]/RELEASES.js';
import {
  onRequestGet as downloadAutoGet,
  onRequestHead as downloadAutoHead,
} from '../cloud-functions/download/index.js';
import {
  onRequestGet as downloadLatestGet,
  onRequestHead as downloadLatestHead,
} from '../cloud-functions/download/[platform]/index.js';
import {
  onRequestGet as downloadAssetGet,
  onRequestHead as downloadAssetHead,
} from '../cloud-functions/download/[[path]].js';
import { onRequestGet as rootGet } from '../cloud-functions/index.js';

describe('Hazel helpers and validation', () => {
  it('validates platform, version, tag, and filename parameters', () => {
    assert.equal(isValidPlatform('win32'), true);
    assert.equal(isValidPlatform('darwin_arm64'), true);
    assert.equal(isValidPlatform('AppImage'), true);
    assert.equal(isValidPlatform('AppImage_arm64'), true);
    assert.equal(isValidPlatform('win32/..'), false);
    assert.equal(isValidPlatform('win 32'), false);
    assert.equal(isValidPlatform('win32.exe'), false);

    assert.equal(isValidVersion('0.1.17'), true);
    assert.equal(isValidVersion('0.1.17-beta.1+build.2'), true);
    assert.equal(isValidVersion('..'), false);
    assert.equal(isValidVersion('0.1..17'), false);
    assert.equal(isValidVersion('0.1.17/extra'), false);

    assert.equal(isValidTag('v0.1.17'), true);
    assert.equal(isValidTag('0.1.17-rc.1'), true);
    assert.equal(isValidTag('..'), false);
    assert.equal(isValidTag('latest'), false);

    assert.equal(isValidAssetFile('guearth-0.1.17-x64-setup.exe'), true);
    assert.equal(isValidAssetFile('..'), false);
    assert.equal(isValidAssetFile('foo/../bar.exe'), false);
    assert.equal(isValidAssetFile('foo/bar.exe'), false);
    assert.equal(isValidAssetFile('foo\\bar.exe'), false);
    assert.equal(isValidAssetFile('%2e%2e'), false);
    assert.equal(isValidAssetFile('foo%2fbar.exe'), false);
  });

  it('parses GuEarth GitHub release asset URLs and ignores non-matching URLs', () => {
    assert.deepEqual(
      parseGitHubAssetUrl(
        'https://github.com/Proj-Pigeon/GuEarth/releases/download/v0.1.17/guearth-0.1.17-x64-setup.exe'
      ),
      { tag: 'v0.1.17', file: 'guearth-0.1.17-x64-setup.exe' }
    );
    assert.equal(
      parseGitHubAssetUrl('https://github.com/Other/Repo/releases/download/v1.0.0/app.exe'),
      null
    );
    assert.equal(parseGitHubAssetUrl('https://cdn.example.com/app.exe'), null);
    assert.equal(parseGitHubAssetUrl('not-a-url'), null);
  });

  it('rewrites update payload url while preserving metadata and passing through unknown URLs', () => {
    const original = {
      name: 'v0.1.17',
      notes: 'Release notes',
      pub_date: '2026-11-09T14:29:19Z',
      url: 'https://github.com/Proj-Pigeon/GuEarth/releases/download/v0.1.17/guearth-0.1.17-x64-setup.exe',
    };
    const rewritten = rewriteUpdatePayload(
      original,
      'https://proxy.example.com/update/win32/0.0.0',
      'win32'
    );
    assert.deepEqual(rewritten, {
      name: 'v0.1.17',
      notes: 'Release notes',
      pub_date: '2026-11-09T14:29:19Z',
      url: 'https://proxy.example.com/download/win32/v0.1.17/guearth-0.1.17-x64-setup.exe',
    });

    const nonGithub = { ...original, url: 'https://cdn.example.com/custom.exe' };
    assert.deepEqual(
      rewriteUpdatePayload(nonGithub, 'https://proxy.example.com/update/win32/0.0.0', 'win32'),
      nonGithub
    );
  });

  it('rewrites GitHub release URLs in Squirrel RELEASES text and preserves other URLs', () => {
    const raw = [
      'A1B2C3 https://github.com/Proj-Pigeon/GuEarth/releases/download/v0.1.17/GuEarth-0.1.17-full.nupkg 12345',
      'D4E5F6 https://cdn.example.com/other.nupkg 67890',
    ].join('\n');
    const rewritten = rewriteReleasesText(
      raw,
      'https://proxy.example.com/update/win32/0.1.16/RELEASES',
      'win32'
    );
    assert.equal(
      rewritten,
      [
        'A1B2C3 https://proxy.example.com/download/win32/v0.1.17/GuEarth-0.1.17-full.nupkg 12345',
        'D4E5F6 https://cdn.example.com/other.nupkg 67890',
      ].join('\n')
    );
  });
});

describe('fetchUpstream redirect option', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('defaults redirect to follow and supports redirect override', async () => {
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return new Response('ok', { status: 200 });
    };

    await fetchUpstream('https://example.com/default');
    assert.equal(calls[0].init.redirect, 'follow');

    await fetchUpstream('https://example.com/manual', { redirect: 'manual' });
    assert.equal(calls[1].init.redirect, 'manual');
  });
});

describe('Hazel update & download route handlers', () => {
  const originalFetch = globalThis.fetch;
  let calls = [];

  beforeEach(() => {
    calls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rewrites 200 update JSON url to mirror download path and forwards query params', async () => {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          name: 'v0.1.17',
          notes: '# v0.1.17',
          pub_date: '2026-11-09T14:29:19Z',
          url: 'https://github.com/Proj-Pigeon/GuEarth/releases/download/v0.1.17/guearth-0.1.17-x64-setup.exe',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    };

    const res = await updateGet({
      request: new Request('https://proxy.example.com/update/win32/0.0.0?restarted=true'),
      params: { platform: 'win32', version: '0.0.0' },
    });

    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      'https://guearth-updater.isla.fan/update/win32/0.0.0?restarted=true'
    );
    assert.equal(res.headers.get('Cache-Control'), 'public, s-maxage=300, max-age=300');
    const body = await res.json();
    assert.equal(body.name, 'v0.1.17');
    assert.equal(body.notes, '# v0.1.17');
    assert.equal(body.pub_date, '2026-11-09T14:29:19Z');
    assert.equal(
      body.url,
      'https://proxy.example.com/download/win32/v0.1.17/guearth-0.1.17-x64-setup.exe'
    );
  });

  it('preserves 204 No Content from upstream Hazel on /update', async () => {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return new Response(null, { status: 204 });
    };

    const res = await updateGet({
      request: new Request('https://proxy.example.com/update/win32/0.1.17'),
      params: { platform: 'win32', version: '0.1.17' },
    });

    assert.equal(res.status, 204);
    assert.equal(res.headers.get('Cache-Control'), 'public, s-maxage=300, max-age=300');
    assert.equal(await res.text(), '');
  });

  it('supports HEAD on /update and rejects invalid params or errors properly', async () => {
    globalThis.fetch = async () =>
      new Response(null, {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });

    const headRes = await updateHead({
      request: new Request('https://proxy.example.com/update/win32/0.0.0', { method: 'HEAD' }),
      params: { platform: 'win32', version: '0.0.0' },
    });
    assert.equal(headRes.status, 200);
    assert.equal(await headRes.text(), '');

    globalThis.fetch = async () => new Response('Internal Error', { status: 500 });
    const errRes = await updateGet({
      request: new Request('https://proxy.example.com/update/linux/0.0.0'),
      params: { platform: 'linux', version: '0.0.0' },
    });
    assert.equal(errRes.status, 502);
    assert.equal(errRes.headers.get('Cache-Control'), 'no-store');

    globalThis.fetch = async () => {
      throw new DOMException('Timed out', 'TimeoutError');
    };
    const timeoutRes = await updateGet({
      request: new Request('https://proxy.example.com/update/win32/0.0.0'),
      params: { platform: 'win32', version: '0.0.0' },
    });
    assert.equal(timeoutRes.status, 504);
    assert.equal(timeoutRes.headers.get('Cache-Control'), 'no-store');

    const badPlatform = await updateGet({
      request: new Request('https://proxy.example.com/update/bad.platform/0.0.0'),
      params: { platform: 'bad.platform', version: '0.0.0' },
    });
    assert.equal(badPlatform.status, 400);

    const badVersion = await updateGet({
      request: new Request('https://proxy.example.com/update/win32/..'),
      params: { platform: 'win32', version: '..' },
    });
    assert.equal(badVersion.status, 400);
  });

  it('rewrites upstream 302 Location on /download/{platform} using manual redirect', async () => {
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

    const res = await downloadLatestGet({
      request: new Request('https://proxy.example.com/download/win32'),
      params: { platform: 'win32' },
    });

    assert.equal(res.status, 302);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://guearth-updater.isla.fan/download/win32');
    assert.equal(calls[0].init.redirect, 'manual');
    assert.equal(
      res.headers.get('Location'),
      'https://proxy.example.com/download/win32/v0.1.17/guearth-0.1.17-x64-setup.exe'
    );
    assert.equal(res.headers.get('Cache-Control'), 'public, s-maxage=300, max-age=300');

    const headRes = await downloadLatestHead({
      request: new Request('https://proxy.example.com/download/win32', { method: 'HEAD' }),
      params: { platform: 'win32' },
    });
    assert.equal(headRes.status, 302);
  });

  it('streams GitHub release assets on /download/{platform}/{tag}/{file} with 30d cache', async () => {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return new Response('binary-installer-bytes', {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': '22',
          ETag: '"asset-etag"',
        },
      });
    };

    const res = await downloadAssetGet({
      request: new Request(
        'https://proxy.example.com/download/win32/v0.1.17/guearth-0.1.17-x64-setup.exe'
      ),
      params: {
        path: ['win32', 'v0.1.17', 'guearth-0.1.17-x64-setup.exe'],
      },
    });

    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      'https://github.com/Proj-Pigeon/GuEarth/releases/download/v0.1.17/guearth-0.1.17-x64-setup.exe'
    );
    assert.equal(res.headers.get('Cache-Control'), 'public, s-maxage=2592000, max-age=2592000');
    assert.equal(await res.text(), 'binary-installer-bytes');

    // Also supports slash-joined string catch-all params and HEAD
    calls = [];
    const headRes = await downloadAssetHead({
      request: new Request(
        'https://proxy.example.com/download/win32/v0.1.17/guearth-0.1.17-x64-setup.exe',
        { method: 'HEAD' }
      ),
      params: {
        path: 'win32/v0.1.17/guearth-0.1.17-x64-setup.exe',
      },
    });
    assert.equal(headRes.status, 200);
    assert.equal(await headRes.text(), '');

    // Supports 1-segment /download/{platform} fallback in [[path]].js
    calls = [];
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
    const fallbackRedirect = await downloadAssetGet({
      request: new Request('https://proxy.example.com/download/win32'),
    });
    assert.equal(fallbackRedirect.status, 302);
    assert.equal(
      fallbackRedirect.headers.get('Location'),
      'https://proxy.example.com/download/win32/v0.1.17/guearth-0.1.17-x64-setup.exe'
    );
  });

  it('handles 304 passthrough and rejects malformed /download asset paths', async () => {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return new Response(null, { status: 304, headers: { ETag: '"asset-etag"' } });
    };

    const notModified = await downloadAssetGet({
      request: new Request(
        'https://proxy.example.com/download/win32/v0.1.17/guearth-0.1.17-x64-setup.exe',
        { headers: { 'If-None-Match': '"asset-etag"' } }
      ),
      params: {
        path: ['win32', 'v0.1.17', 'guearth-0.1.17-x64-setup.exe'],
      },
    });
    assert.equal(notModified.status, 304);
    assert.equal(notModified.headers.get('ETag'), '"asset-etag"');

    calls = [];
    for (const badParams of [
      { path: ['win32', 'RELEASES'] },
      { path: ['win32', 'v0.1.17', 'a', 'b'] },
      { path: ['win32', '..', 'app.exe'] },
      { path: ['win32', 'v0.1.17', '../secret.exe'] },
      { path: ['win32', 'v0.1.17', '%2e%2e'] },
      { path: ['win32.exe', 'v0.1.17', 'app.exe'] },
    ]) {
      const badRes = await downloadAssetGet({
        request: new Request('https://proxy.example.com/download/win32/bad'),
        params: badParams,
      });
      assert.equal(badRes.status, 400);
    }
    assert.equal(calls.length, 0);
  });

  it('handles Squirrel RELEASES endpoint (204 passthrough, 200 URL rewrite, HEAD, and 400)', async () => {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return new Response(null, { status: 204 });
    };
    const noContent = await updateReleasesGet({
      request: new Request('https://proxy.example.com/update/win32/0.1.17/RELEASES?arch=x64'),
      params: { platform: 'win32', version: '0.1.17' },
    });
    assert.equal(noContent.status, 204);
    assert.equal(
      calls[0].url,
      'https://guearth-updater.isla.fan/update/win32/0.1.17/RELEASES?arch=x64'
    );

    calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return new Response(
        'DEADBE https://github.com/Proj-Pigeon/GuEarth/releases/download/v0.1.18/GuEarth-0.1.18-full.nupkg 54321\n',
        {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        }
      );
    };
    const okRes = await updateReleasesGet({
      request: new Request('https://proxy.example.com/update/win32/0.1.17/RELEASES'),
      params: { platform: 'win32', version: '0.1.17' },
    });
    assert.equal(okRes.status, 200);
    assert.equal(okRes.headers.get('Cache-Control'), 'public, s-maxage=300, max-age=300');
    assert.equal(
      await okRes.text(),
      'DEADBE https://proxy.example.com/download/win32/v0.1.18/GuEarth-0.1.18-full.nupkg 54321\n'
    );

    const headRes = await updateReleasesHead({
      request: new Request('https://proxy.example.com/update/win32/0.1.17/RELEASES', {
        method: 'HEAD',
      }),
      params: { platform: 'win32', version: '0.1.17' },
    });
    assert.equal(headRes.status, 200);
    assert.equal(await headRes.text(), '');

    const badRes = await updateReleasesGet({
      request: new Request('https://proxy.example.com/update/win32/../RELEASES'),
      params: { platform: 'win32', version: '..' },
    });
    assert.equal(badRes.status, 400);
  });

  it('forwards User-Agent on /download with no-store and rewrites 302 Location', async () => {
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

    const res = await downloadAutoGet({
      request: new Request('https://proxy.example.com/download?update=true', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      }),
    });

    assert.equal(res.status, 302);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://guearth-updater.isla.fan/download?update=true');
    assert.equal(calls[0].init.redirect, 'manual');
    assert.equal(
      calls[0].init.headers.get('User-Agent'),
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    );
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.equal(res.headers.get('Vary'), 'User-Agent');
    assert.equal(
      res.headers.get('Location'),
      'https://proxy.example.com/download/auto/v0.1.17/guearth-0.1.17-x64-setup.exe'
    );

    const headRes = await downloadAutoHead({
      request: new Request('https://proxy.example.com/download', { method: 'HEAD' }),
    });
    assert.equal(headRes.status, 302);
  });

  it('lists Hazel mirror routes in SERVICE_MANIFEST', async () => {
    const res = await rootGet();
    const manifest = await res.json();
    const paths = manifest.routes.map((r) => r.path);
    assert.ok(paths.includes('/update/{platform}/{version}'));
    assert.ok(paths.includes('/update/{platform}/{version}/RELEASES'));
    assert.ok(paths.includes('/download'));
    assert.ok(paths.includes('/download/{platform}'));
    assert.ok(paths.includes('/download/{platform}/{tag}/{file}'));
  });
});
