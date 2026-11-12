// kmob-publish: fixtures for every refusal, plus an end-to-end dry run (verify -> download -> stage -> push into a local bare repo).
// No network, no token. Run: node --test scripts/kmob-publish/kmob-publish.test.mjs
// Negative controls (CI): KMOB_VERIFY_DISABLE=<rule> switches one check off; the suite must then FAIL, which proves these tests
// can see that check. Rules: tip provenance checks pr-checks precondition rollback artifact artifact-integrity path-guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Refusal, loadConfig, githubApi, verify, validateArtifact, stage, push, guardCommit } from './lib.mjs';
import { main } from './cli.mjs';

const D = (process.env.KMOB_VERIFY_DISABLE || '').split(',').filter(Boolean);
const config = loadConfig();
const REPO = config.repo, R = `/repos/${REPO}`;
const S = '5'.repeat(40), H = 'b'.repeat(40), M26 = '2'.repeat(40), LIVE = '0'.repeat(40), OTHER = 'e'.repeat(40);

const run = (o) => ({ status: 'completed', conclusion: 'success', run_attempt: 1, created_at: '2026-11-12T10:00:00Z', repository: { full_name: REPO }, path: config.workflowPath, workflow_id: 1, name: 'deploy-web', ...o, html_url: `https://github.com/${REPO}/actions/runs/${o.id}` });
const jobs = (over = {}) => ({ jobs: config.requiredJobs.map((name) => ({ name, status: 'completed', conclusion: over[name] || 'success', steps: name === 'pr-tests' ? [{ name: 'crmap-ids', conclusion: over['crmap-ids'] || 'success' }, { name: 'ranked-signin', conclusion: 'success' }] : [] })) });

function world(mutate = () => {}) {
  const w = {
    tip: S,
    pulls: [{ number: 49, merged_at: '2026-11-12T09:00:00Z', base: { ref: 'main' }, merge_commit_sha: S }],
    prs: {
      49: { number: 49, merged: true, merge_commit_sha: S, html_url: `https://github.com/${REPO}/pull/49`, base: { ref: 'main', repo: { full_name: REPO } }, head: { sha: H } },
      26: { number: 26, merged: true, merge_commit_sha: M26, base: { ref: 'main', repo: { full_name: REPO } }, head: { sha: 'c'.repeat(40) } },
    },
    runs: [
      run({ id: 10, run_number: 7, head_sha: S, event: 'push', head_branch: 'main' }),
      run({ id: 20, run_number: 6, head_sha: H, event: 'pull_request', head_branch: 'ci/x' }),
      run({ id: 21, run_number: 3, head_sha: H, event: 'pull_request', head_branch: 'ci/x', workflow_id: 2, name: 'pr-tests', path: '.github/workflows/pr-tests.yml' }),
    ],
    jobs: { 10: jobs(), 20: jobs() },
    artifacts: { 10: [{ id: 99, name: config.artifactPrefix + S, expired: false, archive_download_url: 'https://api.github.test/zip/99', size_in_bytes: 1234, digest: '' }] },
    status: { state: 'pending', total_count: 0, statuses: [] },
    compare: { [`${M26}...${S}`]: 'ahead', [`${LIVE}...${S}`]: 'ahead' },
    fail: [],
  };
  mutate(w);
  return w;
}

function apiFor(w) {
  return async (p) => {
    const [pathname, qs] = p.split('?'); const q = new URLSearchParams(qs || '');
    for (const [re, status] of w.fail) if (re.test(pathname)) throw Object.assign(new Error('HTTP ' + status), { status });
    let m;
    if (pathname === `${R}/git/ref/heads/main`) return { object: { sha: w.tip } };
    if ((m = pathname.match(/\/commits\/([0-9a-f]{40})\/pulls$/))) return m[1] === S ? w.pulls : [];
    if ((m = pathname.match(/\/pulls\/(\d+)$/)) && w.prs[m[1]]) return w.prs[m[1]];
    if ((m = pathname.match(/\/actions\/workflows\/[^/]+\/runs$/)) || pathname === `${R}/actions/runs`)
      return { workflow_runs: w.runs.filter((r) => r.head_sha === q.get('head_sha') && (!q.get('event') || r.event === q.get('event'))) };
    if ((m = pathname.match(/\/actions\/runs\/(\d+)\/jobs$/)) && w.jobs[m[1]]) return w.jobs[m[1]];
    if ((m = pathname.match(/\/actions\/runs\/(\d+)\/artifacts$/))) return { artifacts: w.artifacts[m[1]] || [] };
    if (pathname.endsWith(`/commits/${S}/status`)) return w.status;
    if ((m = pathname.match(/\/compare\/([0-9a-f]{40}\.\.\.[0-9a-f]{40})$/)) && w.compare[m[1]]) return { status: w.compare[m[1]] };
    throw Object.assign(new Error('HTTP 404 (fixture has no ' + pathname + ')'), { status: 404 });
  };
}

