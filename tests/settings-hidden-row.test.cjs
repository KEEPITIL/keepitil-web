// settings.html: the "Download my data" email-request row (id exp-mail-row, hidden) must really be hidden while MEMBER_DATA_CONTROLS is on. `.row{display:flex}` beats the browser's [hidden]{display:none},
// so the page showed TWO "Download my data" rows (the Download button and the "Email us" one). `.row[hidden]{display:none}` fixes it.   node --test tests/settings-hidden-row.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.SH_ROOT || path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "settings.html"), "utf8");
const css = html.slice(html.indexOf("<style"), html.indexOf("</style>"));

// every element class that is made display:flex/grid/block by the page's CSS AND carries the hidden attribute in the markup, without a [hidden] rule to win
function problems(markup, styles) {
  const out = [];
  for (const m of markup.matchAll(/<[a-z0-9]+ [^>]*\bclass="([^"]+)"[^>]*\bhidden\b[^>]*>/g)) {
    for (const cls of m[1].split(/\s+/)) {
      const shows = new RegExp("\\." + cls + "\\s*\\{[^}]*display\\s*:\\s*(flex|grid|block|inline-flex|inline-block)").test(styles);
      const hides = new RegExp("\\." + cls + "\\[hidden\\]\\s*\\{[^}]*display\\s*:\\s*none").test(styles) || /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/.test(styles);
      if (shows && !hides) out.push("." + cls + " is display-forced but its [hidden] elements are not hidden");
    }
  }
  return out;
}

test("no hidden element in settings.html is shown by a display rule (the email-request row stays hidden while the controls are on)", () => {
  assert.match(html, /id="exp-mail-row" hidden/);
  assert.deepEqual(problems(html, css), []);
  assert.match(css, /\.row\[hidden\]\{display:none\}/);
  assert.ok(css.indexOf(".row[hidden]") > css.indexOf(".row{display:flex"), "after the rule it must beat (same specificity plus an attribute: higher)");
});
test("NEGATIVE CONTROL: without the [hidden] rule the same markup is flagged (the live bug), and a harmless class is not", () => {
  const without = css.replace(/\.row\[hidden\]\{display:none\}[^\n]*\n/, "");
  assert.deepEqual(problems(html, without), [".row is display-forced but its [hidden] elements are not hidden"]);
  assert.deepEqual(problems('<div class="plain" hidden>', ".plain{color:red}"), []);
});
test("the flag logic is unchanged: with the controls on the Download row shows and the mail row stays hidden; off swaps them", () => {
  assert.match(html, /if\(!MEMBER_DATA_CONTROLS\)\{ if\(d\) d\.hidden=true; if\(m\) m\.hidden=false; \}/);
  assert.match(html, /<div class="row" id="exp-row">/);
});
