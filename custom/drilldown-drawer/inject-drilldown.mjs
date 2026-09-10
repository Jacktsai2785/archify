#!/usr/bin/env node
// Post-processes an archify `deliver` HTML output to add a click-to-expand
// "internal flow" drawer for any node that has authored children data.
//
// Why this exists (read before touching the CSS/JS below):
//
// - archify's native SVG <title> gives every node a browser tooltip. It
//   visually collides with a custom click-driven panel, so we strip it.
// - archify's native "Semantic Passport" focus panel opens on the same
//   click and dims unrelated nodes (`svg[data-focus-active] [data-node-id]`
//   -> opacity .13). We close it via `Archify.focus.clear({restoreFocus:false})`
//   ~60ms after our own render, or the two panels visually fight each other.
// - archify's own floating panels use a translucent `--panel` color token
//   (e.g. rgba(15,23,42,.5)) by design, so the diagram shows through them.
//   A full-width bottom drawer must NOT reuse that token verbatim, or the
//   diagram's own legend/labels bleed through and overlap the drawer's
//   text. Use the opaque `--bg` token for the drawer surface instead.
// - Flex children holding long identifiers (function names, etc.) need an
//   explicit `min-width: 0; overflow-wrap: break-word` wrapper, or they
//   silently overflow their box — flex items default to `min-width: auto`.
// - The pan/zoom apparent "everything got dim" bug during manual QA in a
//   browser automation tool is very often just the pointer resting on the
//   last-clicked node, which triggers archify's own hover reach-preview
//   (dims siblings). Move the mouse away before judging whether dimming
//   is a real bug.
//
// Usage:
//   node inject-drilldown.mjs <delivered.html> <children.json> <output.html>
//
// children.json shape:
// {
//   "<node-id-matching-data-node-id>": {
//     "kicker": "STAGE",              // short label, top-left pill
//     "color": "var(--backend-stroke)", // any CSS color/token
//     "summary": "one-line summary shown under the title",
//     "items": [
//       {
//         "name": "some_function()",       // shown as the card title
//         "meta": "函式・程式碼",           // small kind tag under the name
//         "status": "ok" | "partial" | "gap" | "info",
//         "desc": "full sentence explaining what it does and why it matters.",
//         "evidence": "path/to/file.py:120-140",   // optional
//         "parallel": true            // optional: groups with adjacent
//                                      // parallel:true items into one
//                                      // vertically-stacked branch slot
//       }
//     ]
//   }
// }

import { readFileSync, writeFileSync } from 'node:fs';

const [, , inputPath, childrenPath, outputPath] = process.argv;

if (!inputPath || !childrenPath || !outputPath) {
  console.error('Usage: node inject-drilldown.mjs <delivered.html> <children.json> <output.html>');
  process.exit(1);
}

const html = readFileSync(inputPath, 'utf8');
const children = JSON.parse(readFileSync(childrenPath, 'utf8'));

if (html.includes('id="child-drawer-style"')) {
  console.error('Input already contains an injected drilldown drawer; refusing to double-inject.');
  process.exit(1);
}

if (!html.includes('</body>')) {
  console.error('Input does not look like a full archify-delivered HTML document (no </body>).');
  process.exit(1);
}

