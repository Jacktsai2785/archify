# Drilldown drawer (custom add-on)

This is a personal customization on top of upstream [tt-a1i/archify](https://github.com/tt-a1i/archify),
built while using the `workflow` renderer to document a real codebase (`devos`,
a CLI governance layer). It is **not** an upstream archify feature — it's a
post-processing step you run on an already-`deliver`ed HTML file.

## What it does

archify's `workflow` diagrams are great at showing the big-picture shape of a
process, but a single node like "Builder" or "authorize" is really a stand-in
for several real function calls. This add-on lets you click any node and see
its internal flow — a mini chain of cards, each with a full-sentence
explanation, not just a keyword fragment — slide up from the bottom of the
page, without touching archify's own rendering.

Before → after, conceptually:

- Before: click a node → archify's native "Semantic Passport" panel shows
  upstream/downstream relationships.
- After: click a node → the passport still exists, but a bottom drawer also
  opens showing what's actually inside that node, as its own small flow.

## Usage

```bash
# 1. Author and deliver your workflow diagram as usual
node ../../bin/archify.mjs deliver workflow my-diagram.json my-diagram.html --quality showcase --json

# 2. Write a children.json describing what's inside the nodes you want
#    to be clickable (see example/devos-dataflow.children.json)

# 3. Inject
node inject-drilldown.mjs my-diagram.html my-children.json my-diagram.final.html
```

`inject-drilldown.mjs` refuses to run twice on the same file (it checks for
its own marker) and refuses to run on something that isn't a full archify
HTML document. It never modifies the input file.

## children.json shape

```jsonc
{
  "<node-id>": {                 // must match the node's data-node-id
    "kicker": "STAGE",           // short pill label, top-left of the drawer
    "color": "var(--backend-stroke)",
    "summary": "one sentence shown under the title",
    "items": [
      {
        "name": "some_function()",
        "meta": "函式・程式碼",           // small "what kind of thing is this" tag
        "status": "ok",                  // ok | partial | gap | info
        "desc": "A full sentence explaining what it does and why it matters — not a keyword fragment.",
        "evidence": "path/to/file.py:120-140",  // optional, monospace, dim
        "parallel": true                 // optional — groups adjacent parallel
                                          // items into one vertically-stacked
                                          // branch slot fed by a single arrow
      }
    ]
  }
}
```

Write `desc` as a sentence a reader who has never seen the code can follow —
"MANAGED + 已註冊 sandbox root + repo clean" tells the author what they meant,
not the reader what it means. Say what the check does, what the pieces are,
and why it matters.

## Gotchas this ran into (read before extending the injected script)

- **Native `<title>` tooltip clash.** Every archify node carries a real SVG
  `<title>`, which the browser renders as a hover tooltip. It visually
  collides with a click-driven panel, so the script strips these.
- **Focus-dim conflict.** archify's own click handler opens a "Semantic
  Passport" panel and sets `data-focus-active` on the `<svg>`, which dims
  everything except the focused node (`opacity: .13` on `[data-node-id]`,
  `[data-edge-from]`). If your own drawer stays open at the same time, you
  get two competing panels. Call
  `Archify.focus.clear({ restoreFocus: false })` ~60ms after your own
  render to close it cleanly — discovered via `Object.keys(window.Archify)`,
  it's not documented anywhere.
- **Translucent panel token.** archify's own floating panels intentionally
  use a translucent `--panel` color (e.g. `rgba(15,23,42,.5)`) so the
  diagram shows through them — that's correct for a small floating card, but
  wrong for a full-width bottom drawer: the diagram's own legend/labels will
  bleed through and overlap your text. Use the opaque `--bg` token for a
  drawer surface instead.
- **Flex text overflow.** A flex item holding a long identifier
  (`_validate_approval_for_builder()`) will silently overflow its box unless
  wrapped in a child with `flex: 1; min-width: 0; overflow-wrap: break-word`
  — flex items default to `min-width: auto`, not `0`.
- **"Everything looks dimmed" isn't always a bug.** If you're QA'ing with a
  browser automation tool, the pointer is usually still resting on the last
  node you clicked, which triggers archify's own hover reach-preview and
  dims siblings. Move the mouse away before deciding it's a real defect.
- **Structural label sizes.** Band headers ("01 / CLI 入口 → …"), phase
  pills, and dashed-group labels render several px smaller than node titles
  by default. The script bumps them via a CSS rule keyed off their
  *original* `font-size` presentation attribute value, excluding anything
  with `[data-detail]` (node sublabels), so node-interior text is untouched.
  This is a heuristic, not a layout recompute — if a diagram uses very long
  band/phase text, check it doesn't clip its background pill after bumping.

## Example

`example/` contains a complete worked case:

- `devos-dataflow.workflow.json` — the authored archify `workflow` spec
  (schema v2, showcase quality profile, passes all 9 composition checks)
- `devos-dataflow.children.json` — the drilldown content for its 10 nodes
- `devos-dataflow.final.html` — the delivered + injected output, openable
  directly in a browser
