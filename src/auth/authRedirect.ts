export const AUTH_CALLBACK_URL = "https://trovecollections.app/auth/callback";

// Universal Links should open the app straight from AUTH_CALLBACK_URL without ever
// hitting the network, but that requires Associated Domains to be configured and
// verified -- when it doesn't intercept (long-press "Open in Safari", a stale AASA
// cache, etc.), trove-web's /auth/callback page loads instead and hands off to the
// app via this custom-scheme URL, forwarding the same query/hash params. Both forms
// need to be recognized as an auth callback -- see parseAuthCallbackParams.
export const AUTH_CALLBACK_SCHEME_URL = "trove://auth/callback";