const block = `
<style id="child-drawer-style">
  /* Structural labels (band headers, phase pills, group labels) render much
     smaller than node titles by default. These are matched by their
     ORIGINAL font-size presentation attribute and excluded from anything
     that also carries data-detail (node sublabels), so node-interior text
     is untouched. */
  svg text[font-size="7"]:not([data-detail]) { font-size: 10px !important; }
  svg text[font-size="8"]:not([data-detail]) { font-size: 11px !important; }
  svg text[font-size="10"]:not([data-detail]) { font-size: 13px !important; }

  #child-drawer {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483000;
    background: var(--bg); border-top: 2px solid var(--panel-border);
    box-shadow: 0 -2px 0 var(--bg), 0 -16px 40px -8px rgba(0,0,0,.55);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    max-height: 94vh; display: flex; flex-direction: column;
    transform: translateY(calc(100% - 42px));
    transition: transform .22s ease;
    isolation: isolate;
  }
  #child-drawer.open { transform: translateY(0); }
  #child-drawer-tab {
    height: 42px; flex: none; display: flex; align-items: center; justify-content: center; gap: 8px;
    cursor: pointer; color: var(--text-muted); font-size: 11.5px; font-weight: 700; letter-spacing: .04em;
    border-bottom: 1px solid var(--panel-border); user-select: none;
    background: var(--bg); position: relative;
  }
  #child-drawer-tab:hover { color: var(--text); }
  #child-drawer-body { overflow-y: auto; padding: 44px 64px 60px; max-width: 2000px; margin: 0 auto; width: 100%; }
  #child-drawer-head { display: flex; align-items: baseline; gap: 18px; margin-bottom: 14px; flex-wrap: wrap; }
  #child-drawer-head .cd-title { font-size: 36px; font-weight: 700; color: var(--text); }
  #child-drawer-head .cd-kicker {
    font-size: 13.5px; font-weight: 700; letter-spacing: .06em; padding: 5px 13px; border-radius: 7px;
    border: 1.5px solid currentColor;
  }
  #child-drawer-sub { font-size: 17px; color: var(--text-muted); margin-bottom: 40px; line-height: 1.75; font-family: 'Noto Sans TC', sans-serif; max-width: 90ch; }

  .cd-flow-label {
    font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
    color: var(--text-dim); margin-bottom: 20px; display: flex; align-items: center; gap: 8px;
  }
  .cd-flow-label::after { content: ""; flex: 1; height: 1px; background: var(--grid); }

  /* Each flow node is a full detail card: name + kind + status + full-sentence
     description + optional evidence, all in one place. Do not split this
     back into "flow row" + "separate detail table" -- that was tried and
     rejected: readers want the explanation on the node they're looking at. */
  .cd-flow {
    display: flex; align-items: stretch; gap: 0; margin-bottom: 10px; overflow-x: auto; padding: 8px 4px 24px;
  }
  .cd-flow-slot { display: flex; flex-direction: column; gap: 18px; flex: none; justify-content: center; }
  .cd-flow-node {
    flex: none; width: 340px; border-radius: 14px; padding: 22px 24px;
    border: 1.5px solid currentColor; background: color-mix(in srgb, currentColor 10%, var(--panel));
    color: var(--text); display: flex; flex-direction: column; gap: 11px;
  }
  .cd-flow-node-head { display: flex; align-items: center; gap: 11px; }
  .cd-flow-ic {
    flex: none; width: 27px; height: 27px; border-radius: 7px; color: inherit;
    display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700;
    border: 1.5px solid currentColor;
  }
  .cd-flow-name { flex: 1; min-width: 0; font-size: 17px; font-weight: 700; color: var(--text); overflow-wrap: break-word; word-break: break-word; }
  .cd-flow-tags { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .cd-flow-meta {
    font-size: 11px; font-weight: 700; color: var(--text-dim); letter-spacing: .02em;
    padding: 2px 8px; border-radius: 4px; border: 1px solid var(--grid);
  }
  .cd-flow-status { flex: none; font-size: 12px; font-weight: 700; color: inherit; }
  .cd-flow-desc { font-size: 15.5px; color: var(--text-muted); line-height: 1.7; font-family: 'Noto Sans TC', sans-serif; }
  .cd-flow-evidence { font-size: 12.5px; color: var(--text-dim); margin-top: 3px; }
  .cd-flow-arrow { flex: none; color: var(--arrow); display: flex; align-items: center; padding: 0 12px; }

  @media (max-width: 900px) {
    #child-drawer-body { padding: 22px 18px 30px; }
    .cd-flow-node { width: 240px; }
  }
</style>
<div id="child-drawer">
  <div id="child-drawer-tab">▲ CLICK A NODE TO EXPAND ITS INTERNAL FLOW</div>
  <div id="child-drawer-body">
    <div id="child-drawer-head"></div>
    <div id="child-drawer-sub"></div>
    <div class="cd-flow-label">INTERNAL FLOW</div>
    <div class="cd-flow" id="child-drawer-flow"></div>
  </div>
</div>
<script>
(function(){
  var COLOR = {ok:'var(--backend-stroke)', partial:'var(--cloud-stroke)', gap:'var(--security-stroke)', info:'var(--frontend-stroke)'};
  var LABEL = {ok:'resolved', partial:'partial', gap:'gap', info:'info'};
  var ICON = {ok:'✓', partial:'●', gap:'✕', info:'i'};

  var CHILDREN = ${JSON.stringify(children, null, 2)};

  var drawer = document.getElementById('child-drawer');
  var tab = document.getElementById('child-drawer-tab');
  var head = document.getElementById('child-drawer-head');
  var sub = document.getElementById('child-drawer-sub');
  var flowEl = document.getElementById('child-drawer-flow');

  function card(c){
    var cv = COLOR[c.status] || COLOR.info;
    return '<div class="cd-flow-node" style="color:'+cv+'">'+
      '<div class="cd-flow-node-head">'+
        '<span class="cd-flow-ic">'+(ICON[c.status]||'i')+'</span>'+
        '<span class="cd-flow-name">'+c.name+'</span>'+
      '</div>'+
      '<div class="cd-flow-tags">'+
        (c.meta ? '<span class="cd-flow-meta">'+c.meta+'</span>' : '')+
        '<span class="cd-flow-status">'+(LABEL[c.status]||c.status)+'</span>'+
      '</div>'+
      '<div class="cd-flow-desc">'+c.desc+'</div>'+
      (c.evidence ? '<div class="cd-flow-evidence">'+c.evidence+'</div>' : '')+
    '</div>';
  }

  function renderFlow(items){
    var html = '';
    var i = 0;
    var first = true;
    while(i < items.length){
      if(!first){
        html += '<div class="cd-flow-arrow">'+
          '<svg width="30" height="18" viewBox="0 0 30 18"><line x1="0" y1="9" x2="21" y2="9" stroke="currentColor" stroke-width="1.5"/><path d="M21 9 L15 5 M21 9 L15 13" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>'+
        '</div>';
      }
      first = false;
      if(items[i].parallel){
        var group = [];
        while(i < items.length && items[i].parallel){ group.push(items[i]); i++; }
        html += '<div class="cd-flow-slot">' + group.map(card).join('') + '</div>';
      } else {
        html += card(items[i]);
        i++;
      }
    }
    flowEl.innerHTML = html;
  }

  function render(id){
    var d = CHILDREN[id];
    if(!d) return false;
    head.innerHTML = '<span class="cd-kicker" style="color:'+d.color+'">'+d.kicker+'</span><span class="cd-title">'+id+'</span>';
    sub.textContent = d.summary;
    renderFlow(d.items);
    return true;
  }

  document.querySelectorAll('[data-node-id] > title').forEach(function(t){ t.remove(); });

  document.querySelectorAll('[data-node-id]').forEach(function(el){
    el.addEventListener('click', function(){
      var id = el.getAttribute('data-node-id');
      if(render(id)){
        drawer.classList.add('open');
        setTimeout(function(){
          try{ if(window.Archify && Archify.focus && Archify.focus.clear){ Archify.focus.clear({restoreFocus:false}); } }catch(e){}
        }, 60);
      }
    }, true);
  });

  tab.addEventListener('click', function(){
    drawer.classList.toggle('open');
  });
})();
</script>
`;

const output = html.replace('</body>', block + '\n</body>');
writeFileSync(outputPath, output);

const injectedIds = Object.keys(children);
console.log('Injected drilldown drawer for ' + injectedIds.length + ' node id(s): ' + injectedIds.join(', '));
console.log('Wrote ' + outputPath);
