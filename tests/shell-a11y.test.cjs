// Shared-shell a11y (axe sweep 2026-11-24): the three navs have different accessible names, the injected community aside is placed at
// top level, the radio bar is a labelled region, article footnotes are labelled regions, the home page has one <main>, and the
// shell/radio script stamps are bumped on every page that loads them. Run: node --test tests/shell-a11y.test.cjs
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), cp = require("node:child_process");
const ROOT = path.resolve(__dirname, "..");
const R = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const shell = R("keepitil-shell.js"), radio = R("assets/js/keepitil-radio.js");
test("the three navigation landmarks have unique names", () => {
  assert.match(shell, /hdr\.id='v3shell-nav'; hdr\.setAttribute\('aria-label','Main'\)/);
  assert.match(shell, /<nav class=\\?"v3-foot-links\\?" aria-label=\\?"Footer\\?">/);
  assert.match(shell, /bn\.id='kil-bnav'; bn\.setAttribute\('aria-label','Tabs'\)/);
  const names = ["Main", "Footer", "Tabs"]; assert.equal(new Set(names).size, 3);
});
test("the injected community aside is labelled and inserted after the outermost content block (top level), not appended inside the article", () => {
  assert.match(shell, /box\.setAttribute\('aria-label','Community'\)/);
  assert.match(shell, /while\(top\.parentNode && top\.parentNode !== document\.body\) top = top\.parentNode;/);
  assert.match(shell, /top\.parentNode\.insertBefore\(box, top\.nextSibling\)/);
  assert.doesNotMatch(shell, /host\.appendChild\(box\);/);
});
test("behaviour of that placement: with a nested article it lands as a body-level sibling after the top block", () => {
  const code = shell.match(/var top = host;[\s\S]*?else top\.parentNode\.insertBefore\(box, top\.nextSibling\);/)[0];
  const mk = (tag, parent) => { const n = { tag, parentNode: parent, kids: [], insertBefore(b, ref) { const i = ref ? this.kids.indexOf(ref) : this.kids.length; this.kids.splice(i < 0 ? this.kids.length : i, 0, b); b.parentNode = this; }, appendChild(b) { this.kids.push(b); b.parentNode = this; }, get nextSibling() { const i = this.parentNode.kids.indexOf(this); return this.parentNode.kids[i + 1] || null; } }; if (parent) parent.kids.push(n); return n; };
  const body = mk("body", null), wrap = mk("div", body), main = mk("main", wrap), article = mk("article", main), footer = mk("footer", body), box = { tag: "aside" };
  new Function("host", "box", "document", code)(article, box, { body });
  assert.equal(box.parentNode, body); assert.deepEqual(body.kids.map((k) => k.tag), ["div", "aside", "footer"]);
});
test("the radio bar is a labelled region", () => assert.match(radio, /bar\.id='kil-radio'; bar\.setAttribute\('role','region'\); bar\.setAttribute\('aria-label','KEEPITIL Radio'\)/));
test("article footnotes are labelled sections, not bare divs", () => {
  const bad = [];
  for (const d of fs.readdirSync(path.join(ROOT, "article"))) { const f = "article/" + d + "/index.html"; if (!fs.existsSync(path.join(ROOT, f))) continue; const h = R(f); if (/<div class="foot-note"/.test(h)) bad.push(f); }
  assert.deepEqual(bad, []);
  assert.ok(R("article/bleu/index.html").includes('<section class="foot-note" aria-label="Reader notice">'));
});
test("home has exactly one <main> that holds the hero", () => {
  const h = R("index.html"); assert.equal((h.match(/<main\b/g) || []).length, 1);
  assert.ok(h.indexOf('<main id="main-content">') < h.indexOf('id="home"') && h.indexOf('id="home"') < h.indexOf("</main>"));
});
test("every page loads the shell and radio scripts with ONE current stamp each", () => {
  const files = cp.execSync('git ls-files "*.html"', { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  const stamps = { shell: new Set(), radio: new Set() };
  for (const f of files) { const h = R(f); for (const m of h.matchAll(/keepitil-shell\.js\?v=([0-9a-z]+)/g)) stamps.shell.add(m[1]); for (const m of h.matchAll(/keepitil-radio\.js\?v=([0-9a-z]+)/g)) stamps.radio.add(m[1]); }
  assert.deepEqual([...stamps.shell], ["20261124d"]); assert.deepEqual([...stamps.radio], ["20261124c"]);
});
test("control: the old shell source would fail these checks", () => {
  assert.doesNotMatch("var hdr = document.createElement('nav'); hdr.id='v3shell-nav';", /aria-label','Main'/);
  assert.match("host.appendChild(box);", /host\.appendChild\(box\);/);
});
test("the Sources block that sits outside the article panel is a labelled region", () => {
  assert.ok(R("article/underground-money-stack/index.html").includes('<div class="src-wrap" role="region" aria-label="Sources">'));
});
