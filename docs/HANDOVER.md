# Handover

Stand van 4 november 2026. Schrijf in het Nederlands naar de gebruiker.

## Doel

De gebruiker wil een houten speeltoestel (Wickey ArcticFlyer, SKU 625630_k) in grote stukken demonteren, vervoeren en een paar maanden later weer opbouwen. Daarvoor is een 3D-tekening nodig die laat zien welk stuk waar hoort. De gebruiker heeft geen tijd om zelf te tekenen en werkt met gekleurde tape op de verbindingen.

## Huidige stand

Werkt:
- Parametrisch model met 161 onderdelen in 11 modules, gebouwd uit de handleiding.
- Webapp: draaien en zoomen, tikken op een onderdeel, filteren op module of op geschatte delen, wisselen tussen module- en natuurkleuren.
- Ladder en glijbaan staan op verzoek van de gebruiker omgekeerd ten opzichte van de handleiding (`SWAP_LADDER_SLIDE` in `model/build_playground.py`).

Ontbreekt nog:
- Transportgroepen: welke onderdelen samen één stuk blijven.
- Tape- en labelposities.
- Controle van de achterkanten tegen foto's. Alleen de voorkant van het schip is met foto's vergeleken.
- Een plek om de app te hosten.
- Een git-remote. De repository staat alleen lokaal en er is niets gepusht.

## Open vragen aan de gebruiker

1. **Waar gaat het toestel uit elkaar?** Hiervan hangen de transportgroepen en labels af.
2. **Waarom zijn ladder en glijbaan gewisseld?** Niet duidelijk is of het echte toestel zo staat, of dat dit de wens voor de nieuwe plek is. Bij de tweede optie kloppen de voorgeboorde gaten mogelijk niet.
3. **Waar moet de app draaien?** Zie "Publiceren".
4. **Moeten labels op meerdere apparaten beschikbaar zijn?** `localStorage` werkt maar op één apparaat. Labels die lang moeten bewaard blijven, kunnen beter in de repository of een backend.

## Bekende onzekerheden in het model

Alleen de houtaantallen zijn hard gecontroleerd: `check()` in de generator vergelijkt ze met de stuklijst op pagina 4 van de handleiding en stopt bij een verschil. Dit is de laatste uitkomst:

| Maat | Model | Productpagina |
|---|---|---|
| Hoogte | 2690 mm | 2690 mm |
| Breedte | 4953 mm | 4870 mm |
| Lengte op de grond | 5814 mm | 5780 mm |
| Grootste lengte, met boegkop | 6168 mm | niet vermeld |

Dat de productpagina de lengte op de grond bedoelt, is een aanname.

**Geschat (22 onderdelen, `source = estimate`):** `A45_L`, `A45_K`, `A45_LG1`, `A45_LG2`, `C14_G1`, `C14_G2`, `E24_seat`, `E24_rope_ladder`, `A47_S1`, `G28_B6`, `G28_B7`, `G28_B8`, `G24_H1` t/m `G24_H5`, `A47_G1`, `A47_G2`, `B07_B1`, `B07_B2`, `G01_slide`.

**Uit de tekeningen afgeleid, controleren op het echte toestel:**
- De brugleuningen staan aan de binnenkant van de palen.
- De schommelbalk zit aan de kant van de binnenste paal met `x < 692`.
- De doorhang van de brug van 200 mm is een schatting.
- De doekpanelen L en K zijn 700 mm hoog getekend. De stuklijst noemt 700 × 590 mm.

**Weggelaten:** schroeven, afstandhouders en ringen, stuurwiel, telescoop, rompdoeken en het geschulpte doek H32.

**Veiligheidszones:** na het wisselen ligt de glijbaan aan de kant van de schommelbalk. De zones uit de handleiding zijn hier niet mee vergeleken. In het model is er ongeveer 65 cm tot de touwladder en 1,35 m tot het zitje.

## Coördinaten en belangrijke maten

Maten in millimeters; in de app en USD-bestanden gedeeld door 1000.

