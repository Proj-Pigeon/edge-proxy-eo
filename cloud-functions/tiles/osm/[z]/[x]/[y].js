import { createTileHandlers } from '../../../../lib/proxy.js';

export const buildOsmTileUrl = ({ z, x, y }) =>
  `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

const { onRequestGet, onRequestHead } = createTileHandlers({
  buildUrl: buildOsmTileUrl,
  maxLevel: 19,
  sMaxage: 2592000, // 30 days
  maxAge: 604800,   // 7 days
  yExt: '.png',
});

export { onRequestGet, onRequestHead };
