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
| `npm run build` | Bouwt de statische app naar `dist/` |
| `npm run preview` | Toont de build lokaal |
| `npm run model` | Genereert het 3D-model opnieuw en werkt `src/data/speeltoestel.json` bij |

`npm run model` heeft alleen Python 3 nodig, zonder extra pakketten.

## Structuur

| Pad | Inhoud |
|---|---|
| `model/build_playground.py` | Bron van het model: alle geometrie, in millimeters, met controle tegen de stuklijst |
| `src/data/speeltoestel.json` | Gegenereerd model voor de app; niet met de hand aanpassen |
| `src/domain/parts.js` | Nederlandse namen, opmaak van maten en de filterregels |
| `src/store.js` | Gedeelde UI-status |
| `src/viewer/viewer.js` | Three.js-scène, draaien en zoomen, tikken op onderdelen |
| `src/ui/panel.js` | Paneel met onderdeelkaart, modules en onderdelenlijst |
| `src/main.js` | Koppelt alles aan elkaar |
| `tests/` | Unittests voor de modeldata en de domeinlogica |
