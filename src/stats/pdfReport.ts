import { jsPDF } from 'jspdf';
import type { SessionStats } from '../types';
import { ALL_ZONES } from './StatsEngine';

const INK = '#14141c';
const ACCENT = '#0e8f84';
const MUTED = '#6b6b78';
const LIGHT = '#e8e6df';

const VARIANT_LABELS: Record<string, string> = {
  rising: 'Stigande bubblor',
  random: 'Slumpvis dyk',
  grid: 'Rutnät',
};

/** One-page A4 landscape report: key figures, reaction-time trend, zone heatmap, aggregate table. */
export function exportPdf(stats: SessionStats): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297;
  const M = 14;

  // ---- Header ----
  doc.setFillColor(INK);
  doc.rect(0, 0, W, 24, 'F');
  doc.setTextColor('#ffffff');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('HEC — Hand-Eye Coordination Report', M, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const started = new Date(stats.meta.startedAt);
  const dateStr = started.toLocaleString(stats.meta.language || 'sv-SE');
  doc.text(
    `${dateStr}  ·  Variant: ${VARIANT_LABELS[stats.meta.variant] ?? stats.meta.variant}  ·  Längd: ${(stats.meta.durationMs / 1000).toFixed(0)} s  ·  Pekdon: ${stats.meta.pointerTypesUsed.join(', ') || '–'}`,
    M, 17,
  );
  doc.setTextColor('#9ad8d1');
  doc.text('Norrtou Creations · norrtou.se · Inga data sparas — rapporten genereras lokalt i din webbläsare.', M, 21.5);

  // ---- Key figure tiles ----
  const tiles: [string, string][] = [
    ['Träffar', `${stats.hitCount}/${stats.count} (${stats.hitRatePct}%)`],
    ['Median reaktionstid', stats.medianReactionMs !== null ? `${stats.medianReactionMs} ms` : '–'],
    ['Snitt reaktionstid', stats.meanReactionMs !== null ? `${stats.meanReactionMs} ms ± ${stats.sdReactionMs ?? 0}` : '–'],
    ['Precision (snittfel)', stats.meanErrorMm !== null ? `${stats.meanErrorMm} mm` : '–'],
    ['Felklick', `${stats.falseAlarmCount} (${stats.falseAlarmRatePct}%)`],
    ['Poäng (bästa)', `${stats.highScore}`],
  ];
  const tileW = (W - M * 2 - 5 * 4) / 6;
  tiles.forEach(([label, value], i) => {
    const x = M + i * (tileW + 4);
    doc.setFillColor(LIGHT);
    doc.roundedRect(x, 30, tileW, 18, 2, 2, 'F');
    doc.setTextColor(MUTED);
    doc.setFontSize(7);
    doc.text(label.toUpperCase(), x + 3, 36);
    doc.setTextColor(INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(value, x + 3, 43.5);
    doc.setFont('helvetica', 'normal');
  });

  const chartTop = 56;
  const chartH = 62;

  // ---- Reaction time over trials (line chart) ----
  const rtChartX = M;
  const rtChartW = 150;
  drawSectionTitle(doc, 'Reaktionstid per träff (ms)', rtChartX, chartTop - 2);
  const rts = stats.trials.filter((t) => t.reactionTimeMs !== null).map((t) => t.reactionTimeMs!);
  drawAxes(doc, rtChartX, chartTop, rtChartW, chartH);
  if (rts.length > 0) {
    const maxRt = Math.max(...rts) * 1.15;
    doc.setDrawColor(ACCENT);
    doc.setLineWidth(0.5);
    let prev: [number, number] | null = null;
    rts.forEach((rt, i) => {
      const x = rtChartX + 6 + (rtChartW - 12) * (rts.length === 1 ? 0.5 : i / (rts.length - 1));
      const y = chartTop + chartH - 6 - (chartH - 12) * (rt / maxRt);
      if (prev) doc.line(prev[0], prev[1], x, y);
      prev = [x, y];
      doc.setFillColor(ACCENT);
      doc.circle(x, y, 0.7, 'F');
    });
    // y-axis reference labels
    doc.setTextColor(MUTED);
    doc.setFontSize(6.5);
    doc.text(`${Math.round(maxRt)}`, rtChartX + 1, chartTop + 6);
    doc.text('0', rtChartX + 1, chartTop + chartH - 2);
    if (stats.medianReactionMs !== null) {
      const my = chartTop + chartH - 6 - (chartH - 12) * (stats.medianReactionMs / maxRt);
      doc.setDrawColor(MUTED);
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.line(rtChartX + 6, my, rtChartX + rtChartW - 6, my);
      doc.setLineDashPattern([], 0);
      doc.text(`median ${stats.medianReactionMs}`, rtChartX + rtChartW - 28, my - 1.5);
    }
  } else {
    drawEmpty(doc, rtChartX, chartTop, rtChartW, chartH);
  }

  // ---- Zone heatmap (3x3 hit rate) ----
  const hmX = rtChartX + rtChartW + 12;
  const hmSize = chartH;
  drawSectionTitle(doc, 'Träffsäkerhet per skärmzon', hmX, chartTop - 2);
  const cell = hmSize / 3;
  ALL_ZONES.forEach((zone, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const z = stats.zoneStats[zone];
    const rate = z.count > 0 ? z.hits / z.count : null;
    const x = hmX + col * cell;
    const y = chartTop + row * cell;
    if (rate === null) {
      doc.setFillColor('#f0efe9');
    } else {
      // interpolate light -> accent by hit rate
      const t = rate;
      const r = Math.round(232 + (14 - 232) * t);
      const g = Math.round(230 + (143 - 230) * t);
      const b = Math.round(223 + (132 - 223) * t);
      doc.setFillColor(r, g, b);
    }
    doc.rect(x, y, cell - 1, cell - 1, 'F');
    doc.setFontSize(7);
    doc.setTextColor(rate !== null && rate > 0.55 ? '#ffffff' : INK);
    doc.text(rate === null ? '–' : `${Math.round(rate * 100)}%`, x + cell / 2 - 1, y + cell / 2, { align: 'center' });
    doc.setFontSize(5.5);
    doc.setTextColor(rate !== null && rate > 0.55 ? '#d8eeeb' : MUTED);
    doc.text(`n=${z.count}`, x + cell / 2 - 1, y + cell / 2 + 3.5, { align: 'center' });
  });

  // ---- Directional bias ----
  const dbX = hmX + hmSize + 12;
  drawSectionTitle(doc, 'Missar per riktning', dbX, chartTop - 2);
  const bias = stats.directionalBias;
  const biasRows: [string, number][] = [
    ['Vänster', bias.leftMissRatePct],
    ['Höger', bias.rightMissRatePct],
    ['Övre', bias.topMissRatePct],
    ['Nedre', bias.bottomMissRatePct],
  ];
  const barMaxW = W - M - dbX - 22;
  biasRows.forEach(([label, val], i) => {
    const y = chartTop + 6 + i * 14;
    doc.setTextColor(INK);
    doc.setFontSize(8);
    doc.text(label, dbX, y + 3);
    doc.setFillColor(LIGHT);
    doc.roundedRect(dbX + 16, y, barMaxW, 5, 1, 1, 'F');
    doc.setFillColor('#c2543f');
    if (val > 0) doc.roundedRect(dbX + 16, y, Math.max(2, barMaxW * (val / 100)), 5, 1, 1, 'F');
    doc.setTextColor(MUTED);
    doc.setFontSize(7);
    doc.text(`${val}%`, dbX + 16 + barMaxW + 1.5, y + 4);
  });

  // ---- Aggregate table ----
  const tblY = chartTop + chartH + 12;
  drawSectionTitle(doc, 'Sammanställning', M, tblY - 2);
  const romStr = stats.rangeOfMotionMm ? `${stats.rangeOfMotionMm.w} × ${stats.rangeOfMotionMm.h} mm` : '–';
  const rows: [string, string][] = [
    ['Antal mål / träffar / missar', `${stats.count} / ${stats.hitCount} / ${stats.missCount}`],
    ['Reaktionstid (median / snitt / SD / bästa)', `${fmt(stats.medianReactionMs)} / ${fmt(stats.meanReactionMs)} / ${fmt(stats.sdReactionMs)} / ${fmt(stats.bestReactionMs)} ms`],
    ['Precision, avstånd från målcentrum (snitt)', stats.meanErrorMm !== null ? `${stats.meanErrorMm} mm (${stats.meanErrorPx} px)` : '–'],
    ['Rörelseomfång (ROM), bredd × höjd', romStr],
    ['Felklick utanför mål', `${stats.falseAlarmCount} st (${stats.falseAlarmRatePct}%)`],
    ['Skala', `${stats.meta.pxPerMm} px/mm ${stats.meta.pxPerMmCalibrated ? '(kalibrerad)' : '(nominell 96 dpi — kalibrera i Inställningar för exakta mm)'}`],
  ];
  doc.setFontSize(8);
  const colSplit = 105;
  rows.forEach(([k, v], i) => {
    const y = tblY + 5 + i * 6.4;
    if (i % 2 === 0) {
      doc.setFillColor('#f4f3ee');
      doc.rect(M, y - 4.2, W - M * 2, 6.4, 'F');
    }
    doc.setTextColor(MUTED);
    doc.text(k, M + 2, y);
    doc.setTextColor(INK);
    doc.setFont('helvetica', 'bold');
    doc.text(v, M + colSplit, y);
    doc.setFont('helvetica', 'normal');
  });

  // ---- Footer: environment ----
  const footY = 200;
  doc.setDrawColor(LIGHT);
  doc.setLineWidth(0.3);
  doc.line(M, footY - 4, W - M, footY - 4);
  doc.setTextColor(MUTED);
  doc.setFontSize(6.5);
  const env = [
    `Webbläsare: ${stats.meta.userAgent}`,
    `Skärm: ${stats.meta.screenW}×${stats.meta.screenH} @ ${stats.meta.devicePixelRatio}x` +
      (stats.meta.hardwareConcurrency ? `  ·  CPU-trådar: ${stats.meta.hardwareConcurrency}` : '') +
      (stats.meta.deviceMemoryGb ? `  ·  Minne: minst ${stats.meta.deviceMemoryGb} GB` : '') +
      `  ·  Tidszon: ${stats.meta.timeZone}  ·  Språk: ${stats.meta.language}`,
    'OBS: Jämför endast resultat som uppmätts på samma enhet, webbläsare och pekdon — hårdvarans latens och skärmstorlek påverkar mätvärdena.',
  ];
  env.forEach((line, i) => doc.text(line, M, footY + i * 3.4, { maxWidth: W - M * 2 }));

  const ts = stats.meta.startedAt.replace(/[:T]/g, '-').slice(0, 19);
  doc.save(`hec-rapport-${ts}.pdf`);
}

function fmt(v: number | null): string {
  return v !== null ? String(v) : '–';
}

function drawSectionTitle(doc: jsPDF, title: string, x: number, y: number): void {
  doc.setTextColor(INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(title.toUpperCase(), x, y);
  doc.setFont('helvetica', 'normal');
}

function drawAxes(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  doc.setFillColor('#fafaf7');
  doc.rect(x, y, w, h, 'F');
  doc.setDrawColor(LIGHT);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h, 'S');
}

function drawEmpty(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  doc.setTextColor(MUTED);
  doc.setFontSize(8);
  doc.text('Inga träffar registrerade', x + w / 2, y + h / 2, { align: 'center' });
}
