#!/usr/bin/env node
// Post-processes an archify `deliver` HTML output (optionally already run through
// inject-drilldown.mjs) to replace the flat bullet-list `cards` section with a real
// HTML <table> for gate-status content.
//
// Why this exists: a "claimed vs actual, per gate" comparison is a table by shape --
// one row per gate, same four columns every time. archify's native `cards` field
// (a dot + title + a flat list of bullet strings) can hold the same facts but loses
// the column alignment, so gate name / claimed behavior / actual status / how it's
// bypassed all run together in one paragraph per bullet. A hand-drawn reference
// diagram used a real 4-column table for exactly this content and was more legible.
// This restores that shape without touching archify's own rendering.
//
// Gotcha: this section's max-width hardcodes the same max(1440px, min(94vw, 2200px))
// formula as inject-drilldown.mjs's `.container` override, so the table lines up with
// the diagram above it instead of being capped at archify's stock 1440px while the
// diagram (if already widened) fills the full reader width. If you ever change that
// formula in inject-drilldown.mjs, change it here too -- and if you run this script
// WITHOUT inject-drilldown.mjs first, `.container` stays at the stock 1440px while
// this section is already widened, which is the same mismatch in reverse.
//
// Usage:
//   node inject-gate-table.mjs <delivered.html> <rows.json> <output.html>
//
// rows.json shape:
// [
//   {
//     "gate": "Router risk_tier 分類",
//     "claimed": "全流程的守門",          // what the diagram/docs claim this gate does
//     "status": "ok" | "partial" | "gap", // ok=green real block, partial=amber, gap=red label-only
//     "statusLabel": "已修復，真的接線",   // short status text shown next to the dot
//     "detail": "devos work create 建管線前呼叫 route_work_item；risk_tier 不再恆為 None"
//   },
//   ...
// ]
//
// This script REPLACES archify's own `.cards` section (if present) with the table --
// it does not add a second, redundant summary block. It refuses to run twice on the
// same file (checks for its own marker) and refuses to run on something that isn't a
// full archify HTML document. It never modifies the input file.

import { readFileSync, writeFileSync } from 'node:fs';

const [, , inputPath, rowsPath, outputPath] = process.argv;
if (!inputPath || !rowsPath || !outputPath) {
  console.error('Usage: node inject-gate-table.mjs <delivered.html> <rows.json> <output.html>');
  process.exit(1);
}

const html = readFileSync(inputPath, 'utf8');
const rows = JSON.parse(readFileSync(rowsPath, 'utf8'));

if (!html.includes('</body>') || !html.includes('<svg')) {
  console.error(`${inputPath} does not look like a full archify HTML document (no </body> or <svg>).`);
  process.exit(1);
}
if (html.includes('id="gate-table-style"')) {
  console.error(`${inputPath} already has a gate table injected (found id="gate-table-style"). Refusing to run twice.`);
  process.exit(1);
}

