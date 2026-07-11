import type { GameVariantId, SessionStats } from '../types';
import { ALL_ZONES } from '../stats/StatsEngine';
import { t } from '../i18n';

function tile(label: string, value: string, suffix = ''): string {
  return `<div class="stat-tile"><span class="k">${label}</span><span class="v">${value}${suffix ? ` <small>${suffix}</small>` : ''}</span></div>`;
}

function f(v: number | null, unit = ''): string {
  return v !== null ? `${v}${unit}` : '–';
}

function signed(v: number | null): string {
  return v !== null ? `${v > 0 ? '+' : ''}${v}` : '–';
}

type TileId =
  | 'hits' | 'medianRt' | 'meanRt' | 'bestRt' | 'precision' | 'false'
  | 'commissions' | 'commissionRt'
  | 'throughput' | 'mt'
  | 'tapsPerSec' | 'itiSd'
  | 'ae' | 'ce' | 've'
  | 'linkA' | 'linkB' | 'flex' | 'seqErr'
  | 'ssrt' | 'stopSuccess' | 'ssd'
  | 'corsiSpan' | 'corsiSeqs'
  | 'tot' | 'dist' | 'rms'
  | 'searchSlopeC' | 'searchSlopeF' | 'searchMeanC' | 'searchMeanF' | 'searchErrors';

/**
 * Per-variant tile layout: the paradigm's headline measure comes first (and is
 * highlighted), supporting measures follow, and metrics that mean nothing for
 * the variant are omitted entirely — e.g. reaction time on the finger tapping
 * test, or hit counts on pursuit where there is nothing to tap.
 */
const TILE_ORDER: Record<GameVariantId, TileId[]> = {
  rising: ['medianRt', 'hits', 'precision', 'bestRt', 'meanRt', 'false'],
  random: ['medianRt', 'hits', 'precision', 'bestRt', 'meanRt', 'false'],
  grid: ['medianRt', 'hits', 'precision', 'bestRt', 'meanRt', 'false'],
  gonogo: ['commissions', 'commissionRt', 'medianRt', 'hits', 'precision', 'false'],
  fitts: ['throughput', 'mt', 'hits', 'precision', 'false'],
  tapping: ['tapsPerSec', 'itiSd', 'precision', 'false'],
  anticipation: ['ae', 'ce', 've', 'hits', 'false'],
  trails: ['linkA', 'linkB', 'flex', 'seqErr', 'false'],
  stopsignal: ['ssrt', 'stopSuccess', 'ssd', 'medianRt', 'hits', 'false'],
  corsi: ['corsiSpan', 'corsiSeqs'],
  pursuit: ['tot', 'dist', 'rms'],
  search: ['searchSlopeC', 'searchSlopeF', 'searchMeanC', 'searchMeanF', 'searchErrors', 'false'],
};

/** Variants where targets are spread over the screen and can be missed — only there do zone accuracy and directional bias mean anything. */
const ZONE_VARIANTS: GameVariantId[] = ['rising', 'random', 'grid', 'gonogo', 'stopsignal'];

