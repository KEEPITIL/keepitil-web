/*
 * dashboard.html loadRecommendations: x.tab was esc()'d into a JS string inside an inline onclick
 * (showTab('<tab>')). HTML-escaping cannot protect a JS string context (the browser decodes &#39; before the JS parses),
 * so a tab value like  ');alert(1);('  broke out. Now carried in data-tab and read with this.dataset.tab.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../../dashboard.html'), 'utf8');
const a = src.indexOf('async function loadRecommendations(');
const code = src.slice(a, src.indexOf('\n}\n', a) + 3);

test('recommendation "Go" button carries the tab in data-tab, never inside a JS string', async () => {
  const box = { innerHTML: '' }, ct = { textContent: '' };
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const HOSTILE = "');alert(1);('\"><img src=x onerror=alert(1)>";
  const ctx = vm.createContext({
    $: (id) => (id === 'recList' ? box : ct),
    supa: { rpc: async () => ({ data: { recommendations: [{ title: 'T', detail: 'D', priority: 'high', tab: HOSTILE }] } }) },
    esc, String, Math
  });
  vm.runInContext(code + '\nthis.loadRecommendations=loadRecommendations;', ctx);
  await ctx.loadRecommendations();
  assert.match(box.innerHTML, /onclick="showTab\(this\.dataset\.tab\)"/);
  assert.match(box.innerHTML, /data-tab="&#39;\);alert\(1\);\(&#39;&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;"/);
  // the payload appears only inside the quoted data-tab value
  const outsideData = box.innerHTML.replace(/data-tab="[^"]*"/, '');
  assert.equal(/alert\(1\)/.test(outsideData), false);
  assert.equal(/<img/.test(box.innerHTML), false);
});
