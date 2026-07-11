import type { SessionStats } from '../types';
import { ALL_ZONES } from '../stats/StatsEngine';
import { t } from '../i18n';

function tile(label: string, value: string, suffix = ''): string {
  return `<div class="stat-tile"><span class="k">${label}</span><span class="v">${value}${suffix ? ` <small>${suffix}</small>` : ''}</span></div>`;
}

function f(v: number | null, unit = ''): string {
  return v !== null ? `${v}${unit}` : '–';
}

export function renderStatsPanel(gridEl: HTMLElement, fullEl: HTMLElement, stats: SessionStats): void {
  const g = stats.gonogo;
  gridEl.innerHTML = [
    tile(t('stats.hits'), `${stats.hitCount}/${stats.count}`, `${stats.hitRatePct}%`),
    tile(t('stats.medianRt'), f(stats.medianReactionMs), 'ms'),
    tile(t('stats.meanRt'), f(stats.meanReactionMs), 'ms'),
    tile(t('stats.bestRt'), f(stats.bestReactionMs), 'ms'),
    tile(t('stats.precision'), f(stats.meanErrorMm), 'mm'),
    tile(t('stats.falseClicks'), `${stats.falseAlarmCount}`, `${stats.falseAlarmRatePct}%`),
    ...(g
      ? [
          tile(t('stats.commissions'), `${g.commissionCount}/${g.noGoCount}`, `${g.commissionRatePct}%`),
          tile(t('stats.commissionRt'), f(g.meanCommissionRtMs), 'ms'),
        ]
      : []),
    ...(stats.fitts
      ? [
          tile(t('stats.throughput'), f(stats.fitts.throughputBps), 'bits/s'),
          tile(t('stats.mt'), f(stats.fitts.meanMtMs), 'ms'),
        ]
      : []),
    ...(stats.tapping
      ? [
          tile(t('stats.tapsPerSec'), f(stats.tapping.tapsPerSec), '/s'),
          tile(t('stats.itiSd'), f(stats.tapping.sdItiMs), 'ms'),
        ]
      : []),
    ...(stats.pursuit
      ? [
          tile(
            t('stats.pursuitTot'),
            stats.pursuit.timeOnTargetPct !== null ? `${stats.pursuit.timeOnTargetPct}` : '–',
            '%',
          ),
          tile(t('stats.pursuitDist'), f(stats.pursuit.meanDistMm), 'mm'),
          tile(t('stats.pursuitRms'), f(stats.pursuit.rmsDistMm), 'mm'),
        ]
      : []),
    ...(stats.corsi
      ? [
          tile(t('stats.corsiSpan'), `${stats.corsi.span}`),
          tile(
            t('stats.corsiSeqs'),
            `${stats.corsi.sequencesCompleted}/${stats.corsi.sequencesCompleted + stats.corsi.sequencesFailed}`,
          ),
        ]
      : []),
    ...(stats.stopsignal
      ? [
          tile(t('stats.ssrt'), f(stats.stopsignal.ssrtMs), 'ms'),
          tile(
            t('stats.stopSuccess'),
            `${Math.round((stats.stopsignal.stopSuccessRatePct / 100) * stats.stopsignal.stopCount)}/${stats.stopsignal.stopCount}`,
            `${stats.stopsignal.stopSuccessRatePct}%`,
          ),
          tile(t('stats.meanSsd'), f(stats.stopsignal.meanSsdMs), 'ms'),
        ]
      : []),
    ...(stats.trails
      ? [
          tile(t('stats.linkA'), f(stats.trails.meanLinkAMs), 'ms'),
          tile(t('stats.linkB'), f(stats.trails.meanLinkBMs), 'ms'),
          tile(
            t('stats.flexCost'),
            stats.trails.flexibilityCostMs !== null
              ? `${stats.trails.flexibilityCostMs > 0 ? '+' : ''}${stats.trails.flexibilityCostMs}`
              : '–',
            'ms',
          ),
          tile(t('stats.seqErrors'), `${stats.trails.sequenceErrors}`),
        ]
      : []),
    ...(stats.anticipation
      ? [
          tile(t('stats.timingAe'), f(stats.anticipation.meanAbsErrMs), 'ms'),
          tile(
            t('stats.timingCe'),
            stats.anticipation.constantErrMs !== null
              ? `${stats.anticipation.constantErrMs > 0 ? '+' : ''}${stats.anticipation.constantErrMs}`
              : '–',
            'ms',
          ),
          tile(t('stats.timingVe'), f(stats.anticipation.variableErrMs), 'ms'),
        ]
      : []),
  ].join('');

  const bias = stats.directionalBias;
  const rom = stats.rangeOfMotionMm;
  const zoneRows = ALL_ZONES.map((z) => {
    const zs = stats.zoneStats[z];
    const rate = zs.count > 0 ? `${Math.round((zs.hits / zs.count) * 100)}%` : '–';
    return `<tr><td>${t(`zone.${z}` as Parameters<typeof t>[0])}</td><td>${zs.count}</td><td>${rate}</td><td>${zs.meanRtMs !== null ? Math.round(zs.meanRtMs) + ' ms' : '–'}</td><td>${zs.meanErrorPx !== null ? Math.round(zs.meanErrorPx) + ' px' : '–'}</td></tr>`;
  }).join('');

  fullEl.innerHTML = `
    <table>
      <tbody>
        <tr><th>${t('stats.sdRt')}</th><td>${f(stats.sdReactionMs, ' ms')}</td></tr>
        <tr><th>${t('stats.precisionPx')}</th><td>${f(stats.meanErrorPx, ' px')}</td></tr>
        <tr><th>${t('stats.rom')}</th><td>${rom ? `${rom.w} × ${rom.h} mm` : '–'}</td></tr>
        <tr><th>${t('stats.missLR')}</th><td>${bias.leftMissRatePct}% / ${bias.rightMissRatePct}%</td></tr>
        <tr><th>${t('stats.missTB')}</th><td>${bias.topMissRatePct}% / ${bias.bottomMissRatePct}%</td></tr>
        <tr><th>${t('stats.scale')}</th><td>${stats.meta.pxPerMm} px/mm ${stats.meta.pxPerMmCalibrated ? t('stats.calibrated') : t('stats.nominal')}</td></tr>
      </tbody>
    </table>
    <table style="margin-top:0.8rem">
      <thead><tr><th>${t('stats.zone')}</th><th>${t('stats.targets')}</th><th>${t('stats.hitPct')}</th><th>${t('stats.avgRt')}</th><th>${t('stats.avgErr')}</th></tr></thead>
      <tbody>${zoneRows}</tbody>
    </table>
  `;
}