export function renderStatsPanel(gridEl: HTMLElement, fullEl: HTMLElement, stats: SessionStats): void {
  const v = stats.meta.variant;
  const g = stats.gonogo;
  const fi = stats.fitts;
  const tp = stats.tapping;
  const an = stats.anticipation;
  const tr = stats.trails;
  const ss = stats.stopsignal;
  const co = stats.corsi;
  const pu = stats.pursuit;
  const se = stats.search;
  // In the inhibition variants only the green targets are tappable, so name them.
  const hitsLabel = v === 'gonogo' || v === 'stopsignal' ? t('stats.hitsGo') : t('stats.hits');

  const defs: Record<TileId, () => string | null> = {
    hits: () => tile(hitsLabel, `${stats.hitCount}/${stats.count}`, `${stats.hitRatePct}%`),
    medianRt: () => (stats.medianReactionMs !== null ? tile(t('stats.medianRt'), f(stats.medianReactionMs), 'ms') : null),
    meanRt: () => (stats.meanReactionMs !== null ? tile(t('stats.meanRt'), f(stats.meanReactionMs), 'ms') : null),
    bestRt: () => (stats.bestReactionMs !== null ? tile(t('stats.bestRt'), f(stats.bestReactionMs), 'ms') : null),
    precision: () => (stats.meanErrorMm !== null ? tile(t('stats.precision'), f(stats.meanErrorMm), 'mm') : null),
    false: () => tile(t('stats.falseClicks'), `${stats.falseAlarmCount}`, `${stats.falseAlarmRatePct}%`),
    commissions: () => (g ? tile(t('stats.commissions'), `${g.commissionCount}/${g.noGoCount}`, `${g.commissionRatePct}%`) : null),
    commissionRt: () => (g ? tile(t('stats.commissionRt'), f(g.meanCommissionRtMs), 'ms') : null),
    throughput: () => (fi ? tile(t('stats.throughput'), f(fi.throughputBps), 'bits/s') : null),
    mt: () => (fi ? tile(t('stats.mt'), f(fi.meanMtMs), 'ms') : null),
    tapsPerSec: () => (tp ? tile(t('stats.tapsPerSec'), f(tp.tapsPerSec), '/s') : null),
    itiSd: () => (tp ? tile(t('stats.itiSd'), f(tp.sdItiMs), 'ms') : null),
    ae: () => (an ? tile(t('stats.timingAe'), f(an.meanAbsErrMs), 'ms') : null),
    ce: () => (an ? tile(t('stats.timingCe'), signed(an.constantErrMs), 'ms') : null),
    ve: () => (an ? tile(t('stats.timingVe'), f(an.variableErrMs), 'ms') : null),
    linkA: () => (tr ? tile(t('stats.linkA'), f(tr.meanLinkAMs), 'ms') : null),
    linkB: () => (tr ? tile(t('stats.linkB'), f(tr.meanLinkBMs), 'ms') : null),
    flex: () => (tr ? tile(t('stats.flexCost'), signed(tr.flexibilityCostMs), 'ms') : null),
    seqErr: () => (tr ? tile(t('stats.seqErrors'), `${tr.sequenceErrors}`) : null),
    ssrt: () => (ss ? tile(t('stats.ssrt'), f(ss.ssrtMs), 'ms') : null),
    stopSuccess: () =>
      ss
        ? tile(
            t('stats.stopSuccess'),
            `${Math.round((ss.stopSuccessRatePct / 100) * ss.stopCount)}/${ss.stopCount}`,
            `${ss.stopSuccessRatePct}%`,
          )
        : null,
    ssd: () => (ss ? tile(t('stats.meanSsd'), f(ss.meanSsdMs), 'ms') : null),
    corsiSpan: () => (co ? tile(t('stats.corsiSpan'), `${co.span}`) : null),
    corsiSeqs: () => (co ? tile(t('stats.corsiSeqs'), `${co.sequencesCompleted}/${co.sequencesCompleted + co.sequencesFailed}`) : null),
    tot: () => (pu ? tile(t('stats.pursuitTot'), pu.timeOnTargetPct !== null ? `${pu.timeOnTargetPct}` : '–', '%') : null),
    dist: () => (pu ? tile(t('stats.pursuitDist'), f(pu.meanDistMm), 'mm') : null),
    rms: () => (pu ? tile(t('stats.pursuitRms'), f(pu.rmsDistMm), 'mm') : null),
    searchSlopeC: () => (se ? tile(t('stats.searchSlopeC'), f(se.conjunctionSlopeMsPerItem), 'ms/obj') : null),
    searchSlopeF: () => (se ? tile(t('stats.searchSlopeF'), f(se.featureSlopeMsPerItem), 'ms/obj') : null),
    searchMeanC: () => (se ? tile(t('stats.searchMeanC'), f(se.conjunctionMeanMs), 'ms') : null),
    searchMeanF: () => (se ? tile(t('stats.searchMeanF'), f(se.featureMeanMs), 'ms') : null),
    searchErrors: () => (se ? tile(t('stats.searchErrors'), `${se.errors}`) : null),
  };

  const tiles = TILE_ORDER[v].map((id) => defs[id]()).filter((x): x is string => x !== null);
  if (tiles.length > 0) tiles[0] = tiles[0].replace('stat-tile', 'stat-tile primary');
  gridEl.innerHTML = tiles.join('');

  // ---- Details: only rows that carry information for this variant ----
  const bias = stats.directionalBias;
  const rom = stats.rangeOfMotionMm;
  const zoned = ZONE_VARIANTS.includes(v);
  const rows: [string, string][] = [];
  if (stats.sdReactionMs !== null) rows.push([t('stats.sdRt'), `${stats.sdReactionMs} ms`]);
  if (stats.meanErrorPx !== null) rows.push([t('stats.precisionPx'), `${stats.meanErrorPx} px`]);
  if (rom) rows.push([t('stats.rom'), `${rom.w} × ${rom.h} mm`]);
  if (zoned) {
    rows.push([t('stats.missLR'), `${bias.leftMissRatePct}% / ${bias.rightMissRatePct}%`]);
    rows.push([t('stats.missTB'), `${bias.topMissRatePct}% / ${bias.bottomMissRatePct}%`]);
  }
  rows.push([t('stats.scale'), `${stats.meta.pxPerMm} px/mm ${stats.meta.pxPerMmCalibrated ? t('stats.calibrated') : t('stats.nominal')}`]);

  const zoneRows = ALL_ZONES.map((z) => {
    const zs = stats.zoneStats[z];
    const rate = zs.count > 0 ? `${Math.round((zs.hits / zs.count) * 100)}%` : '–';
    return `<tr><td>${t(`zone.${z}` as Parameters<typeof t>[0])}</td><td>${zs.count}</td><td>${rate}</td><td>${zs.meanRtMs !== null ? Math.round(zs.meanRtMs) + ' ms' : '–'}</td><td>${zs.meanErrorPx !== null ? Math.round(zs.meanErrorPx) + ' px' : '–'}</td></tr>`;
  }).join('');

  fullEl.innerHTML = `
    <table>
      <tbody>${rows.map(([k, val]) => `<tr><th>${k}</th><td>${val}</td></tr>`).join('')}</tbody>
    </table>
    ${
      zoned
        ? `<table style="margin-top:0.8rem">
      <thead><tr><th>${t('stats.zone')}</th><th>${t('stats.targets')}</th><th>${t('stats.hitPct')}</th><th>${t('stats.avgRt')}</th><th>${t('stats.avgErr')}</th></tr></thead>
      <tbody>${zoneRows}</tbody>
    </table>`
        : ''
    }
  `;
}
