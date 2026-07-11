# HEC — Hand-Eye Coordination

Ett webbaserat spel som mäter hand–öga-koordination: reaktionstid (ms), precision (mm), rörelseomfång (ROM), riktnings- och zonanalys. Av [Norrtou Creations](https://norrtou.se).

Inga data sparas eller skickas — all mätning sker lokalt i webbläsaren och försvinner när sidan stängs. Endast rekordpoäng och inställningar ligger kvar i `localStorage`.

## Kör

```bash
npm install
npm run dev      # utvecklingsserver
npm run build    # produktionsbygge till dist/
npm run preview  # servera produktionsbygget lokalt
```

## Arkitektur

- **TypeScript + Canvas 2D**, egen minimal spelmotor — inget ramverk.
- `requestAnimationFrame` för rendering, `performance.now()` för all tidsmätning.
- **Mätning är helt frikopplad från rendering**: `pointerdown`-hanteraren gör bara det absolut nödvändiga (tidsstämpel + koordinater, inkl. `getCoalescedEvents()`) och lägger provet i en kö. Träfftest, animation, ljud och statistik körs senare när spelloopen tömmer kön — en långsam frame kan därför aldrig förvränga en reaktionstid.
- Ljudet syntetiseras med Web Audio API (ingen nätverksresurs, ingen avkodningslatens).
- PDF-rapporten (jsPDF) laddas lazy först när den efterfrågas.

## Struktur

```
src/
  engine/   GameLoop, InputManager, AudioManager, ParticleSystem, Renderer, Haptics
  game/     GameSession (spellogik), Bubble, Variant (3 spelvarianter), DifficultyModel
  stats/    StatsEngine (aggregat), exporters (CSV/JSON), pdfReport (ensidig A4-rapport)
  ui/       settingsStore, settingsPanel, statsPanel
```

## Mätvärden

Reaktionstid (median/snitt/SD/bästa), precision mot målcentrum (px och mm), träffprocent, felklick, rörelseomfång, träffsäkerhet per 3×3-skärmzon samt missfrekvens per riktning (vänster/höger/övre/nedre).

Millimetervärden bygger på nominell 96 dpi tills användaren kalibrerat skalan i Inställningar (betalkortsmetoden, 85,6 mm).

## Tillgänglighet

Inverterade färger, skalbart gränssnitt och text, extra kontrast på mål, minskade rörelser, förstorade träffytor, darrfilter (tremor) samt fritt justerbart tempo — inga låsta svårighetsnivåer.
