export const SERVICE_MANIFEST = {
  service: 'edge-proxy-eo',
  description: 'GuEarth Serverless Mirror Proxy on Tencent EdgeOne Node Functions',
  routes: [
    {
      path: '/tiles/osm/{z}/{x}/{y}.png',
      upstream: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maxZoom: 19,
      sMaxage: 2592000,
    },
    {
      path: '/tiles/esri/{z}/{y}/{x}',
      upstream: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      maxZoom: 23,
      sMaxage: 2592000,
    },
    {
      path: '/tiles/opentopo/{z}/{x}/{y}.png',
      upstream: 'https://{a|b|c}.tile.opentopomap.org/{z}/{x}/{y}.png',
      maxZoom: 17,
      sMaxage: 2592000,
    },
    {
      path: '/tiles/viirs/{date}/{z}/{y}/{x}.jpeg',
      upstream:
        'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_DayNightBand_AtSensor_M15/default/{date}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
      maxZoom: 8,
      sMaxage: 2592000,
    },
    {
      path: '/arcgis?f=json',
      upstream: 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer?f=json',
      sMaxage: 86400,
    },
    {
      path: '/arcgis/tile/{z}/{y}/{x}',
      upstream:
        'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile/{z}/{y}/{x}',
      maxZoom: 23,
      sMaxage: 86400,
    },
    {
      path: '/datasets/earthquakes',
      upstream: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson',
      sMaxage: 600,
    },
    {
      path: '/modelsdev',
      upstream: 'https://models.dev/api.json',
      sMaxage: 21600,
    },
    {
      path: '/health',
      upstream: null,
      sMaxage: 0,
    },
  ],
};

export function onRequestGet() {
  return new Response(JSON.stringify(SERVICE_MANIFEST, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function onRequestHead() {
  return new Response(null, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
