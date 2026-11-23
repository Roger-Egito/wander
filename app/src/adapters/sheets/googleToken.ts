/**
 * An access token for the Sheets API, from Google Identity Services' token client
 * (https://developers.google.com/identity/oauth2/web/guides/use-token-model). The token
 * lives in memory only, never in storage, and is asked for again when it expires (about
 * an hour). The first request has to come from a click: browsers block the popup
 * otherwise.
 */
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const SCRIPT = 'https://accounts.google.com/gsi/client';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type: string; message?: string }) => void;
          }): TokenClient;
        };
      };
    };
  }
}

let loading: Promise<void> | null = null;
function loadScript() {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google sign-in script did not load'));
    document.head.appendChild(script);
  });
  return loading;
}

export function googleSheetsToken(clientId: string) {
  let token: { value: string; expires: number } | null = null;
  let pending: Promise<string> | null = null;

  function request(): Promise<string> {
    pending ??= loadScript().then(
      () =>
        new Promise<string>((resolve, reject) => {
          const client = window.google!.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: SCOPE,
            callback: (response) => {
              if (!response.access_token) return reject(new Error(response.error_description ?? response.error ?? 'no token'));
              // Renewed a minute early, so a write never starts with a token about to lapse.
              token = { value: response.access_token, expires: Date.now() + ((response.expires_in ?? 3600) - 60) * 1000 };
              resolve(token.value);
            },
            error_callback: (error) => reject(new Error(error.message ?? error.type)),
          });
          client.requestAccessToken({ prompt: '' });
        }),
    ).finally(() => {
      pending = null;
    });
    return pending;
  }

  return {
    /** A valid token, asking Google for one when there's none or it expired. */
    get: () => (token && token.expires > Date.now() ? Promise.resolve(token.value) : request()),
    connected: () => !!token && token.expires > Date.now(),
  };
}
