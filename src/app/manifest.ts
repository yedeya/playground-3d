// The App Router's manifest route: serves /manifest.webmanifest and links it from every page ([PWA-1]).
import type { MetadataRoute } from 'next';
import { appManifest } from '../pwa/app-manifest';

export default function manifest(): MetadataRoute.Manifest {
  return appManifest();
}
