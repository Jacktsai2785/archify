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

## Before you write children.json: verify, don't pattern-match

**This is the part that actually went wrong the first time — read it before writing content.**

Every `desc` (and the call order of `items`) is a factual claim about what the
code does. It is easy to write a plausible-sounding claim that has a
`file:line` in `evidence` and still be wrong, because the citation was reused
from somewhere else instead of re-checked for *this specific claim*.

What actually happened building the `devos-dataflow` example: an earlier,
genuinely-verified audit had already established (via grep + reading the real
function) that `work_create`'s real call order was
`handle_work_create() → create_work_item() → update_work_item_specification()`.
When the `work_create` drawer content was written afterwards, instead of
re-reading `handle_work_create()`, it was reconstructed by pattern-matching
labels already floating around in that audit doc (`objective`, `scope`,
`acceptance`, the risk flags) into a plausible "human fills a form" story,
with `handle_work_create()` tacked on *last* as if it consumed the fields.
That's backwards — `handle_work_create()` runs first — and it also invented a
persisted `objective` field that doesn't exist (`--intent` is reused as a
fallback for `scope`/`acceptance`, never stored as its own field). The
content had citations and read as trustworthy; it wasn't re-verified. A
human caught it by cross-referencing two independently-drawn diagrams against
each other — nothing in the tooling would have caught it.

So, before writing or editing an entry in `children.json`:

1. Grep for the real function/class the item names. Open it. Read what it
   actually does, in what order, with what other calls.
2. Write `desc` from what you just read, not from a label, an adjacent card,
   or an older document's prose — even one that itself has real citations.
   A citation attached to a *different* claim doesn't validate a *new* one
   built by rearranging it.
3. Put the file:line you just read in `evidence`, not a remembered one.
4. If two things you're documenting (e.g. two nodes' drawers, or a drawer vs.
   an existing diagram) disagree, that's a signal one of them is wrong — chase
   it down before publishing either.

There is no automated check backing this — `archify validate`/`deliver`
checks geometry and schema, not factual accuracy of your `desc` strings.
Skipping this step produces content that looks exactly as trustworthy as
content that did it properly.

## Usage

```bash
# 1. Author and deliver your workflow diagram as usual
node ../../bin/archify.mjs deliver workflow my-diagram.json my-diagram.html --quality showcase --json

# 2. Write a children.json describing what's inside the nodes you want
#    to be clickable (see example/devos-dataflow.children.json)

# 3. Inject the drilldown drawer
node inject-drilldown.mjs my-diagram.html my-children.json my-diagram.drilldown.html

# 4. Optional: if you also have "claimed vs actual" content that's naturally a
#    table (one row per item, same columns every time -- see below), inject it
#    on top instead of forcing it into archify's native `cards` bullet list
node inject-gate-table.mjs my-diagram.drilldown.html my-rows.json my-diagram.final.html
```

### `inject-gate-table.mjs` — when a real table beats `cards`

archify's `meta.cards` field is a dot + title + flat bullet list. That's fine for a
loose summary, but content shaped like "for each X, here's what was claimed vs what's
actually true vs how it's bypassed" is a table by nature — cramming it into one bullet
per row loses the column alignment and gets hard to scan. This script replaces
archify's rendered `.cards` block with a real `<table>` (same theme tokens, light/dark
aware), built from a flat JSON array — see `example/devos-dataflow.gate-rows.json` for
the shape and `example/devos-dataflow.final.html` for the rendered result. Falls back
to appending before `</body>` if the source spec had no `cards` block to replace.

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
  (schema v2, `standard` quality profile — 13 lanes / 44 nodes, one node per
  real function call, deliberately dense to match a hand-drawn reference
  diagram's granularity 1:1; passes composition with 0 errors/5 warnings)
- `devos-dataflow.children.json` — the drilldown content for its most
  complex 13 nodes (the ones where a full-sentence explanation adds real
  value beyond the node's own label)
- `devos-dataflow.final.html` — the delivered + injected output, openable
  directly in a browser

### A note on matching a hand-drawn diagram's density

This example was rebuilt once to close a real gap: a hand-drawn SVG audit
diagram of the same system had far more nodes (one per function call) than
the original archify version (one per pipeline stage), which made the
archify version look like it was missing systems that, in reality, just
weren't drawn at that zoom level. The fix was structural, not cosmetic —
each hand-drawn "row" became its own `lane` (13 lanes total), so every
function call gets its own node on the main canvas instead of being hidden
behind a click.

Two schema constraints surfaced while doing this, worth knowing before you
try the same thing:

- **`col` is capped at 5** (6 columns per lane). You cannot lay out an
  arbitrary wide row the way free-form SVG allows — split a wide row into
  a fresh `lane` instead of trying to widen one lane past 6 nodes.
- **`mainPath` must be column-monotonic.** If your diagram restarts at
  `col: 0` for every new lane (as this one does — each lane is its own
  left-to-right row), you cannot list all of it in `mainPath`; the
  validator rejects any step that moves backward in column. `mainPath` is
  optional — omit it entirely for a diagram shaped like this one and rely
  on `edges` alone.
