// Test files must clean up the temp dirs they create (pages-sql-real-* was a 146 MB copy of the repo per run and filled the NEXUS Mac disk to 100%).
// Static: every test file that calls mkdtemp also removes (rmSync/rm) in an after() hook or a finally block. Dynamic: the worst offender, run under a private
// TMPDIR, leaves it empty. Run: node --test tests/tmp-cleanup.test.cjs
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), cp = require("node:child_process");
const ROOT = path.resolve(__dirname, "..");
const files = cp.execSync('git ls-files "*.test.js" "*.test.mjs" "*.test.cjs"', { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean).filter((f) => !/^(app|apps|games)\//.test(f));
const leaky = (src) => /mkdtemp(Sync)?\(/.test(src) && !(/(rmSync|fs\.rm|rm\()/.test(src) && /(\bafter\(|finally)/.test(src));
test("every test file that creates temp dirs removes them in after()/finally", () => {
  const bad = files.filter((f) => f !== "tests/tmp-cleanup.test.cjs" && leaky(fs.readFileSync(path.join(ROOT, f), "utf8")));
  assert.deepEqual(bad, []);
});
test("the scan sees the test suite (not an empty list)", () => assert.ok(files.length > 50));
test("control: the scanner flags a file that creates temp dirs and never removes them", () => {
  assert.equal(leaky("const d = fs.mkdtempSync(path.join(os.tmpdir(), 'x-'));"), true);
  assert.equal(leaky("const d = fs.mkdtempSync(p); after(() => fs.rmSync(d, { recursive: true }));"), false);
});
test("pages-sql-exclusion (146 MB per run before) leaves a private TMPDIR empty", () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), "leakchk-"));
  try {
    cp.execFileSync(process.execPath, ["--test", "assets/js/pages-sql-exclusion.test.mjs"], { cwd: ROOT, env: { ...process.env, TMPDIR: t }, stdio: "ignore" });
    assert.deepEqual(fs.readdirSync(t), []);
  } finally { fs.rmSync(t, { recursive: true, force: true }); }
});
