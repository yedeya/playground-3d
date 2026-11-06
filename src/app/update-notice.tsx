'use client';
// Registers the service worker in the production build and, once a new version waits, shows `New version` with a
// `Refresh` button that switches to it ([PWA-5]). Renders nothing until then, so the page's markup stays the Vite
// page's ([PLAT-4]). English, as the Maintainer chose (docs/projects/8.md, decision 3).
import { useEffect, useState } from 'react';
import { watchForUpdates } from '../pwa/updates';

export const NEW_VERSION_TEXT = 'New version';
export const REFRESH_TEXT = 'Refresh';

/** Whether this build registers the worker: `next dev` serves no precache list, so it does not. */
const REGISTERS = process.env.NODE_ENV !== 'development';

export default function UpdateNotice() {
  const [activate, setActivate] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!REGISTERS || !('serviceWorker' in navigator)) return;
    return watchForUpdates(
      { serviceWorker: navigator.serviceWorker, document, reload: () => location.reload() },
      next => setActivate(() => next),
    );
  }, []);

  if (!activate) return null;
  return (
    <div id="update" role="status">
      <span>{NEW_VERSION_TEXT}</span>
      <button className="tool" type="button" onClick={activate}>{REFRESH_TEXT}</button>
    </div>
  );
}
