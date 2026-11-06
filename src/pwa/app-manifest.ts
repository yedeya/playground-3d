// The web app manifest ([PWA-1]): what a phone shows when the app is installed to its home screen. The App Router's
// manifest route (src/app/manifest.ts) serves it; the layout links the Apple touch icon and sets the theme colour.
// The colours are the stylesheet's own (src/styles.css): the theme is `--accent`, the background `--sky`, the
// colour behind the model, so the splash screen fades into the app.
import type { MetadataRoute } from 'next';

export const APP_NAME = 'Speeltoestel ArcticFlyer 3D';
export const APP_SHORT_NAME = 'Speeltoestel';
/** `--accent` in src/styles.css. */
export const THEME_COLOR = '#0b5f66';
/** `--sky` in src/styles.css. */
export const BACKGROUND_COLOR = '#dbe5ea';

/** The icons `npm run icons` writes under public/icons/ (model/icons.ts draws them). */
export const ICONS = [
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
] as const satisfies MetadataRoute.Manifest['icons'];

export const APPLE_TOUCH_ICON = { src: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' } as const;

export function appManifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    lang: 'nl',
    display: 'standalone',
    start_url: '/',
    scope: '/',
    theme_color: THEME_COLOR,
    background_color: BACKGROUND_COLOR,
    icons: ICONS.map(icon => ({ ...icon })),
  };
}
