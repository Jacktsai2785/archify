import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { ChromeVisualBrowser, findChrome } from '../bin/visual-check.mjs';
import { disposeBundleFixture, stageBundleFixture } from './helpers/bundle-fixture.mjs';

const chromePath = process.env.ARCHIFY_CHROME ? findChrome() : null;
const options = { skip: chromePath ? false : 'Set ARCHIFY_CHROME to run drilldown pixel-restore browser smoke.' };

async function evaluate(browser, expression) {
  const result = await browser.cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, await browser.sessionPromise, 30000);
  return result.result?.value;
}

test('ascending restores parent viewBox, node boxes, and scroll position', options, async () => {
  const dir = stageBundleFixture({ prefix: 'archify-drilldown-browser-' });
  const browser = new ChromeVisualBrowser(chromePath);
  try {
    await browser.inspect({
      artifactPath: path.join(dir, 'checkout-platform.html'),
      width: 1440,
      height: 900,
      theme: 'light',
    });
    const before = await evaluate(browser, `(async () => {
      const canvas = document.querySelector('.diagram-container');
      canvas.style.height = '240px';
      canvas.style.overflow = 'auto';
      window.scrollTo(40, 80);
      canvas.scrollLeft = 12;
      canvas.scrollTop = 24;
      const svg = document.querySelector('.diagram-container svg');
      const nodes = [...svg.querySelectorAll('[data-node-id]')].map((node) => {
        const box = node.getBoundingClientRect();
        return { id: node.getAttribute('data-node-id'), x: box.x, y: box.y, w: box.width, h: box.height };
      });
      return {
        viewBox: svg.getAttribute('viewBox'),
        nodes,
        windowX: window.scrollX,
        windowY: window.scrollY,
        canvasX: canvas.scrollLeft,
        canvasY: canvas.scrollTop,
      };
    })()`);
    const during = await evaluate(browser, `(async () => {
      if (!window.Archify || !Archify.drilldown) return { ok: false };
      Archify.drilldown.descend('payments');
      await new Promise((resolve) => setTimeout(resolve, 1300));
      const currents = [...document.querySelectorAll('[aria-current="page"]')].map((node) => node.textContent);
      return { ok: true, currents };
    })()`);
    assert.equal(during.ok, true);
    assert.equal(during.currents.length, 1);
    await evaluate(browser, `(async () => {
      Archify.drilldown.back();
      await new Promise((resolve) => setTimeout(resolve, 200));
      return true;
    })()`);
    const after = await evaluate(browser, `(async () => {
      const canvas = document.querySelector('.diagram-container');
      const svg = document.querySelector('.diagram-container svg');
      const nodes = [...svg.querySelectorAll('[data-node-id]')].map((node) => {
        const box = node.getBoundingClientRect();
        return { id: node.getAttribute('data-node-id'), x: box.x, y: box.y, w: box.width, h: box.height };
      });
      return {
        viewBox: svg.getAttribute('viewBox'),
        hidden: svg.hidden,
        nodes,
        windowX: window.scrollX,
        windowY: window.scrollY,
        canvasX: canvas.scrollLeft,
        canvasY: canvas.scrollTop,
      };
    })()`);
    assert.equal(after.viewBox, before.viewBox);
    assert.equal(after.hidden, false);
    assert.deepEqual(after.nodes, before.nodes);
    assert.equal(after.windowX, before.windowX);
    assert.equal(after.windowY, before.windowY);
    assert.equal(after.canvasX, before.canvasX);
    assert.equal(after.canvasY, before.canvasY);
  } finally {
    await browser.close();
    disposeBundleFixture(dir);
  }
});
