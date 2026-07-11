import type { SessionStats } from '../types';

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function stamp(stats: SessionStats): string {
  return stats.meta.startedAt.replace(/[:T]/g, '-').slice(0, 19);
}

export function exportJson(stats: SessionStats): void {
  const blob = new Blob([JSON.stringify(stats, null, 2)], { type: 'application/json' });
  download(blob, `hec-session-${stamp(stats)}.json`);
}

export function exportCsv(stats: SessionStats): void {
  const header = [
    'trial_id', 'variant', 'result', 'reaction_time_ms', 'error_px', 'error_mm',
    'target_x_px', 'target_y_px', 'target_radius_px', 'hit_x_px', 'hit_y_px',
    'zone', 'pointer_type', 'spawn_time_ms', 'resolved_time_ms', 'timing_error_ms',
  ].join(',');
  const pxPerMm = stats.meta.pxPerMm;
  const rows = stats.trials.map((t) =>
    [
      t.id, t.variant, t.result,
      t.reactionTimeMs !== null ? Math.round(t.reactionTimeMs * 10) / 10 : '',
      t.errorPx !== null ? Math.round(t.errorPx * 10) / 10 : '',
      t.errorPx !== null ? Math.round((t.errorPx / pxPerMm) * 100) / 100 : '',
      Math.round(t.targetX), Math.round(t.targetY), t.targetRadiusPx,
      t.hitX !== null ? Math.round(t.hitX) : '',
      t.hitY !== null ? Math.round(t.hitY) : '',
      t.zone, t.pointerType,
      Math.round(t.spawnTime * 10) / 10, Math.round(t.resolvedTime * 10) / 10,
      t.timingErrorMs ?? '',
    ].join(','),
  );
  // Summary block as trailing comment lines keeps single-file convenience without breaking CSV parsers that skip '#'.
  const summary = [
    `# session_start,${stats.meta.startedAt}`,
    `# variant,${stats.meta.variant}`,
    `# duration_ms,${stats.meta.durationMs}`,
    `# hit_rate_pct,${stats.hitRatePct}`,
    `# mean_reaction_ms,${stats.meanReactionMs ?? ''}`,
    `# median_reaction_ms,${stats.medianReactionMs ?? ''}`,
    `# mean_error_mm,${stats.meanErrorMm ?? ''}`,
    `# px_per_mm,${stats.meta.pxPerMm} (${stats.meta.pxPerMmCalibrated ? 'calibrated' : 'nominal 96dpi'})`,
    `# user_agent,"${stats.meta.userAgent}"`,
  ];
  const blob = new Blob([[header, ...rows, ...summary].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  download(blob, `hec-session-${stamp(stats)}.csv`);
}
