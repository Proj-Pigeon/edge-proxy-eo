import { proxyResponse, DATA_USER_AGENT } from './lib/proxy.js';

export const MODELS_DEV_URL = 'https://models.dev/api.json';

async function handle(context) {
  return proxyResponse(context, MODELS_DEV_URL, {
    sMaxage: 21600, // 6 hours
    maxAge: 3600,   // 1 hour
    userAgent: DATA_USER_AGENT,
    accept: 'application/json, */*',
  });
}

export const onRequestGet = handle;
export const onRequestHead = handle;
