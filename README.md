# Skifahren

Endloses 3D-Skirennen im Browser (Three.js, kein Build-Schritt nötig): carven, Schanzen springen, Tricks landen, Hindernissen knapp ausweichen und Combos aufbauen.

## Spielen

- Online (GitHub Pages): `https://<user>.github.io/skifahren/` (Quelle: Ordner `docs/`)
- Lokal: `npm start` und dann `http://localhost:8080` öffnen

## Steuerung

| Taste | Aktion |
|---|---|
| ← → / A D | Carven; in der Luft: Drehung |
| ↓ / S | Ducken (schneller); in der Luft: Salto |
| ↑ / W | in der Luft: Salto rückwärts |
| Leertaste | Sprung |
| Shift | Bremsen |
| M | Ton an/aus |

Touch: linke/rechte Bildschirmhälfte lenkt.

## Entwicklung

```bash
npm test                    # Physik- und Geländetests
node tools/bundle.mjs       # baut docs/index.html (Einzeldatei für GitHub Pages)
```

Aufbau: `src/terrain.js` (Gelände, rein mathematisch), `src/sim.js` (Physik), `src/world.js` (Chunks, Bäume, Felsen), `src/game.js` (Schleife, Kamera, HUD).

Fortschritt: siehe [ROADMAP.md](ROADMAP.md).
