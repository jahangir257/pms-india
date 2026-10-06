import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const TZ = process.env.APP_TIMEZONE || 'Asia/Kolkata';
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }) : '');
export const fmtDateTime = (d) => new Date(d || Date.now()).toLocaleString('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const slug = (s) => String(s || 'file').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'file';
export const fileName = (title, ext) => `${slug(title)}-${new Date().toISOString().slice(0, 10)}.${ext}`;

export function toCSV(columns, rows) {
  const cell = (v) => {
    if (v == null) return '';
    let s = v instanceof Date ? v.toISOString() : String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s; // CSV/formula injection guard
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return Buffer.from('\uFEFF' + [columns, ...rows].map((r) => r.map(cell).join(',')).join('\r\n'), 'utf8');
}

export async function toXLSX({ title, columns, rows }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PMS India'; wb.created = new Date(); wb.title = title;
  const ws = wb.addWorksheet(String(title || 'Report').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  ws.addRow(columns);
  rows.forEach((r) => ws.addRow(r.map((v) => (v == null ? '' : v))));
  const head = ws.getRow(1);
  head.height = 22;
  head.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFF8E7C9' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF064E3B' } }; c.alignment = { vertical: 'middle' }; });
  columns.forEach((c, i) => {
    const max = Math.max(String(c).length, ...rows.slice(0, 200).map((r) => String(r[i] ?? '').length));
    ws.getColumn(i + 1).width = Math.min(Math.max(max + 3, 10), 60);
  });
  ws.eachRow((row, n) => { if (n > 1) { row.alignment = { vertical: 'top', wrapText: true }; if (n % 2 === 0) row.eachCell({ includeEmpty: true }, (c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF9F0' } }; }); } });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const clean = (s) => String(s ?? '')
  .replace(/₹/g, 'Rs. ').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...')
  .replace(/\t/g, ' ').replace(/\r/g, '').replace(/[^\x20-\x7E\xA0-\xFF\u2022\n]/g, '?');
function wrap(text, font, size, maxW) {
  const out = [];
  for (const para of clean(text).split('\n')) {
    let line = '';
    for (let word of para.split(' ')) {
      while (font.widthOfTextAtSize(word, size) > maxW) { // hard-break very long tokens
        let i = word.length; while (i > 1 && font.widthOfTextAtSize(word.slice(0, i), size) > maxW) i--;
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, i)); word = word.slice(i);
      }
      const t = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(t, size) <= maxW) line = t; else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

export async function toPDF({ title, subtitle, columns, rows, text, textAfter }) {
  const doc = await PDFDocument.create();
  doc.setTitle(clean(title)); doc.setCreator('PMS India');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const GREEN = rgb(6 / 255, 78 / 255, 59 / 255), CREAM = rgb(248 / 255, 231 / 255, 201 / 255), LIGHT = rgb(253 / 255, 249 / 255, 240 / 255), INK = rgb(0.1, 0.12, 0.11);
  const wide = (columns?.length || 0) > 5;
  const [W, H] = wide ? [841.89, 595.28] : [595.28, 841.89];
  const M = 36;
  let page, y;
  const newPage = (first) => {
    page = doc.addPage([W, H]);
    if (first) {
      page.drawRectangle({ x: 0, y: H - 64, width: W, height: 64, color: GREEN });
      page.drawText(clean(title).slice(0, 90), { x: M, y: H - 34, size: 18, font: bold, color: CREAM });
      page.drawText(clean(subtitle || `Generated ${fmtDateTime()} (${TZ})`).slice(0, 140), { x: M, y: H - 52, size: 9, font, color: CREAM });
      y = H - 64 - 22;
    } else y = H - M;
  };
  newPage(true);
  const ensure = (h) => { if (y - h < M + 14) newPage(false); };

  const drawText = () => {
    const strip = (t) => t.replace(/`([^`]*)`/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    // split a line into words carrying a bold flag, honouring **bold** / __bold__; drops *italic* markers
    const tokens = (line, baseBold) => {
      const out = []; let bold = baseBold;
      for (const part of strip(clean(line)).split(/(\*\*|__)/)) {
        if (part === '**' || part === '__') { bold = !bold; continue; }
        for (const w of part.replace(/(^|\s)\*([^*\s][^*]*)\*(?=\s|$|[.,;:])/g, '$1$2').split(/\s+/)) if (w) out.push({ w, bold });
      }
      return out;
    };
    const drawRich = (line, size, x0, maxW, baseBold, color) => {
      const toks = tokens(line, baseBold); let lineToks = [], width = 0;
      const tw = (f, t) => [...t].reduce((a, c) => a + f.widthOfTextAtSize(c, size), 0); // no kerning: matches how pdf-lib draws
      const sp = tw(font, ' ');
      const emit = () => {
        ensure(size + 4); let x = x0;
        for (const t of lineToks) { const f = t.bold ? bold : font; page.drawText(t.w, { x, y: y - size, size, font: f, color: t.bold ? GREEN : color }); x += tw(f, t.w) + sp; }
        y -= size + 4; lineToks = []; width = 0;
      };
      for (const t of toks) {
        const w = tw(t.bold ? bold : font, t.w);
        if (lineToks.length && width + sp + w > maxW) emit();
        lineToks.push(t); width += (lineToks.length > 1 ? sp : 0) + w;
      }
      if (lineToks.length) emit(); else y -= size / 2;
    };
    for (const raw of String(text).split('\n')) {
      if (/^\s*([-*_])\1{2,}\s*$/.test(raw)) { ensure(14); page.drawLine({ start: { x: M, y: y - 6 }, end: { x: W - M, y: y - 6 }, thickness: 0.6, color: rgb(0.8, 0.72, 0.52) }); y -= 14; continue; }
      if (/^\s*\|?\s*:?-{2,}/.test(raw) && raw.includes('|')) continue; // markdown table separator
      let m;
      if ((m = /^(#{1,4})\s+(.*)/.exec(raw))) { y -= 4; drawRich(m[2], m[1].length === 1 ? 15 : 12, M, W - 2 * M, true, GREEN); }
      else if ((m = /^\s*[-*\u2022]\s+(.*)/.exec(raw))) { ensure(14); page.drawText('\u2022', { x: M + 2, y: y - 10, size: 10, font, color: GREEN }); drawRich(m[1], 10, M + 14, W - 2 * M - 14, false, INK); }
      else if ((m = /^\s*(\d+[.)])\s+(.*)/.exec(raw))) { ensure(14); page.drawText(m[1], { x: M, y: y - 10, size: 10, font: bold, color: GREEN }); drawRich(m[2], 10, M + 18, W - 2 * M - 18, false, INK); }
      else if (raw.includes('|') && /^\s*\|/.test(raw)) drawRich(raw.split('|').map((c) => c.trim()).filter(Boolean).join('   |   '), 10, M, W - 2 * M, false, INK);
      else drawRich(raw, 10, M, W - 2 * M, false, INK);
    }
    y -= 8;
    };

  if (text && !textAfter) drawText();

  if (columns?.length) {
    const avail = W - 2 * M, pad = 4, fs = 8;
    const weight = columns.map((c, i) => Math.min(Math.max(String(c).length, ...rows.slice(0, 100).map((r) => String(r[i] ?? '').length / 1.2), 6), 40));
    const total = weight.reduce((a, b) => a + b, 0);
    const widths = weight.map((w) => (w / total) * avail);
    const header = () => {
      const lines = columns.map((c, i) => wrap(c, bold, fs, widths[i] - 2 * pad));
      const h = Math.max(...lines.map((l) => l.length)) * 10 + 2 * pad;
      ensure(h + 10);
      page.drawRectangle({ x: M, y: y - h, width: avail, height: h, color: GREEN });
      let x = M; lines.forEach((l, i) => { l.forEach((t, k) => page.drawText(t, { x: x + pad, y: y - pad - 8 - k * 10, size: fs, font: bold, color: CREAM })); x += widths[i]; });
      y -= h;
    };
    header();
    rows.forEach((r, ri) => {
      const lines = columns.map((_, i) => wrap(r[i] instanceof Date ? fmtDate(r[i]) : r[i] ?? '', font, fs, widths[i] - 2 * pad));
      const h = Math.max(...lines.map((l) => l.length)) * 10 + 2 * pad;
      if (y - h < M + 14) { newPage(false); header(); }
      if (ri % 2 === 0) page.drawRectangle({ x: M, y: y - h, width: avail, height: h, color: LIGHT });
      let x = M; lines.forEach((l, i) => { l.forEach((t, k) => page.drawText(t, { x: x + pad, y: y - pad - 8 - k * 10, size: fs, font, color: INK })); x += widths[i]; });
      page.drawLine({ start: { x: M, y: y - h }, end: { x: M + avail, y: y - h }, thickness: 0.4, color: rgb(0.88, 0.82, 0.68) });
      y -= h;
    });
    if (!rows.length) { ensure(20); page.drawText('No records found.', { x: M, y: y - 14, size: 10, font, color: INK }); }
  }
  if (text && textAfter) { if (columns?.length) y -= 14; drawText(); }
  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${pages.length}  |  PMS India`, { x: M, y: 18, size: 8, font, color: rgb(0.4, 0.4, 0.4) }));
  return Buffer.from(await doc.save());
}

export const MIME = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv; charset=utf-8', png: 'image/png' };
export async function renderFile(format, spec) {
  const { columns = [], rows = [] } = spec;
  if (format === 'csv') return { buffer: toCSV(columns, rows), mime: MIME.csv, ext: 'csv' };
  if (format === 'xlsx') return { buffer: await toXLSX(spec), mime: MIME.xlsx, ext: 'xlsx' };
  if (format === 'pdf') return { buffer: await toPDF(spec), mime: MIME.pdf, ext: 'pdf' };
  throw new Error('Unsupported format: ' + format);
}
