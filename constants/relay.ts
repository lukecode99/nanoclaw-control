// constants/relay.ts
//
// This file is committed to the repo with placeholder values so CI builds succeed.
// Fill in real values on each device / in your local environment before use.
//
// SSL REQUIRED: iOS App Transport Security blocks plain HTTP on non-localhost.
// lukenano.duckdns.org:3000 must be fronted by an nginx SSL proxy or Cloudflare
// tunnel before this will work on a real device.

export const RELAY_BASE_URL = 'https://lukenano.duckdns.org/webhook/browser-relay';

// Set BROWSER_RELAY_APP_TOKEN on the NanoClaw server; paste the same value here.
// Leave empty to skip auth (dev only).
export const APP_TOKEN = '';