const STATUS = {
  ok: { dot: '#22c55e', label: '🟢' },
  partial: { dot: '#e0a63c', label: '🟡' },
  gap: { dot: '#e05252', label: '🔴' },
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const bodyRows = rows.map((r) => {
  const s = STATUS[r.status] || STATUS.gap;
  return `
      <tr>
        <td class="gt-gate">${esc(r.gate)}</td>
        <td class="gt-claimed">${esc(r.claimed)}</td>
        <td class="gt-status"><span class="gt-dot" style="background:${s.dot}"></span>${esc(r.statusLabel)}</td>
        <td class="gt-detail">${esc(r.detail)}</td>
      </tr>`;
}).join('');

const block = `
<style id="gate-table-style">
  /* Sized to match the diagram's own text, not arbitrary HTML defaults: the SVG
     above is scaled up to fill --archify-reader-width, so its "12px" Legend label
     renders at ~26px bounding-box height on a wide desktop. Plain HTML text in
     normal document flow doesn't get that scale-up, so this table's font sizes
     are picked to look the same size as the diagram's node/legend text at typical
     desktop widths, not to match some generic "table text" convention. */
  /* Must track the SAME effective width as archify's own .container -- if that has
     been widened (see the drilldown drawer's .container override for dense diagrams),
     reusing archify's bare --archify-reader-width fallback here would leave this
     section narrower than the diagram above it, with large empty gutters on both
     sides that don't match the diagram's own width. */
  #gate-table-section { max-width: max(1440px, min(94vw, 2200px)); margin: 28px auto 0; padding: 0 1.5rem; }
  #gate-table-section h2 {
    font-size: 20px; font-weight: 700; color: var(--text); margin: 0 0 6px;
    display: flex; align-items: center; gap: 8px;
  }
  #gate-table-section .gt-sub { font-size: 14px; color: var(--text-muted); margin: 0 0 16px; line-height: 1.6; }
  #gate-table-wrap { overflow-x: auto; border: 1px solid var(--panel-border); border-radius: 10px; background: var(--bg); }
  #gate-table { width: 100%; border-collapse: collapse; font-size: 15.5px; }
  #gate-table th {
    text-align: left; font-size: 13px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    color: var(--text-muted); padding: 12px 16px; border-bottom: 1px solid var(--panel-border);
    background: var(--panel);
  }
  #gate-table td { padding: 15px 16px; border-bottom: 1px solid var(--panel-border); vertical-align: top; color: var(--text); }
  #gate-table tr:last-child td { border-bottom: none; }
  #gate-table .gt-gate { font-weight: 600; white-space: nowrap; }
  /* --text-dim (e.g. #475569 in dark Classic) is too low-contrast for body copy
     someone actually has to read, not just a decorative label -- it was picked
     without checking against --bg, and these two columns carry the real content
     (what the diagram claims, how the gate is actually bypassed), not a caption.
     --text-muted is the same token the diagram's own node sublabels and the
     Legend row use, so this also keeps the table's secondary-text contrast
     consistent with the diagram above it instead of inventing a dimmer tier. */
  #gate-table .gt-claimed, #gate-table .gt-detail { color: var(--text-muted); line-height: 1.65; }
  #gate-table .gt-status { white-space: nowrap; font-weight: 600; }
  #gate-table .gt-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 8px; }
  @media (max-width: 720px) { #gate-table-section { padding: 0 1rem; } #gate-table { font-size: 14px; } }
</style>
<div id="gate-table-section">
  <h2>關卡實況 —— 圖上畫成「關卡」的東西，逐一實測</h2>
  <p class="gt-sub">依「治理欄位有沒有牙齒」判準：🟢 有讀取端會擋・🟡 只約束同類資料／部分成立・🔴 只有寫入與顯示</p>
  <div id="gate-table-wrap">
    <table id="gate-table">
      <thead>
        <tr><th>關卡</th><th>圖上看起來</th><th>實際</th><th>怎麼被跨過去 / 侷限</th></tr>
      </thead>
      <tbody>${bodyRows}
      </tbody>
    </table>
  </div>
</div>
`;

// Replace archify's native `.cards` block with our table instead of appending a
// second, redundant summary. A regex can't safely match nested <div>s (a card's own
// header/ul are divs too), so find the closing </div> by depth-counting div tags
// starting from the opening <div class="cards">.
function findCardsBlock(source) {
  const start = source.indexOf('<div class="cards">');
  if (start === -1) return null;
  const tagRe = /<div\b|<\/div>/g;
  tagRe.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = tagRe.exec(source))) {
    depth += match[0] === '</div>' ? -1 : 1;
    if (depth === 0) return { start, end: match.index + match[0].length };
  }
  return null; // unbalanced -- don't guess, fall back to append
}

let out = html;
const cardsBlock = findCardsBlock(out);
if (cardsBlock) {
  out = out.slice(0, cardsBlock.start) + block + out.slice(cardsBlock.end);
} else {
  out = out.replace('</body>', `${block}\n</body>`);
}

writeFileSync(outputPath, out, 'utf8');
console.log(`Injected gate status table (${rows.length} rows)${cardsBlock ? ' -- replaced native .cards block' : ' -- appended (no .cards block found)'}`);
console.log(`Wrote ${outputPath}`);
