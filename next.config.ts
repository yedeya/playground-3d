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

const config: NextConfig = {
  allowedDevOrigins: PRIVATE_NETWORK,
};

export default config;
