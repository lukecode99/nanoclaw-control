// constants/relay.ts
//
// Committed with placeholder values so CI builds succeed.
// "My Browser" relay URL + token are persisted in expo-secure-store
// and editable in the My Browser settings panel.
//
// Transport: phone reaches relay via Tailscale HTTPS; Nano reaches it
// directly at http://172.17.0.1:8787 (Docker bridge, no prefix needed).

// Base URL for both Bots mode (legacy endpoints) and My Browser settings default.
export const RELAY_BASE_URL = 'https://localhost-0.tail43651c.ts.net/browser-relay';

// APP_TOKEN: used by Bots mode. For My Browser, the token is stored in SecureStore.
// Leave empty; set via the My Browser settings panel on device.
export const APP_TOKEN = '';
