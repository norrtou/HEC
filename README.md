# HEC — Hand-Eye Coordination

A web-based game that measures hand-eye coordination: reaction time (ms), precision (mm), range of motion (ROM), directional and zone analysis. By [Norrtou Creations](https://norrtou.se).

Play it at **https://norrtou.github.io/HEC/**

No data is stored or sent — all measurement happens locally in the browser and disappears when the page closes. Only the high score and settings persist in `localStorage`.

The interface is English by default; Swedish is applied automatically for Swedish browsers or via the language setting.

## Run

```bash
npm install
npm run dev      # development server
npm run build    # production build to dist/
npm run preview  # serve the production build locally
```

Every push to `main` deploys automatically to GitHub Pages via `.github/workflows/deploy.yml`.

## Architecture

- **TypeScript + Canvas 2D**, custom minimal game engine — no framework.
- `requestAnimationFrame` for rendering, `performance.now()` for all timing.
- **Measurement is fully decoupled from rendering**: the `pointerdown` handler does only the bare minimum (timestamp + coordinates, incl. `getCoalescedEvents()`) and pushes the sample onto a queue. Hit-testing, animation, sound and statistics run later when the game loop drains the queue — a slow frame can therefore never distort a reaction time.
- Sound is synthesized with the Web Audio API (no network asset, no decoding latency).
- The PDF report (jsPDF) is lazy-loaded on first use.

## Structure

```
src/
  engine/   GameLoop, InputManager, AudioManager, ParticleSystem, Renderer, Haptics
  game/     GameSession (game logic), Bubble, Variant (3 game variants), DifficultyModel
  stats/    StatsEngine (aggregates), exporters (CSV/JSON), pdfReport (one-page A4 report)
  ui/       settingsStore, settingsPanel, statsPanel
  i18n.ts   English/Swedish dictionaries, auto-detection
```

## Metrics

Reaction time (median/mean/SD/best), precision relative to target centre (px and mm), hit rate, false clicks, range of motion, accuracy per 3×3 screen zone, and miss rate per direction (left/right/top/bottom).

Millimetre values assume a nominal 96 dpi until the user calibrates the scale in Settings (payment-card method, 85.6 mm).

## Accessibility

Inverted colours, scalable interface and text, extra target contrast, reduced motion, enlarged hit areas, tremor filter, and fully continuous pace parameters — no locked difficulty tiers. Rounds default to 60 seconds, adjustable from 15 s to 10 min.
