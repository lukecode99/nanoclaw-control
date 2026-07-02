// constants/relay.ts
//
// ⚠️  DO NOT COMMIT — this file is gitignored.
//    It contains credentials. Fill in values on each device after cloning.
//
// SSL REQUIRED: iOS App Transport Security blocks plain HTTP on non-localhost.
// The NanoClaw webhook server at lukenano.duckdns.org:3000 must be fronted by
// an nginx SSL proxy or Cloudflare tunnel BEFORE this will work on a real device.
//
// Placeholder URL (update once SSL is in place):
//   https://lukenano.duckdns.org/webhook/browser-relay   (via nginx/443 proxy → :3000)
//   OR
//   https://<tunnel>.trycloudflare.com/webhook/browser-relay

export const RELAY_BASE_URL = 'https://lukenano.duckdns.org/webhook/browser-relay';

// Set BROWSER_RELAY_APP_TOKEN env var on the NanoClaw server, then paste the
// same value here.
export const APP_TOKEN = 'REPLACE_WITH_BROWSER_RELAY_APP_TOKEN';