- `x` loopt langs de huisframes. De glijbaan zit bij `x < 0`, de ladder bij `x > 2190`.
- `y` is omhoog.
- `z` loopt van de schommel (`z < 0`) via huis en brug naar het schip.
- Huis: frames van 2190 × 800. Palen zijn 88 mm in `x` en 44 mm in `z`. Binnenste palen op `x` 692–780 en 1410–1498.
- Dek: bovenkant op 1198. Onderbalk `y` 1092–1180, bovenbalk `y` 1714–1802.
- Schommelbalk: `x` 604–692, `y` 1898–1986, `z` -2134 tot 66. A-frame onder 28,9°.
- Schip: transformatie `(sx, sy, sz) → (695 + sz, sy, 2242 + 800 - sx)`.

## Datastroom

```
model/build_playground.py
  → model/output/  (USDA en parts.csv, niet in git)
  → src/data/speeltoestel.json  (wel in git, via npm run model)
  → de app
```

Een onderdeel in de JSON heeft `id`, `module`, `kit` (code uit de handleiding), `group`, `size`, `source`, `natural` (RGB) en `tri` (driehoeken als platte lijst in mm).

Pas geometrie alleen aan in de generator en draai daarna `npm run model` en `npm test`. Een test legt vast dat er 161 onderdelen en 22 schattingen zijn; pas die bewust aan als het aantal klopt maar veranderd is.

Het is aan te raden nieuwe gegevens zoals transportgroepen in een eigen databestand te zetten, gekoppeld aan het onderdeel-`id`. Dan overschrijft de generator ze niet.

**Let op:** codes zoals `A45_AP2` zijn door dit project verzonnen en staan niet op het hout. `kit` is de stuklijstcode uit de handleiding.

## Hulpmiddelen buiten de app

3D-bestanden voor Quick Look op de Mac maken:

```bash
npm run model
```

```bash
cd model/output && usdzip speeltoestel-modules.usdz speeltoestel-modules.usda
```

Renders maken om het model te controleren:

```bash
swiftc model/tools/render3.swift -o /tmp/render3
```

```bash
/tmp/render3 model/output/speeltoestel-modules.usdz /tmp 0.64 1.1 0.95 9 -45:22:a 135:22:b 90:88:top
```

## Publiceren

De repository is nog nergens gehost; dat is een open keuze.

Er bestaat wel een eerdere, privé losse pagina: [Speeltoestel ArcticFlyer 3D](https://claude.ai/artifact/TxZk1JVTL4agXRiPHxYxZR) (slug `da4fb0ae-1f02-4a7e-945e-2cf58eef5d5c`). Die staat los van deze repository en gebruikt Three.js r128 uit een CDN. Inhoudelijk is het hetzelfde model met de gewisselde ladder en glijbaan. Hij is nooit geopend op de gepubliceerde link of op een echte telefoon.

De publicatietool wilde destijds geen bestand buiten de sessiemappen lezen. Daarom is de pagina eerst naar de scratchpad van de sessie gekopieerd.

## Wat is getest

- `npm test`: 7 tests geslaagd.
- De productiebuild in de ingebouwde browser op 375 × 812: tikken, draaien zonder selectie, filter, lijstkeuze, kleurknop, beginstand en deselecteren door op lege ruimte te tikken. Geen consolefouten.
- Dat was met muisklikken. Echte aanrakingen en knijpzoomen zijn nog niet getest.

## Bronnen buiten de repository

| Pad | Inhoud |
|---|---|
| `~/Downloads/arcticflyer_456072_114.pdf` | Handleiding, bewust niet in git vanwege auteursrecht |
| `~/projects/yedeya/3d-model-test` | Foto's van de tape op de voorkant |
| `~/projects/3d-model-poc` | Eerdere experimenten: fotogrammetrie en scheepsmodel. Deze repository is nu de bron voor het model |
| https://wickey.be/houten-speeltoestel-arcticflyer?sqr=625630 | Productpagina |

De fotogrammetrietest met 16 foto's gaf de tape duidelijk weer, maar was vervormd aan de niet-gefotografeerde kant. Daarom is gekozen voor het parametrische model.

## Logische volgende stap

Vraag waar het toestel uit elkaar gaat en voeg dan transportgroepen toe: een databestand per groep, een filter in het paneel en een overzicht per transportstuk. Daarna volgen de tape-labels.
