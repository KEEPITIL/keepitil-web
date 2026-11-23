// create-event: cover / Spotify / YouTube links must be http(s). Runs the REAL badLink and
// firstBadLink source in a vm sandbox, and checks the submit handler calls them before
// anything is sent. Run: node --test tests/create-event-links.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = process.env.CE_ROOT || path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "create-event.html"), "utf8");

function extract(name) {
  const start = html.indexOf("function " + name + "(");
  assert.ok(start > 0, name + " not found");
  let depth = 0;
  for (let i = html.indexOf("{", start); i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error("unbalanced " + name);
}
function sandbox(values) {
  const box = { document: { getElementById: (id) => (id in values ? { value: values[id], focus() {} } : null) } };
  vm.createContext(box);
  vm.runInContext(extract("badLink") + "\n" + extract("firstBadLink"), box);
  return box;
}

test("http and https links pass, empty is allowed", () => {
  const b = sandbox({});
  for (const ok of ["https://open.spotify.com/track/x", "http://a.co/b?c=1", "", "   ", null]) {
    assert.equal(b.badLink(ok), false, String(ok));
  }
});
test("script URLs, bare hosts and spaces are rejected", () => {
  const b = sandbox({});
  for (const bad of ["javascript:alert(1)", "www.youtube.com/watch?v=1", "ftp://x.com/a", "data:text/html,hi", "https://a b.com", "youtube"]) {
    assert.equal(b.badLink(bad), true, bad);
  }
});
test("firstBadLink names the first offending field", () => {
  assert.equal(sandbox({ cover_url: "https://x.com/a.jpg", spotify_url: "", youtube_url: "" }).firstBadLink(), null);
  const r = sandbox({ cover_url: "https://x.com/a.jpg", spotify_url: "javascript:x", youtube_url: "nope" }).firstBadLink();
  assert.equal(r[0], "spotify_url");
  assert.match(r[1], /Spotify/);
});
test("the submit handler checks links before sending anything", () => {
  const i = html.indexOf("var _bl=firstBadLink();");
  const send = html.indexOf("b.disabled=true; b.textContent='Submitting");
  assert.ok(i > 0 && send > i, "link check must come before the button is disabled and the request built");
  assert.match(html.slice(i, i + 400), /must start with http:\/\/ or https:\/\//);
});
