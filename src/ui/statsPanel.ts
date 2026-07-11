import type { SessionStats } from '../types';
import { ALL_ZONES } from '../stats/StatsEngine';

const ZONE_LABELS: Record<string, string> = {
  'top-left': 'Övre vänster', 'top-center': 'Övre mitten', 'top-right': 'Övre höger',
  'mid-left': 'Mitten vänster', 'mid-center': 'Mitten', 'mid-right': 'Mitten höger',
  'bottom-left': 'Nedre vänster', 'bottom-center': 'Nedre mitten', 'bottom-right': 'Nedre höger',
};

function tile(label: string, value: string, suffix = ''): string {
  return `<div class="stat-tile"><span class="k">${label}</span><span class="v">${value}${suffix ? ` <small>${suffix}</small>` : ''}</span></div>`;
}

function f(v: number | null, unit = ''): string {
  return v !== null ? `${v}${unit}` : '–';
}

export function renderStatsPanel(gridEl: HTMLElement, fullEl: HTMLElement, stats: SessionStats): void {
  gridEl.innerHTML = [
    tile('Träffar', `${stats.hitCount}/${stats.count}`, `${stats.hitRatePct}%`),
    tile('Median reaktion', f(stats.medianReactionMs), 'ms'),
    tile('Snitt reaktion', f(stats.meanReactionMs), 'ms'),
    tile('Bästa reaktion', f(stats.bestReactionMs), 'ms'),
    tile('Precision', f(stats.meanErrorMm), 'mm'),
    tile('Felklick', `${stats.falseAlarmCount}`, `${stats.falseAlarmRatePct}%`),
  ].join('');

  const bias = stats.directionalBias;
  const rom = stats.rangeOfMotionMm;
  const zoneRows = ALL_ZONES.map((z) => {
    const zs = stats.zoneStats[z];
    const rate = zs.count > 0 ? `${Math.round((zs.hits / zs.count) * 100)}%` : '–';
    return `<tr><td>${ZONE_LABELS[z]}</td><td>${zs.count}</td><td>${rate}</td><td>${zs.meanRtMs !== null ? Math.round(zs.meanRtMs) + ' ms' : '–'}</td><td>${zs.meanErrorPx !== null ? Math.round(zs.meanErrorPx) + ' px' : '–'}</td></tr>`;
  }).join('');

  fullEl.innerHTML = `
    <table>
      <tbody>
        <tr><th>Reaktionstid SD (jämnhet)</th><td>${f(stats.sdReactionMs, ' ms')}</td></tr>
        <tr><th>Precision i pixlar</th><td>${f(stats.meanErrorPx, ' px')}</td></tr>
        <tr><th>Rörelseomfång (ROM)</th><td>${rom ? `${rom.w} × ${rom.h} mm` : '–'}</td></tr>
        <tr><th>Missar vänster / höger</th><td>${bias.leftMissRatePct}% / ${bias.rightMissRatePct}%</td></tr>
        <tr><th>Missar övre / nedre</th><td>${bias.topMissRatePct}% / ${bias.bottomMissRatePct}%</td></tr>
        <tr><th>Skala</th><td>${stats.meta.pxPerMm} px/mm ${stats.meta.pxPerMmCalibrated ? '(kalibrerad)' : '(nominell — kalibrera i Inställningar)'}</td></tr>
      </tbody>
    </table>
    <table style="margin-top:0.8rem">
      <thead><tr><th>Zon</th><th>Mål</th><th>Träff%</th><th>Snitt-RT</th><th>Snittfel</th></tr></thead>
      <tbody>${zoneRows}</tbody>
    </table>
  `;
}
