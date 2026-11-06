import { withSerwist } from '@serwist/turbopack';
import type { NextConfig } from 'next';

// `npm run dev` listens on every interface so a phone on the same wifi can open the app, as Vite's `--host` did.
// Next.js's dev server refuses its own dev resources to any host it does not know, so the app would never start
// on that phone. These patterns allow the private network ranges and mDNS names only; the production build is
// unaffected, since `next start` makes no such check.
const PRIVATE_NETWORK = [
  '10.*.*.*',
  ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`),
  '192.168.*.*',
  '*.local',
];

/**
 * The offline app's files a browser must ask the server about every time it is online ([PWA-6]): the service worker
 * (src/app/serwist/[path]/route.ts) and the manifest (src/app/manifest.ts). A deploy then reaches a device the next
 * time the app opens online.
 */
export const NO_CACHE_PATHS = ['/serwist/:path*', '/manifest.webmanifest'];

const config: NextConfig = {
  allowedDevOrigins: PRIVATE_NETWORK,
  async headers() {
    // Lower case, as the prerendered routes store their own `cache-control`: OpenNext, which serves the deployed site,
    // lays these headers over the stored ones by their exact name.
    return NO_CACHE_PATHS.map(source => ({ source, headers: [{ key: 'cache-control', value: 'no-cache' }] }));
  },
};

// Serwist builds the service worker with esbuild inside a route, so the server leaves esbuild unbundled.
export default withSerwist(config);
