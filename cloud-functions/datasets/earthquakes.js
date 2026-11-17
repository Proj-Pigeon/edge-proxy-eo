import { proxyResponse, DATA_USER_AGENT } from '../lib/proxy.js';

export const USGS_EARTHQUAKES_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson';

async function handle(context) {
  return proxyResponse(context, USGS_EARTHQUAKES_URL, {
    sMaxage: 600, // 10 minutes
    maxAge: 300,  // 5 minutes
    userAgent: DATA_USER_AGENT,
    accept: 'application/geo+json, application/json, */*',
  });
}

export const onRequestGet = handle;
export const onRequestHead = handle;
