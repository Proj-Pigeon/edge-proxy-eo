import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSegmentInt,
  parseTileCoords,
  isValidIsoDate,
  buildCacheControl,
} from '../cloud-functions/lib/proxy.js';

describe('parseSegmentInt', () => {
  it('parses bare non-negative integer strings', () => {
    assert.equal(parseSegmentInt('0'), 0);
    assert.equal(parseSegmentInt('42'), 42);
    assert.equal(parseSegmentInt('1048575'), 1048575);
  });

  it('strips matching file extensions when expectedExt is specified', () => {
    assert.equal(parseSegmentInt('12.png', '.png'), 12);
    assert.equal(parseSegmentInt('12', '.png'), 12);
    assert.equal(parseSegmentInt('0.jpeg', '.jpeg'), 0);
  });

  it('rejects mismatched extensions, negative values, or non-numeric strings', () => {
    assert.equal(parseSegmentInt('12.jpg', '.png'), null);
    assert.equal(parseSegmentInt('12.png'), null);
    assert.equal(parseSegmentInt('-1'), null);
    assert.equal(parseSegmentInt('abc'), null);
    assert.equal(parseSegmentInt(''), null);
    assert.equal(parseSegmentInt(null), null);
    assert.equal(parseSegmentInt(undefined), null);
    assert.equal(parseSegmentInt('3.14'), null);
  });
});

describe('parseTileCoords', () => {
  it('accepts valid z/x/y within zoom and 2^z bounds', () => {
    assert.deepEqual(
      parseTileCoords({ zRaw: '0', xRaw: '0', yRaw: '0.png', maxLevel: 19, yExt: '.png' }),
      { ok: true, z: 0, x: 0, y: 0 }
    );

    assert.deepEqual(
      parseTileCoords({ zRaw: '3', xRaw: '7', yRaw: '7', maxLevel: 19 }),
      { ok: true, z: 3, x: 7, y: 7 }
    );
  });

  it('rejects zoom level exceeding maxLevel', () => {
    const res = parseTileCoords({ zRaw: '20', xRaw: '0', yRaw: '0', maxLevel: 19 });
    assert.equal(res.ok, false);
    assert.match(res.error, /exceeds maximum/i);
  });

  it('rejects x or y >= 2^z', () => {
    assert.equal(parseTileCoords({ zRaw: '0', xRaw: '1', yRaw: '0', maxLevel: 19 }).ok, false);
    assert.equal(parseTileCoords({ zRaw: '2', xRaw: '3', yRaw: '4', maxLevel: 19 }).ok, false);
  });

  it('rejects non-integer coordinates', () => {
    assert.equal(parseTileCoords({ zRaw: 'a', xRaw: '0', yRaw: '0', maxLevel: 19 }).ok, false);
  });
});

describe('isValidIsoDate', () => {
  it('accepts valid calendar dates in YYYY-MM-DD format', () => {
    assert.equal(isValidIsoDate('2026-11-15'), true);
    assert.equal(isValidIsoDate('2024-02-29'), true); // leap year
  });

  it('rejects invalid formats or impossible calendar dates', () => {
    assert.equal(isValidIsoDate('2025-02-29'), false); // non-leap year
    assert.equal(isValidIsoDate('2026-13-01'), false);
    assert.equal(isValidIsoDate('2026-00-10'), false);
    assert.equal(isValidIsoDate('2026-11-31'), false);
    assert.equal(isValidIsoDate('2026/11/15'), false);
    assert.equal(isValidIsoDate('20261115'), false);
    assert.equal(isValidIsoDate(''), false);
    assert.equal(isValidIsoDate(null), false);
  });
});

describe('buildCacheControl', () => {
  it('formats public s-maxage and max-age directives', () => {
    assert.equal(
      buildCacheControl({ sMaxage: 2592000, maxAge: 604800 }),
      'public, s-maxage=2592000, max-age=604800'
    );
    assert.equal(
      buildCacheControl({ sMaxage: 600 }),
      'public, s-maxage=600, max-age=600'
    );
  });
});
