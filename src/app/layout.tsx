// The document every route renders into: the head and body the Vite app's index.html had.
// The Barlow fonts come from Fontsource's packages, so the build serves them from the app's own origin and the service
// worker can precache them ([PWA-3], [PWA-2]); the page links nothing on another origin. Only the latin subset, the
// weights the stylesheet uses, and the Dutch texts need nothing beyond it.
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '../styles.css';
import { APP_NAME, APP_SHORT_NAME, APPLE_TOUCH_ICON, THEME_COLOR } from '../pwa/app-manifest';

export const metadata: Metadata = {
  title: APP_NAME,
  // The manifest route (src/app/manifest.ts) adds its own <link rel="manifest">.
  icons: { apple: [{ url: APPLE_TOUCH_ICON.src, sizes: APPLE_TOUCH_ICON.sizes, type: APPLE_TOUCH_ICON.type }] },
  appleWebApp: { capable: true, title: APP_SHORT_NAME, statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
