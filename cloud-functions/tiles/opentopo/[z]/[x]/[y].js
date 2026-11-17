import { createTileHandlers } from '../../../../lib/proxy.js';

const OPENTOPO_SUBDOMAINS = ['a', 'b', 'c'];

export const buildOpenTopoTileUrl = ({ z, x, y }) => {
  const sub = OPENTOPO_SUBDOMAINS[x % 3];
  return `https://${sub}.tile.opentopomap.org/${z}/${x}/${y}.png`;
};

export const { onRequestGet, onRequestHead } = createTileHandlers({
  buildUrl: buildOpenTopoTileUrl,
  maxLevel: 17,
  sMaxage: 2592000, // 30 days
  maxAge: 604800,   // 7 days
  yExt: '.png',
});
