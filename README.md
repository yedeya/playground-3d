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

## Opdrachten

| Opdracht | Wat het doet |
|---|---|
| `npm run dev` | Start de ontwikkelserver |
| `npm test` | Draait de unittests |
| `npm run typecheck` | Controleert de TypeScript-types (`tsc --noEmit`, strikt) |
| `npm run build` | Bouwt de app met Next.js naar `.next/` |
| `npm run preview` | Start de build lokaal (`next start`), ook op alle netwerkadressen |
| `npm run model` | Genereert het 3D-model opnieuw met de TypeScript-generator en schrijft `public/models/speeltoestel.glb`; `npm run model -- --baseline` werkt ook `tests/fixtures/model-baseline.json` bij |

`npm run model` heeft alleen Node nodig: Node draait de TypeScript direct, zonder extra pakketten.

## Structuur

| Pad | Inhoud |
|---|---|
| `model/generator.ts` | Bron van het model: alle geometrie, in millimeters, met controle tegen de stuklijst |
| `model/glb.ts` | Schrijft het model als GLB: een knoop per onderdeel, met de gegevens en de Nederlandse naam in `extras` |
| `model/cli.ts` | Wat `npm run model` draait: bouwt het model en schrijft de GLB, en op verzoek de baseline |
| `public/models/speeltoestel.glb` | Gegenereerd model als GLB, dat de app bij het openen ophaalt; niet met de hand aanpassen |
| `src/data/load-model.ts` | Haalt de GLB op en leest hem met de `GLTFLoader` van three.js: per onderdeel de gegevens uit `extras` en de geometrie |
| `src/domain/model.ts` | De types van de modeldata: een onderdeel zoals de generator het bouwt (`Part`) en zoals de app het uit de GLB leest (`ModelPart`), het model, de modulecodes en het filter |
| `src/domain/parts.ts` | Nederlandse namen, opmaak van maten en de filterregels |
| `src/app/layout.tsx` | Het HTML-document: taal, titel en lettertypen |
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
| `tests/` | Unittests voor de modeldata, de generator en de GLB, het laden van het model, de domeinlogica, het paneel, de pagina en de viewerregels |
| `next.config.ts` | Instellingen van Next.js: welke netwerkadressen de ontwikkelserver toelaat |
