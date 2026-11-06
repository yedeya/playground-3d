// The paths the offline app treats specially, shared by the service worker and its route.

/** Where the page registers the service worker from; the Serwist route serves it there, allowed the scope `/`. */
export const SW_URL = '/serwist/sw.js';
export const SW_SCOPE = '/';

/** A request to the app's own API, which the service worker never answers from a cache ([PWA-4]). */
export function isApiRequest(url: URL): boolean {
  return url.pathname === '/api' || url.pathname.startsWith('/api/');
}