const check = (w, extra = {}) => verify({ api: apiFor(w), sha: S, config, liveSource: LIVE, _disable: D, ...extra });
async function refuses(p, code) {
  await assert.rejects(p, (e) => { assert.ok(e instanceof Refusal, 'expected a Refusal, got ' + e); assert.equal(e.code, code, e.message); return true; });
}

// ---------- verify: the publishable case ----------
test('a merged PR commit at the tip, green everywhere, containing #26, newer than live: verified', async () => {
  const f = await check(world());
  assert.equal(f.pr, 49); assert.equal(f.prHead, H); assert.equal(f.run.id, 10); assert.equal(f.artifact.id, 99);
});

// ---------- must-fix 2: a direct push can't publish ----------
test('direct push (no PR associated with the commit): refused', async () => { await refuses(check(world((w) => { w.pulls = []; })), 'direct-push'); });
test('direct push of a commit that is only inside an OPEN PR: refused', async () => {
  await refuses(check(world((w) => { w.pulls = [{ number: 51, merged_at: null, base: { ref: 'main' }, merge_commit_sha: OTHER }]; })), 'direct-push');
});
test('merged PR whose merge commit is a different commit (the tip was pushed on top): refused', async () => {
  await refuses(check(world((w) => { w.pulls[0].merge_commit_sha = OTHER; })), 'direct-push');
});
test('PR merged into another branch: refused', async () => { await refuses(check(world((w) => { w.pulls[0].base.ref = 'release'; })), 'direct-push'); });
test('PR record does not confirm the merge (merged=false on re-read): refused', async () => { await refuses(check(world((w) => { w.prs[49].merged = false; })), 'direct-push'); });

// ---------- must-fix 2: required checks green on the exact commit ----------
test('red check on the exact commit (browser failed): refused', async () => { await refuses(check(world((w) => { w.jobs[10] = jobs({ browser: 'failure' }); })), 'checks'); });
test('crusades-balance failed on the exact commit: refused', async () => { await refuses(check(world((w) => { w.jobs[10] = jobs({ 'crusades-balance': 'failure' }); })), 'checks'); });
test('crmap-ids step failed on the exact commit: refused', async () => { await refuses(check(world((w) => { w.jobs[10] = jobs({ 'crmap-ids': 'failure' }); })), 'checks'); });
test('a required job is missing from the run: refused', async () => {
  await refuses(check(world((w) => { w.jobs[10].jobs = w.jobs[10].jobs.filter((j) => j.name !== 'pr-tests'); })), 'checks');
});
test('run concluded failure / still running: refused', async () => {
  await refuses(check(world((w) => { w.runs[0].conclusion = 'failure'; })), 'checks');
  await refuses(check(world((w) => { w.runs[0].status = 'in_progress'; w.runs[0].conclusion = null; })), 'checks');
});
test('a newer re-run of the push run went red: the latest run decides, refused', async () => {
  await refuses(check(world((w) => { w.runs.push(run({ id: 11, run_number: 8, head_sha: S, event: 'push', head_branch: 'main', conclusion: 'failure' })); })), 'checks');
});
test('no push run for the commit at all: refused', async () => { await refuses(check(world((w) => { w.runs = w.runs.filter((r) => r.event !== 'push'); })), 'checks'); });
test('a green run from another workflow file or repo does not count: refused', async () => {
  await refuses(check(world((w) => { w.runs[0].path = '.github/workflows/other.yml'; })), 'checks');
  await refuses(check(world((w) => { w.runs[0].repository.full_name = 'someone/fork'; })), 'checks');
});
test('a red commit status on the exact commit: refused', async () => { await refuses(check(world((w) => { w.status = { state: 'failure', total_count: 1 }; })), 'checks'); });

