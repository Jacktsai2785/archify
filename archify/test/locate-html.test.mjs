import assert from 'node:assert/strict';
import test from 'node:test';
import { LocateError } from '../locate/error.mjs';
import { renderLocateHtmlFromArtifact, validateLocateHtml } from '../locate/locate-html.mjs';

const receipt = {
  schemaVersion: 1,
  ok: true,
  command: 'locate',
  locatorVersion: 1,
  mode: 'range',
  completeness: 'complete',
  repository: {
    root: '.',
    url: 'https://github.com/tt-a1i/archify',
    linkMode: 'web',
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
  },
  map: { path: 'map.architecture.json', diagramType: 'architecture', semanticSha256: 'c'.repeat(64) },
  ownership: { path: 'map.architecture.ownership.json', sha256: 'd'.repeat(64) },
  review: { required: false, blocking: [], advisory: ['files_uncovered'] },
  summary: {
    files: { touched: 1, uncovered: 1, ambiguous: 0, excluded: 0, total: 2 },
    components: { touched: 1, untouched: 0, stale: 0, total: 1 },
  },
  files: [
    { path: 'bin/cli.mjs', changeType: 'M', state: 'touched', componentId: 'cli', matchedGlob: 'bin/**' },
    { path: 'README.md', changeType: 'M', state: 'uncovered' },
  ],
  components: [
    { id: 'cli', label: 'CLI', state: 'touched', touchedCount: 1, touchedFiles: ['bin/cli.mjs'] },
  ],
  facts: [],
  limitations: ['Path ownership only; no runtime impact, causality, risk, or mergeability is inferred.'],
};

const mapHtml = `<!DOCTYPE html><html><head><style>body{color:red}</style></head><body>
<svg viewBox="0 0 400 200" role="img"><g data-node-id="cli"><rect x="10" y="10" width="80" height="40"/></g></svg>
</body></html>`;

test('locate HTML embeds one receipt and annotates node state', () => {
  const html = renderLocateHtmlFromArtifact({ receipt, mapHtml });
  assert.deepEqual(validateLocateHtml(html, receipt), { ok: true, checksPassed: 6, checkCount: 6 });
  assert.match(html, /data-locate-state="touched"/);
  assert.match(html, /id="archify-locate-receipt"/);
  assert.match(html, /https:\/\/github.com\/tt-a1i\/archify\/blob\/b{40}\/bin\/cli.mjs/);
  assert.doesNotMatch(html, /\bSAFE\b|\bNO IMPACT\b/);
});

test('validateLocateHtml requires receipt-only marker for non-architecture maps', () => {
  const workflowReceipt = {
    ...receipt,
    map: { ...receipt.map, path: 'map.workflow.json', diagramType: 'workflow' },
  };
  const html = '<!DOCTYPE html><html><body><p>Locate receipt only.</p><script id="archify-locate-receipt" type="application/json">{}</script></body></html>';
  assert.deepEqual(
    validateLocateHtml(html, workflowReceipt, { diagramType: 'workflow' }),
    { ok: true, checksPassed: 6, checkCount: 6 },
  );
  assert.throws(
    () => validateLocateHtml(html.replace('Locate receipt only.', 'Receipt'), workflowReceipt, { diagramType: 'workflow' }),
    (error) => error instanceof LocateError && error.code === 'locate/artifact-invalid',
  );
});

test('validateLocateHtml rejects a second receipt and forbidden claims', () => {
  const html = renderLocateHtmlFromArtifact({ receipt, mapHtml });
  const duplicate = html.replace('</body>', '<script id="archify-locate-receipt" type="application/json">{}</script></body>');
  assert.throws(() => validateLocateHtml(duplicate, receipt), (error) => (
    error instanceof LocateError && error.code === 'locate/artifact-invalid'
  ));
  const unsafe = html.replace('Review', 'SAFE NO IMPACT');
  assert.throws(() => validateLocateHtml(unsafe, receipt), (error) => (
    error instanceof LocateError && /forbidden/.test(error.message)
  ));
});
