import { createTileHandlers } from '../../../../lib/proxy.js';

export const buildEsriTileUrl = ({ z, y, x }) =>
  `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

const { onRequestGet, onRequestHead } = createTileHandlers({
  buildUrl: buildEsriTileUrl,
  maxLevel: 23,
  sMaxage: 2592000, // 30 days
  maxAge: 604800,   // 7 days
});

export { onRequestGet, onRequestHead };
