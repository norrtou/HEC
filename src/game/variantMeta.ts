import type { GameVariantId } from '../types';

/**
 * Presentation metadata for every variant — including the ones that are not
 * built yet. The menu renders all of them (unbuilt ones shadowed) so players
 * can see where the project is heading, and the info page describes each.
 *
 * Icons are deliberately abstract-but-distinct glyphs hinting at what the
 * variant measures, drawn as 24×24 stroke paths in currentColor so they
 * follow theme and accent colors for free.
 */
export interface VariantMeta {
  id: GameVariantId;
  /** false = shown shadowed in the menu, not selectable */
  implemented: boolean;
  /** inner SVG markup; wrap with variantIcon() to render */
  icon: string;
}

export function variantIcon(meta: VariantMeta): string {
  return (
    `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" ` +
    `stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${meta.icon}</svg>`
  );
}

export const VARIANT_META: VariantMeta[] = [
  {
    // Rising bubbles: a bubble headed upward — interception of moving targets.
    id: 'rising',
    implemented: true,
    icon: '<circle cx="12" cy="16" r="4"/><path d="M12 8.5V3.5M9.6 5.9 12 3.5l2.4 2.4"/>',
  },
  {
    // Random pop: scattered bubbles of varying size — detect anywhere, react.
    id: 'random',
    implemented: true,
    icon:
      '<circle cx="6.5" cy="7" r="2.2"/><circle cx="17" cy="5.8" r="1.5"/>' +
      '<circle cx="17.5" cy="15.5" r="2.8"/><circle cx="7.5" cy="17" r="1.7"/>',
  },
  {
    // Grid: 3×3 dots — even zone coverage for directional analysis.
    id: 'grid',
    implemented: true,
    icon:
      '<g fill="currentColor" stroke="none">' +
      '<circle cx="5.5" cy="5.5" r="1.5"/><circle cx="12" cy="5.5" r="1.5"/><circle cx="18.5" cy="5.5" r="1.5"/>' +
      '<circle cx="5.5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18.5" cy="12" r="1.5"/>' +
      '<circle cx="5.5" cy="18.5" r="1.5"/><circle cx="12" cy="18.5" r="1.5"/><circle cx="18.5" cy="18.5" r="1.5"/>' +
      '</g>',
  },
  {
    // Go/No-Go: one checked bubble, one struck-through — act vs withhold.
    id: 'gonogo',
    implemented: true,
    icon:
      '<circle cx="8" cy="15" r="4.6"/><path d="m6.1 15.1 1.5 1.5 2.6-3"/>' +
      '<circle cx="16.8" cy="7.6" r="3.8"/><path d="m14.1 10.3 5.4-5.4"/>',
  },
  {
    // Fitts: small target ↔ large target — the speed/precision trade-off.
    id: 'fitts',
    implemented: false,
    icon:
      '<circle cx="4.8" cy="12" r="1.8"/><circle cx="18.2" cy="12" r="3.6"/>' +
      '<path d="M8 12h5M9.6 10.4 8 12l1.6 1.6M11.4 10.4 13 12l-1.6 1.6"/>',
  },
  {
    // Finger tapping: a dot radiating ripples — raw repetition speed.
    id: 'tapping',
    implemented: false,
    icon:
      '<circle cx="12" cy="14.5" r="2.2" fill="currentColor" stroke="none"/>' +
      '<path d="M8.6 9.9a4.8 4.8 0 0 1 6.8 0M6 7.2a8.6 8.6 0 0 1 12 0"/>',
  },
  {
    // Anticipation: ball on a dotted approach to a dashed ring — timing.
    id: 'anticipation',
    implemented: false,
    icon:
      '<circle cx="16.5" cy="12" r="4.4" stroke-dasharray="2.3 2.5"/>' +
      '<circle cx="5" cy="12" r="1.9" fill="currentColor" stroke="none"/>' +
      '<path d="M8 12h3.2" stroke-dasharray="1.6 2"/>',
  },
  {
    // Trail making: nodes connected in a zigzag path — scan and sequence.
    id: 'trails',
    implemented: false,
    icon:
      '<path d="M4.8 17.5 9.5 7l4.4 8.6L19.2 6"/>' +
      '<g fill="currentColor" stroke="none"><circle cx="4.8" cy="17.5" r="1.6"/><circle cx="9.5" cy="7" r="1.6"/>' +
      '<circle cx="13.9" cy="15.6" r="1.6"/><circle cx="19.2" cy="6" r="1.6"/></g>',
  },
  {
    // Stop-signal: octagon with pause bars — cancel the action in flight.
    id: 'stopsignal',
    implemented: false,
    icon:
      '<path d="M9 3.8h6l4.2 4.2v6L15 20.2H9L4.8 16v-6z"/>' +
      '<path d="M10.3 9.7v4.6M13.7 9.7v4.6"/>',
  },
  {
    // Corsi: blocks, one lit — reproduce the spatial sequence.
    id: 'corsi',
    implemented: false,
    icon:
      '<rect x="4" y="14" width="5.6" height="5.6" rx="1.2"/>' +
      '<rect x="14.4" y="14" width="5.6" height="5.6" rx="1.2"/>' +
      '<rect x="9.2" y="4.4" width="5.6" height="5.6" rx="1.2" fill="currentColor" stroke="none"/>',
  },
  {
    // Pursuit: a ball riding a wave — continuous tracking.
    id: 'pursuit',
    implemented: false,
    icon:
      '<path d="M3 13.5c2.8-5.5 5.7-5.5 8.5 0s5.7 5.5 8.5 0"/>' +
      '<circle cx="11.5" cy="13.5" r="2" fill="currentColor" stroke="none"/>',
  },
];