// ---------- must-fix 2: the PR head was green too ----------
test('PR commit with a red check (pr-tests failed on the PR head): refused', async () => {
  await refuses(check(world((w) => { w.runs[2].conclusion = 'failure'; })), 'pr-checks');
});
test('PR head deploy-web run had a failed required job: refused', async () => { await refuses(check(world((w) => { w.jobs[20] = jobs({ gate: 'failure' }); })), 'pr-checks'); });
test('PR head has no deploy-web run: refused', async () => { await refuses(check(world((w) => { w.runs = w.runs.filter((r) => r.id !== 20); })), 'pr-checks'); });
test('PR head check still running: refused', async () => { await refuses(check(world((w) => { w.runs[2].status = 'queued'; w.runs[2].conclusion = null; })), 'pr-checks'); });

// ---------- must-fix 3: stale commits and rollbacks ----------
test('stale commit (main has moved past it): refused', async () => { await refuses(check(world((w) => { w.tip = OTHER; })), 'stale'); });
test('commit older than the live source (would roll the site back): refused', async () => {
  await refuses(check(world((w) => { w.compare[`${LIVE}...${S}`] = 'behind'; })), 'rollback');
  await refuses(check(world((w) => { w.compare[`${LIVE}...${S}`] = 'diverged'; })), 'rollback');
});
test('no live source recorded (first publish): the rollback check has nothing to compare, verified', async () => {
  const f = await check(world(), { liveSource: '' }); assert.equal(f.pr, 49);
});

// ---------- must-fix 5: #26 first ----------
test('commit missing #26 (not contained): refused', async () => {
  await refuses(check(world((w) => { w.compare[`${M26}...${S}`] = 'behind'; })), 'precondition');
  await refuses(check(world((w) => { w.compare[`${M26}...${S}`] = 'diverged'; })), 'precondition');
});
test('#26 not merged yet: refused', async () => {
  await refuses(check(world((w) => { w.prs[26].merged = false; w.prs[26].merge_commit_sha = null; })), 'precondition');
});

