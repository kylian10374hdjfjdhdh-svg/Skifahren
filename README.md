# Skifahren

Endloses 3D-Skirennen im Browser (Three.js, kein Build-Schritt nötig): carven, Schanzen springen, Tricks landen, Hindernissen knapp ausweichen und Combos aufbauen.

## Zwei Modi

- **Endlos** (`index.html`): endlose Abfahrt, Sprünge, Tricks, Combos, Highscore.
- **Slalom** (`slalom.html`): Zeitrennen über eine feste Strecke mit 30 Toren in vier Abschnitten (Slalom, Parkour mit Schanzen, Riesenslalom, Finale). Zeit und Punkte zählen: verpasstes Tor +2 s, Sturz +3 s, knappe Tore und Tricks geben Punkte, schnelle Zeit gibt Bonus. Zwischenzeiten gegen die eigene Bestzeit, Medaillen, sofortiger Neustart mit R. Links und rechts begrenzt ein Fangzaun die Piste, dahinter steigt ein durchgehender Berghang an.

## Spielen

- Online (GitHub Pages): `https://<user>.github.io/Skifahren/` und `.../slalom.html` (Quelle: Ordner `docs/`)
- Lokal: `npm start` und dann `http://localhost:8080` öffnen

## Steuerung

| Taste | Aktion |
|---|---|
| ← → / A D | Carven; in der Luft: Drehung |
| ↓ / S | Ducken (schneller); in der Luft: Salto |
| ↑ / W | in der Luft: Salto rückwärts |
| Leertaste | Sprung |
| G (in der Luft halten) | Grab-Trick |
| E | Boost (Balken füllt sich durch Tricks, Tore, knappes Ausweichen) |
| Shift | Bremsen |
| M | Ton an/aus |
| R | Neustart (Slalom) |

Touch: linke/rechte Bildschirmhälfte lenkt, Buttons für Ducken/Salto, Grab, Boost und Sprung.

## Entwicklung

```bash
npm test                    # Physik- und Geländetests
node tools/bundle.mjs       # baut docs/index.html und docs/slalom.html (Einzeldateien für GitHub Pages)
```

Slalom: `src/slalom/course.js` (Strecke, Tore, Gelände – reine Mathematik, getestet mit einem Bot), `src/slalom/world.js` (3D-Welt), `src/slalom/game.js` (Rennen, HUD).

Aufbau (Endlos): `src/terrain.js` (Gelände, rein mathematisch), `src/sim.js` (Physik), `src/world.js` (Chunks, Bäume, Felsen), `src/game.js` (Schleife, Kamera, HUD).

Fortschritt: siehe [ROADMAP.md](ROADMAP.md).
