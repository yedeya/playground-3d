# Speeltoestel 3D

Webapp met een klikbaar 3D-model van een houten Wickey ArcticFlyer. Het model helpt om het speeltoestel in grote stukken te demonteren, te vervoeren en maanden later weer op te bouwen.

Verder werken in een nieuwe sessie? Lees eerst [docs/HANDOVER.md](docs/HANDOVER.md).

## Starten

```bash
npm ci
```

```bash
npm run dev
```

De ontwikkelserver van Next.js luistert op alle netwerkadressen, op poort 3000. Open op een telefoon in hetzelfde wifi-netwerk `http://<IP-adres van deze computer>:3000`. `next.config.ts` staat dat toe voor adressen in het lokale netwerk.

## Op een telefoon installeren

De app is een installeerbare webapp: na één bezoek met internet opent hij ook zonder netwerk, met het hele model, het paneel, de filters en de kleurstanden. Open het adres van de app (de CloudFront-URL van productie) één keer met internet en wacht tot het model geladen is.

- **iPhone of iPad (Safari):** tik op de deelknop (het vierkantje met de pijl omhoog), kies **Zet op beginscherm** en tik op **Voeg toe**.
- **Android (Chrome):** tik op het menu (de drie puntjes) en kies **App installeren** of **Toevoegen aan startscherm**. Soms biedt Chrome het installeren zelf onderin het scherm aan.

Daarna staat **Speeltoestel** met het icoon van het huisje op het beginscherm, en opent de app zonder adresbalk. Is er een nieuwe versie, dan downloadt de app die op de achtergrond en verschijnt linksonder **New version** met de knop **Refresh**. De app wisselt pas na een tik op die knop, of de volgende keer dat je de app opent; nooit vanzelf terwijl je hem gebruikt.

De lokale ontwikkelserver (`npm run dev`) registreert geen service worker, dus offline werkt alleen met de build: `npm run build` en `npm run preview`. Een telefoon installeert de app alleen vanaf een `https`-adres of vanaf `localhost`.

## Opdrachten

| Opdracht | Wat het doet |
|---|---|
| `npm run dev` | Start de ontwikkelserver |
| `npm test` | Draait de unittests |
| `npm run typecheck` | Controleert de TypeScript-types (`tsc --noEmit`, strikt) |
| `npm run build` | Bouwt de app met Next.js naar `.next/` |
| `npm run preview` | Start de build lokaal (`next start`), ook op alle netwerkadressen |
| `npm run icons` | Tekent de app-iconen opnieuw (`model/icons.ts`) en schrijft ze naar `public/icons/` |
| `npm run model` | Genereert het 3D-model opnieuw met de TypeScript-generator en schrijft `public/models/speeltoestel.glb`; `npm run model -- --baseline` werkt ook `tests/fixtures/model-baseline.json` bij |

`npm run model` en `npm run icons` hebben alleen Node nodig: Node draait de TypeScript direct, zonder extra pakketten.

## Structuur

| Pad | Inhoud |
|---|---|
| `model/generator.ts` | Bron van het model: alle geometrie, in millimeters, met controle tegen de stuklijst |
| `model/glb.ts` | Schrijft het model als GLB: een knoop per onderdeel, met de gegevens en de Nederlandse naam in `extras` |
| `model/cli.ts` | Wat `npm run model` draait: bouwt het model en schrijft de GLB, en op verzoek de baseline |
| `model/icons.ts` | Tekent de app-iconen: het huis, het dak en de glijbaan in hun modulekleuren op de accentkleur, en schrijft ze als PNG; `model/icons-cli.ts` is wat `npm run icons` draait |
| `public/icons/` | De gegenereerde iconen van de app; niet met de hand aanpassen |
| `public/models/speeltoestel.glb` | Gegenereerd model als GLB, dat de app bij het openen ophaalt; niet met de hand aanpassen |
| `src/data/load-model.ts` | Haalt de GLB op en leest hem met de `GLTFLoader` van three.js: per onderdeel de gegevens uit `extras` en de geometrie |
| `src/domain/model.ts` | De types van de modeldata: een onderdeel zoals de generator het bouwt (`Part`) en zoals de app het uit de GLB leest (`ModelPart`), het model, de modulecodes en het filter |
| `src/domain/parts.ts` | Nederlandse namen, opmaak van maten en de filterregels |
| `src/app/layout.tsx` | Het HTML-document: taal, titel, lettertypen (Barlow via Fontsource, vanaf de eigen server), het Apple-icoon en de themakleur |
| `src/app/manifest.ts` | Het webapp-manifest op `/manifest.webmanifest`: naam, kleuren en iconen voor het installeren |
| `src/app/serwist/[path]/route.ts` | Bouwt bij `next build` de service worker met Serwist en serveert hem op `/serwist/sw.js` |
| `src/app/update-notice.tsx` | Registreert de service worker en toont **New version** met **Refresh** zodra er een nieuwe versie klaarstaat |
| `src/pwa/sw.ts` | De service worker: bewaart bij het installeren alles wat de pagina nodig heeft, stuurt `/api/` altijd naar het netwerk en wacht met een nieuwe versie |
| `src/pwa/updates.ts` | Het registreren van de service worker en het wisselen naar een nieuwe versie, alleen na de tik |
| `src/pwa/app-manifest.ts` | De gegevens van het manifest: naam, korte naam, kleuren en iconen |
| `src/pwa/routes.ts` | Het adres van de service worker en welke verzoeken naar de API gaan |
| `src/app/page.tsx` | De enige pagina: de opmaak van canvas, knoppen en paneel |
| `src/app/speeltoestel-app.tsx` | Start in de browser het laden van het model, daarna status, paneel en viewer, en ruimt ze weer op |
| `src/styles.css` | Het globale stylesheet |
| `src/store.ts` | Gedeelde UI-status |
| `src/actions.ts` | Wat paneel en viewer aan de status vragen: selecteren, filteren en tikken |
| `src/viewer/viewer.ts` | Three.js-scène, draaien en zoomen, tikken op onderdelen |
| `src/viewer/meshes.ts` | Bouwt per onderdeel een mesh met randen op de geometrie uit de GLB |
| `src/viewer/appearance.ts` | Kleur, gloed en transparantie per onderdeel, en de röntgenweergave van het geselecteerde onderdeel |
| `src/viewer/picking.ts` | Wat als tik telt, en welk onderdeel een tik raakt |
| `src/ui/panel.ts` | Paneel met onderdeelkaart, modules en onderdelenlijst |
| `src/ui/dom.ts` | Zoekt de elementen van de pagina op id op, en controleert hun type |
| `tests/` | Unittests voor de modeldata, de generator en de GLB, het laden van het model, de domeinlogica, het paneel, de pagina, de viewerregels en de offline app; `tests/offline.test.ts` bouwt de app daarvoor zelf in `.pwa-build/` |
| `next.config.ts` | Instellingen van Next.js: welke netwerkadressen de ontwikkelserver toelaat, en dat de service worker en het manifest `no-cache` krijgen |