// ---------- fail closed ----------
test('any API error is a refusal, never a pass', async () => {
  await refuses(check(world((w) => { w.fail.push([/\/jobs$/, 500]); })), 'api');
  await refuses(check(world((w) => { w.fail.push([/\/compare\//, 404]); })), 'api');
  await refuses(check(world((w) => { w.fail.push([/\/git\/ref\//, 403]); })), 'api');
});
test('artifact missing or expired: refused', async () => {
  await refuses(check(world((w) => { w.artifacts[10] = []; })), 'artifact');
  await refuses(check(world((w) => { w.artifacts[10][0].expired = true; })), 'artifact');
});
test('bad kmob_sha input: refused', async () => {
  await refuses(verify({ api: apiFor(world()), sha: 'main', config }), 'bad-sha');
  await refuses(verify({ api: apiFor(world()), sha: S.slice(0, 12), config }), 'bad-sha');
});
test('no token: refused before any request', () => { assert.throws(() => githubApi(''), (e) => e.code === 'no-token'); });

// ---------- artifact integrity and the site commit ----------
function makeArtifact(dir, sha, files = { 'index.html': '<head><title>KMOB</title>', 'js/main.js': 'console.log(1)', 'kmob-home.css': 'body{}' }) {
  fs.rmSync(dir, { recursive: true, force: true });
  const sums = {}; const H2 = crypto.createHash('sha256');
  for (const [f, c] of Object.entries(files)) H2.update(f + c);
  const build = H2.digest('hex').slice(0, 12);
  for (let [f, c] of Object.entries(files)) {
    if (f === 'index.html') c = c.replace('<head>', `<head>\n<meta name="kmob-build" content="${build}">`);
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), c);
    sums[f] = crypto.createHash('sha256').update(c).digest('hex');
  }
  fs.writeFileSync(path.join(dir, 'build.json'), JSON.stringify({ build, files: sums }));
  fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify({ build, source: sha }));
  return build;
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kmob-publish-'));
const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const valid = (dir) => validateArtifact(dir, { sha: S, _disable: D });

test('artifact: a well-formed build verifies', () => { const d = tmp() + '/a'; const b = makeArtifact(d, S); assert.equal(valid(d).build, b); });
test('artifact: a file changed after the build: refused', () => {
  const d = tmp() + '/a'; makeArtifact(d, S); fs.appendFileSync(path.join(d, 'js/main.js'), ';evil()');
  assert.throws(() => valid(d), (e) => e.code === 'artifact-integrity');
});
test('artifact: an extra file not in build.json: refused', () => {
  const d = tmp() + '/a'; makeArtifact(d, S); fs.writeFileSync(path.join(d, 'extra.html'), 'x');
  assert.throws(() => valid(d), (e) => e.code === 'artifact-integrity');
});
test('artifact: version.json names another commit: refused', () => {
  const d = tmp() + '/a'; makeArtifact(d, OTHER);
  assert.throws(() => valid(d), (e) => e.code === 'artifact-integrity');
});
test('artifact: a symlink: refused', () => {
  const d = tmp() + '/a'; makeArtifact(d, S); fs.symlinkSync('/etc/passwd', path.join(d, 'js/x.js'));
  assert.throws(() => valid(d), (e) => e.code === 'artifact-integrity');
});

function siteRepo() {
  const root = tmp(), origin = path.join(root, 'origin.git'), site = path.join(root, 'site');
  g(root, 'init', '-q', '--bare', '-b', 'main', origin);
  g(root, 'init', '-q', '-b', 'main', site);
  fs.writeFileSync(path.join(site, 'index.html'), 'home');
  fs.mkdirSync(path.join(site, 'games/kmob/js'), { recursive: true });
  fs.writeFileSync(path.join(site, 'games/kmob/build.json'), JSON.stringify({ build: '4b32a21cd556', files: {} }));
  fs.writeFileSync(path.join(site, 'games/kmob/js/old.js'), 'old');
  g(site, 'add', '-A'); g(site, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'site');
  g(site, 'remote', 'add', 'origin', origin); g(site, 'push', '-q', 'origin', 'main');
  return { root, origin, site };
}

test('stage: one commit, games/kmob only, old files removed, the rest of the site untouched', () => {
  const { root, site } = siteRepo(); const art = path.join(root, 'art'); const b = makeArtifact(art, S);
  const base = g(site, 'rev-parse', 'HEAD');
  const r = stage({ siteDir: site, artifactDir: art, sitePath: config.sitePath, sha: S, _disable: D });
  assert.equal(r.prev, '4b32a21cd556'); assert.equal(r.next, b);
  assert.equal(g(site, 'rev-list', '--count', `${base}..HEAD`), '1');
  const names = g(site, 'diff', '--name-only', base, 'HEAD').split('\n');
  assert.ok(names.every((n) => n.startsWith('games/kmob/')), names.join(','));
  assert.ok(!fs.existsSync(path.join(site, 'games/kmob/js/old.js')));
  assert.equal(fs.readFileSync(path.join(site, 'index.html'), 'utf8'), 'home');
  assert.match(g(site, 'log', '-1', '--format=%an <%ae> %s'), /^KMOB CI <ci@keepitil.com> KMOB games\/kmob: build /);
});
test('stage: something else already staged outside games/kmob: refused (path guard)', () => {
  const { root, site } = siteRepo(); const art = path.join(root, 'art'); makeArtifact(art, S);
  fs.writeFileSync(path.join(site, 'index.html'), 'defaced'); g(site, 'add', 'index.html');
  assert.throws(() => stage({ siteDir: site, artifactDir: art, sitePath: config.sitePath, sha: S, _disable: D }), (e) => e.code === 'path-guard');
});
test('path guard: a commit that touches a path outside games/kmob, or two commits: refused', () => {
  const { site } = siteRepo(); const base = g(site, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(site, 'index.html'), 'x'); g(site, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'outside');
  assert.throws(() => guardCommit(site, base, config.sitePath, { _disable: D }), (e) => e.code === 'path-guard');
  fs.writeFileSync(path.join(site, 'games/kmob/build.json'), '{}'); g(site, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'second');
  assert.throws(() => guardCommit(site, base, config.sitePath, { _disable: D }), (e) => e.code === 'path-guard');
});

// ---------- push: the tip is re-checked right before the push ----------
test('push: main moved between verify and push (stale): refused, nothing pushed', async () => {
  const { root, site, origin } = siteRepo(); const art = path.join(root, 'art'); makeArtifact(art, S);
  const before = g(origin, 'rev-parse', 'main');
  stage({ siteDir: site, artifactDir: art, sitePath: config.sitePath, sha: S });
  await refuses(push({ siteDir: site, api: apiFor(world((w) => { w.tip = OTHER; })), sha: S, config, sleep: async () => {}, _disable: D }), 'stale');
  assert.equal(g(origin, 'rev-parse', 'main'), before);
});
test('push: another publisher landed first: rebase, re-check, push one games/kmob-only commit on top', async () => {
  const { root, site, origin } = siteRepo(); const art = path.join(root, 'art'); makeArtifact(art, S);
  const other = path.join(root, 'other'); g(root, 'clone', '-q', origin, other);
  fs.writeFileSync(path.join(other, 'index.html'), 'home v2'); g(other, '-c', 'user.name=o', '-c', 'user.email=o@o', 'commit', '-qam', 'site publish'); g(other, 'push', '-q', 'origin', 'main');
  const theirs = g(origin, 'rev-parse', 'main');
  stage({ siteDir: site, artifactDir: art, sitePath: config.sitePath, sha: S });
  const r = await push({ siteDir: site, api: apiFor(world()), sha: S, config, sleep: async () => {}, _disable: D });
  assert.equal(r.attempts, 2);
  assert.equal(g(origin, 'rev-parse', 'main~1'), theirs);
  assert.ok(g(origin, 'diff', '--name-only', 'main~1', 'main').split('\n').every((n) => n.startsWith('games/kmob/')));
});

// ---------- end to end through the CLI (what the workflow runs), against fixtures ----------
test('CLI dry run: verify -> download -> stage, nothing pushed; then push publishes exactly one commit', async () => {
  const { root, site, origin } = siteRepo(); const art = path.join(root, 'build'); const b = makeArtifact(art, S);
  fs.writeFileSync(path.join(site, 'games/kmob/version.json'), JSON.stringify({ build: '4b32a21cd556', source: LIVE }));
  g(site, 'add', '-A'); g(site, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'live version'); g(site, 'push', '-q', 'origin', 'main');
  const zip = path.join(root, 'a.zip'); execFileSync('zip', ['-qr', zip, '.'], { cwd: art });
  const zbuf = fs.readFileSync(zip);
  const w = world((x) => { x.artifacts[10][0].digest = 'sha256:' + crypto.createHash('sha256').update(zbuf).digest('hex'); });
  const out = path.join(root, 'out.txt'); const deps = { api: apiFor(w), env: { GITHUB_OUTPUT: out }, fetchImpl: async () => new Response(zbuf), sleep: async () => {} };
  const facts = path.join(root, 'facts.json'), dest = path.join(root, 'dl');
  const before = g(origin, 'rev-parse', 'main');
  assert.equal(await main(['verify', '--sha', S, '--site', site, '--out', facts], deps), 0);
  assert.equal(await main(['download', '--facts', facts, '--dest', dest], deps), 0);
  assert.equal(await main(['stage', '--sha', S, '--site', site, '--artifact', dest, '--facts', facts], deps), 0);
  assert.equal(g(origin, 'rev-parse', 'main'), before, 'a dry run pushes nothing');
  assert.match(fs.readFileSync(out, 'utf8'), new RegExp(`next=${b}`));
  assert.equal(await main(['push', '--sha', S, '--site', site], deps), 0);
  assert.equal(g(origin, 'rev-list', '--count', `${before}..main`), '1');
  assert.equal(JSON.parse(g(origin, 'show', 'main:games/kmob/version.json')).source, S);
});
test('CLI: a tampered zip (digest mismatch) is refused before anything is staged', async () => {
  const root = tmp(); const art = path.join(root, 'build'); makeArtifact(art, S);
  const zip = path.join(root, 'a.zip'); execFileSync('zip', ['-qr', zip, '.'], { cwd: art });
  const w = world((x) => { x.artifacts[10][0].digest = 'sha256:' + 'f'.repeat(64); });
  const facts = path.join(root, 'facts.json');
  fs.writeFileSync(facts, JSON.stringify({ artifact: w.artifacts[10][0] }));
  const code = await main(['download', '--facts', facts, '--dest', path.join(root, 'dl')], { api: apiFor(w), env: {}, fetchImpl: async () => new Response(fs.readFileSync(zip)) });
  assert.equal(code, D.includes('artifact-integrity') ? 0 : 1);
  if (D.includes('artifact-integrity')) assert.fail('negative control: digest check disabled');
});
test('CLI: a refused verify exits 1 and names the reason', async () => {
  const code = await main(['verify', '--sha', S, '--site', tmp()], { api: apiFor(world((w) => { w.pulls = []; })), env: {} });
  assert.equal(code, 1);
});
