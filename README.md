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

Vite toont ook een netwerkadres. Daarmee open je de app op een telefoon in hetzelfde wifi-netwerk.

## Opdrachten

| Opdracht | Wat het doet |
|---|---|
| `npm run dev` | Start de ontwikkelserver |
| `npm test` | Draait de unittests |
| `npm run typecheck` | Controleert de TypeScript-types (`tsc --noEmit`, strikt) |
| `npm run build` | Bouwt de statische app naar `dist/` |
| `npm run preview` | Toont de build lokaal |
| `npm run model` | Genereert het 3D-model opnieuw en werkt `src/data/speeltoestel.json` bij |

`npm run model` heeft alleen Python 3 nodig, zonder extra pakketten.

## Structuur

| Pad | Inhoud |
|---|---|
| `model/build_playground.py` | Bron van het model: alle geometrie, in millimeters, met controle tegen de stuklijst |
| `src/data/speeltoestel.json` | Gegenereerd model voor de app; niet met de hand aanpassen |
| `src/data/speeltoestel.d.json.ts` | Het type van dat model, zodat TypeScript het niet uit de JSON afleidt |
| `src/domain/model.ts` | De types van de modeldata: een onderdeel (`Part`), het model, de modulecodes en het filter |
| `src/domain/parts.ts` | Nederlandse namen, opmaak van maten en de filterregels |
| `src/store.ts` | Gedeelde UI-status |
| `src/actions.ts` | Wat paneel en viewer aan de status vragen: selecteren, filteren en tikken |
| `src/viewer/viewer.ts` | Three.js-scène, draaien en zoomen, tikken op onderdelen |
| `src/viewer/meshes.ts` | Bouwt per onderdeel een mesh met randen uit de driehoeken |
| `src/viewer/appearance.ts` | Kleur, gloed en transparantie per onderdeel, en de röntgenweergave van het geselecteerde onderdeel |
| `src/viewer/picking.ts` | Wat als tik telt, en welk onderdeel een tik raakt |
| `src/ui/panel.ts` | Paneel met onderdeelkaart, modules en onderdelenlijst |
| `src/ui/dom.ts` | Zoekt de elementen van de pagina op id op, en controleert hun type |
| `src/main.ts` | Koppelt alles aan elkaar |
| `tests/` | Unittests voor de modeldata, de domeinlogica, het paneel, de pagina en de viewerregels |
