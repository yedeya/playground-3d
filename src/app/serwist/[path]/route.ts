// Serves the service worker at /serwist/sw.js (and its source map), built from src/pwa/sw.ts ([PWA-2]).
// `next build` uses Turbopack, which runs no webpack plugin, so Serwist builds the worker in this route instead: the
// route is static, and prerendering it bundles the worker with esbuild and injects the precache list, read from the
// build's own `.next/static` and from `public/`. Its answers carry `Service-Worker-Allowed: /`, so the page can register
// the worker for the scope `/`; next.config.ts serves them `no-cache` ([PWA-6]).
import { createSerwistRoute } from '@serwist/turbopack';

/**
 * The page's revision in the precache list. The page is the one entry whose URL carries no hash, so its revision is
 * the build's id, which next.config.ts makes once per build and the compiler writes in here: each build stores the page
 * afresh, and every process that loads this route during the build reads the same value. Without it, the build fails
 * rather than give every build the same revision, which would leave a device on the old page after a deploy.
 */
const PAGE_REVISION = process.env.PWA_BUILD_ID;
if (!PAGE_REVISION) throw new Error('No PWA_BUILD_ID: next.config.ts sets it, as the page\'s revision in the precache list');

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: 'src/pwa/sw.ts',
  useNativeEsbuild: true,
  // The page's scripts and stylesheets, its fonts (woff2: every browser that runs a service worker reads it, so the
  // woff fallbacks are left out), and everything in public/: the model GLB and the icons.
  globPatterns: ['.next/static/**/*.{js,css,woff2}', 'public/**/*'],
  additionalPrecacheEntries: [{ url: '/', revision: PAGE_REVISION }],
  // Serwist leaves out, with only a warning, any file above its limit; no file of the app's should ever be left out.
  maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
});
