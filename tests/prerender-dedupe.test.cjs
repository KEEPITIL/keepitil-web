// scripts/prerender-dedupe.sh: a scheduled run must not push a second branch for work that is already waiting on one.
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), cp = require("node:child_process");
const SCRIPT = path.join(__dirname, "..", "scripts", "prerender-dedupe.sh");
const sh = (cwd, c) => cp.execSync(c, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
function fixture() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pd-")), origin = path.join(d, "origin.git"), work = path.join(d, "work");
  sh(d, `git init -q --bare -b main origin.git && git clone -q origin.git work`);
  fs.mkdirSync(path.join(work, "event", "a"), { recursive: true }); fs.writeFileSync(path.join(work, "event", "a", "index.html"), "A1"); fs.writeFileSync(path.join(work, "sitemap-events.xml"), "S1");
  sh(work, `git add -A && git commit -q -m base && git push -q origin HEAD:main`);
  return { work, run: () => { try { return { code: 0, out: sh(work, `sh ${JSON.stringify(SCRIPT)}`).trim() }; } catch (e) { return { code: e.status, out: "" }; } } };
}
function pushBranch(work, name, files) {
  sh(work, `git checkout -q -b ${name}`); for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(work, f)), { recursive: true }); fs.writeFileSync(path.join(work, f), c); }
  sh(work, `git add -A && git commit -q -m gen && git push -q origin ${name} && git checkout -q main`);
  for (const f of Object.keys(files)) { try { sh(work, `git checkout -q main -- ${f}`); } catch (e) { fs.rmSync(path.join(work, f), { force: true }); } }
}
test("no prerender branch: push (exit 1)", () => { const f = fixture(); fs.writeFileSync(path.join(f.work, "sitemap-events.xml"), "S2"); assert.equal(f.run().code, 1); });
test("an existing branch with exactly this content: skip (exit 0, names the branch)", () => {
  const f = fixture(); pushBranch(f.work, "prerender/run-1", { "sitemap-events.xml": "S2", "event/b/index.html": "B1" });
  fs.writeFileSync(path.join(f.work, "sitemap-events.xml"), "S2"); fs.mkdirSync(path.join(f.work, "event", "b"), { recursive: true }); fs.writeFileSync(path.join(f.work, "event", "b", "index.html"), "B1");
  const r = f.run(); assert.equal(r.code, 0); assert.match(r.out, /prerender\/run-1/);
});
test("events changed again since that branch: push a new one (exit 1)", () => {
  const f = fixture(); pushBranch(f.work, "prerender/run-1", { "sitemap-events.xml": "S2" });
  fs.writeFileSync(path.join(f.work, "sitemap-events.xml"), "S3"); assert.equal(f.run().code, 1);
});
test("a page the branch lacks counts as a difference (exit 1)", () => {
  const f = fixture(); pushBranch(f.work, "prerender/run-1", { "sitemap-events.xml": "S2" });
  fs.writeFileSync(path.join(f.work, "sitemap-events.xml"), "S2"); fs.mkdirSync(path.join(f.work, "event", "c"), { recursive: true }); fs.writeFileSync(path.join(f.work, "event", "c", "index.html"), "C"); assert.equal(f.run().code, 1);
});
test("control: a branch not named prerender/run-* is ignored", () => {
  const f = fixture(); pushBranch(f.work, "other/thing", { "sitemap-events.xml": "S2" }); fs.writeFileSync(path.join(f.work, "sitemap-events.xml"), "S2"); assert.equal(f.run().code, 1);
});
