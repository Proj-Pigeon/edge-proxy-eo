import { createTileHandlers } from '../../../../../lib/proxy.js';

export const buildViirsTileUrl = ({ date, z, y, x }) =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_DayNightBand_AtSensor_M15/default/${date}/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`;

const { onRequestGet, onRequestHead } = createTileHandlers({
  buildUrl: buildViirsTileUrl,
  maxLevel: 8,
  sMaxage: 2592000, // 30 days
  maxAge: 604800,   // 7 days
  xExt: '.jpeg',
  requireDate: true,
});

export { onRequestGet, onRequestHead };
