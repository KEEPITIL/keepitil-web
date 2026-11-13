// KMOB -> keepitil.com/games/kmob/ publisher: the checks. Plain node, no dependencies.
// Used by .github/workflows/kmob-publish.yml through cli.mjs; tested with fixtures by kmob-publish.test.mjs. Docs: docs/KMOB_PUBLISH.md.
//
// Everything here FAILS CLOSED: any missing fact, unexpected shape or API error is a Refusal. Nothing is ever assumed green.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const SHA_RE = /^[0-9a-f]{40}$/;
const GREEN_OTHER = new Set(['success', 'skipped', 'neutral']);

export class Refusal extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const refuse = (code, message) => { throw new Refusal(code, message); };

export function loadConfig(file = new URL('./config.json', import.meta.url)) {
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const k of ['repo', 'branch', 'workflowPath', 'requiredJobs', 'artifactPrefix', 'sitePath', 'preconditions']) if (c[k] === undefined) throw new Error('config: missing ' + k);
  return c;
}

// GET-only GitHub REST client. Any non-2xx answer is a Refusal('api').
export function githubApi(token, { base = 'https://api.github.com', fetchImpl = globalThis.fetch } = {}) {
  if (!token) refuse('no-token', 'KMOB_READ_TOKEN is empty: create it as a secret of the kmob-publish environment (docs/KMOB_PUBLISH.md)');
  return async (p) => {
    const r = await fetchImpl(base + p, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'keepitil-web-kmob-publish' } });
    if (!r.ok) refuse('api', `GET ${p.split('?')[0]} -> HTTP ${r.status}`);
    return r.json();
  };
}

async function get(api, p) {
  try { return await api(p); } catch (e) {
    if (e instanceof Refusal) throw e;
    refuse('api', `GET ${p.split('?')[0]} failed: ${e.status || ''} ${e.message}`.trim());
  }
}

const samePath = (runPath, want) => typeof runPath === 'string' && (runPath === want || runPath.startsWith(want + '@'));
const latest = (runs) => runs.slice().sort((a, b) => (b.run_number - a.run_number) || (Date.parse(b.created_at) - Date.parse(a.created_at)) || (b.id - a.id))[0];

function requireJobs(where, jobs, config, steps) {
  if (!Array.isArray(jobs)) refuse(where, 'job list unreadable');
  for (const name of config.requiredJobs) {
    const js = jobs.filter((j) => j.name === name);
    if (js.length !== 1) refuse(where, `required job "${name}" ${js.length ? 'appears ' + js.length + ' times' : 'is missing'}`);
    if (js[0].status !== 'completed' || js[0].conclusion !== 'success') refuse(where, `required job "${name}" is ${js[0].conclusion || js[0].status}`);
    for (const step of (steps && config.requiredSteps?.[name]) || []) {
      const s = (js[0].steps || []).filter((x) => x.name === step);
      if (s.length !== 1 || s[0].conclusion !== 'success') refuse(where, `required step "${name} / ${step}" is ${s.length ? s[0].conclusion : 'missing'}`);
    }
  }
}

// Rollback guard: the commit must be the branch tip right now.
export async function assertTip({ api, sha, config }) {
  const ref = await get(api, `/repos/${config.repo}/git/ref/heads/${config.branch}`);
  const tip = ref?.object?.sha;
  if (!SHA_RE.test(tip || '')) refuse('api', `could not read ${config.repo} ${config.branch}`);
  if (tip !== sha) refuse('stale', `${sha.slice(0, 12)} is not the tip of ${config.repo} ${config.branch} (tip is ${tip.slice(0, 12)}): refusing, so an old run can't roll the site back`);
  return tip;
}

// All publish preconditions for one KMOB commit. Returns the facts the publish needs (PR, run, artifact).
// liveSource: the KMOB commit named by the live games/kmob/version.json, or '' when the live build doesn't say.
// _disable is for the test suite's negative controls only (the CLI never passes it).
export async function verify({ api, sha, config, liveSource = '', _disable = [] }) {
  const off = new Set(_disable);
  const R = `/repos/${config.repo}`;
  if (!SHA_RE.test(sha || '')) refuse('bad-sha', `kmob_sha must be a full 40-character lowercase commit id, got "${sha}"`);
  const facts = { sha, repo: config.repo };

  // 1. still the tip
  if (!off.has('tip')) await assertTip({ api, sha, config });

  // 2. the merge commit of a merged PR into the branch (a direct push has no such PR)
  let pr = null;
  if (!off.has('provenance')) {
    const list = await get(api, `${R}/commits/${sha}/pulls?per_page=100`);
    if (!Array.isArray(list)) refuse('api', 'PR list unreadable');
    const hit = list.filter((p) => p && p.merged_at && p.base?.ref === config.branch && p.merge_commit_sha === sha);
    if (hit.length !== 1) refuse('direct-push', `${sha.slice(0, 12)} is not the merge commit of a merged PR into ${config.branch} (${list.length} associated PR(s), ${hit.length} match): a direct push can't be published`);
    pr = await get(api, `${R}/pulls/${hit[0].number}`);
    if (!(pr.merged === true && pr.merge_commit_sha === sha && pr.base?.ref === config.branch && pr.base?.repo?.full_name === config.repo && SHA_RE.test(pr.head?.sha || '')))
      refuse('direct-push', `PR #${hit[0].number} does not confirm it merged ${sha.slice(0, 12)} into ${config.branch}`);
    facts.pr = pr.number; facts.prHead = pr.head.sha; facts.prUrl = pr.html_url;
  }

  // 3. green on the exact commit: the workflow's push run on the branch, every required job and step
  let run = null;
  if (!off.has('checks')) {
    const wf = path.posix.basename(config.workflowPath);
    const res = await get(api, `${R}/actions/workflows/${wf}/runs?head_sha=${sha}&event=push&branch=${config.branch}&per_page=100`);
    const runs = (res?.workflow_runs || []).filter((r) => r.head_sha === sha && r.event === 'push' && r.head_branch === config.branch && samePath(r.path, config.workflowPath) && r.repository?.full_name === config.repo);
    if (!runs.length) refuse('checks', `no ${wf} run for the push of ${sha.slice(0, 12)} to ${config.branch}`);
    run = latest(runs);
    if (run.status !== 'completed' || run.conclusion !== 'success') refuse('checks', `${wf} run ${run.html_url || run.id} on ${sha.slice(0, 12)} is ${run.conclusion || run.status}`);
    const jobs = await get(api, `${R}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
    requireJobs('checks', jobs?.jobs, config, true);
    const st = await get(api, `${R}/commits/${sha}/status`);
    if (typeof st?.total_count !== 'number') refuse('api', 'commit status unreadable');
    if (st.total_count > 0 && st.state !== 'success') refuse('checks', `commit status on ${sha.slice(0, 12)} is ${st.state}`);
    facts.run = { id: run.id, url: run.html_url, attempt: run.run_attempt };
  }

  // 4. the merged PR's head was green too: deploy-web's PR run with every required job, and no other workflow red on it
  if (!off.has('pr-checks') && pr) {
    const H = pr.head.sha;
    const res = await get(api, `${R}/actions/runs?head_sha=${H}&event=pull_request&per_page=100`);
    const runs = (res?.workflow_runs || []).filter((r) => r.head_sha === H && r.event === 'pull_request' && r.repository?.full_name === config.repo);
    const byWf = new Map();
    for (const r of runs) byWf.set(r.workflow_id, [...(byWf.get(r.workflow_id) || []), r]);
    const last = [...byWf.values()].map(latest);
    const dw = last.filter((r) => samePath(r.path, config.workflowPath));
    if (dw.length !== 1) refuse('pr-checks', `PR #${pr.number} head ${H.slice(0, 12)} has no ${path.posix.basename(config.workflowPath)} pull_request run`);
    for (const r of last) {
      if (r.status !== 'completed') refuse('pr-checks', `PR #${pr.number} head: ${r.name} is still ${r.status}`);
      const ok = r === dw[0] ? r.conclusion === 'success' : GREEN_OTHER.has(r.conclusion);
      if (!ok) refuse('pr-checks', `PR #${pr.number} head ${H.slice(0, 12)}: ${r.name} is ${r.conclusion}`);
    }
    const jobs = await get(api, `${R}/actions/runs/${dw[0].id}/jobs?filter=latest&per_page=100`);
    requireJobs('pr-checks', jobs?.jobs, config, false);
  }

  // 5. preconditions: each listed PR is merged and its merge is contained in this commit
  if (!off.has('precondition')) {
    for (const pc of config.preconditions) {
      const p = await get(api, `${R}/pulls/${pc.pr}`);
      if (p.merged !== true || !SHA_RE.test(p.merge_commit_sha || '')) refuse('precondition', `#${pc.pr} is not merged: ${pc.why}`);
      const cmp = await get(api, `${R}/compare/${p.merge_commit_sha}...${sha}`);
      if (!['ahead', 'identical'].includes(cmp?.status)) refuse('precondition', `${sha.slice(0, 12)} does not contain #${pc.pr}'s merge ${p.merge_commit_sha.slice(0, 12)} (${cmp?.status}): ${pc.why}`);
    }
  }

  // 6. never older than what is live
  if (!off.has('rollback') && liveSource) {
    if (!SHA_RE.test(liveSource)) refuse('rollback', `live version.json source "${liveSource}" is not a commit id`);
    const cmp = await get(api, `${R}/compare/${liveSource}...${sha}`);
    if (!['ahead', 'identical'].includes(cmp?.status)) refuse('rollback', `${sha.slice(0, 12)} is ${cmp?.status} the live source ${liveSource.slice(0, 12)}: refusing to roll the site back`);
  }

  // 7. the artifact that run uploaded
  if (!off.has('artifact') && run) {
    const res = await get(api, `${R}/actions/runs/${run.id}/artifacts?per_page=100`);
    const arts = (res?.artifacts || []).filter((a) => a.name === config.artifactPrefix + sha);
    if (arts.length !== 1) refuse('artifact', `run ${run.id} has ${arts.length} artifact(s) named ${config.artifactPrefix}${sha}`);
    if (arts[0].expired) refuse('artifact', `artifact ${arts[0].name} has expired: push a new merge or re-run ${config.workflowPath} on ${config.branch}`);
    facts.artifact = { id: arts[0].id, name: arts[0].name, url: arts[0].archive_download_url, size: arts[0].size_in_bytes, digest: arts[0].digest || '' };
  }
  return facts;
}

// ---------- artifact and site ----------

const FILE_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*(\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/;

// The kmob-publish environment is the release gate, so the publisher re-checks its configuration on every run and refuses if it
// was weakened: a required-reviewers rule that names the configured reviewer (a user, by login), no admin bypass, and deployments
// allowed from exactly one custom branch policy, the configured branch. Missing or unexpected shapes refuse (fail closed).
export async function checkEnvironment({ api, config, _disable = [] }) {
  if (_disable.includes('environment')) return { skipped: true };
  const e = config.environment, repo = config.siteRepo;
  if (!e || !e.name || !e.requiredReviewer || !e.branch || !repo) refuse('environment', 'config.environment / config.siteRepo missing');
  const env = await get(api, `/repos/${repo}/environments/${encodeURIComponent(e.name)}`);
  const rules = Array.isArray(env?.protection_rules) ? env.protection_rules : [];
  const rr = rules.find((r) => r && r.type === 'required_reviewers');
  const logins = (rr && Array.isArray(rr.reviewers) ? rr.reviewers : []).filter((x) => x && x.type === 'User' && x.reviewer && typeof x.reviewer.login === 'string').map((x) => x.reviewer.login.toLowerCase());
  if (!logins.includes(e.requiredReviewer.toLowerCase())) refuse('environment', `environment ${e.name}: required reviewers must include the user ${e.requiredReviewer} (found: ${logins.join(', ') || 'none'})`);
  if (env.can_admins_bypass !== false) refuse('environment', `environment ${e.name}: admin bypass must be off (can_admins_bypass=${env.can_admins_bypass})`);
  const pol = env.deployment_branch_policy;
  if (!pol || pol.protected_branches !== false || pol.custom_branch_policies !== true) refuse('environment', `environment ${e.name}: deployments must be limited to selected branches (got ${JSON.stringify(pol)})`);
  const bp = await get(api, `/repos/${repo}/environments/${encodeURIComponent(e.name)}/deployment-branch-policies`);
  const list = Array.isArray(bp?.branch_policies) ? bp.branch_policies : null;
  if (!list || list.length !== 1 || list[0].name !== e.branch || (list[0].type && list[0].type !== 'branch')) refuse('environment', `environment ${e.name}: the only deployment branch must be ${e.branch} (got ${JSON.stringify((list || []).map((x) => (x.type || 'branch') + ':' + x.name))})`);
  return { reviewers: logins, branch: e.branch };
}

export function listFiles(root) {
  const out = [];
  (function rec(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      const st = fs.lstatSync(path.join(dir, e.name));
      if (st.isSymbolicLink()) refuse('artifact-integrity', `symlink in artifact: ${r}`);
      if (st.isDirectory()) rec(path.join(dir, e.name), r);
      else if (st.isFile()) out.push(r);
      else refuse('artifact-integrity', `not a regular file: ${r}`);
    }
  })(root, '');
  return out.sort();
}

// The downloaded build: version.json names this commit, build.json lists every file with its sha256, nothing else is present.
export function validateArtifact(dir, { sha, _disable = [] }) {
  if (new Set(_disable).has('artifact-integrity')) return JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8'));
  const files = listFiles(dir);
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { refuse('artifact-integrity', `${f} missing or not JSON`); } };
  const v = read('version.json'), b = read('build.json');
  if (!/^[0-9a-f]{12}$/.test(v.build || '') || v.build !== b.build) refuse('artifact-integrity', `version.json build "${v.build}" != build.json build "${b.build}"`);
  if (v.source !== sha) refuse('artifact-integrity', `version.json source "${v.source}" is not ${sha}`);
  const listed = Object.keys(b.files || {}).sort();
  const present = files.filter((f) => f !== 'version.json' && f !== 'build.json');
  if (!listed.length || JSON.stringify(listed) !== JSON.stringify(present)) {
    const extra = present.filter((f) => !listed.includes(f)), missing = listed.filter((f) => !present.includes(f));
    refuse('artifact-integrity', `artifact files != build.json (extra: ${extra.join(', ') || '-'}; missing: ${missing.join(', ') || '-'})`);
  }
  for (const f of listed) {
    if (!FILE_RE.test(f) || f.split('/').includes('..')) refuse('artifact-integrity', `bad path in build.json: ${f}`);
    const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex');
    if (h !== b.files[f]) refuse('artifact-integrity', `${f} sha256 ${h.slice(0, 12)} != build.json ${String(b.files[f]).slice(0, 12)}`);
  }
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  if (!html.includes(`<meta name="kmob-build" content="${v.build}">`)) refuse('artifact-integrity', 'index.html does not carry its kmob-build meta');
  return { build: v.build, source: v.source, files: listed.length };
}

export function liveVersion(siteDir, sitePath) {
  const j = (f) => { try { return JSON.parse(fs.readFileSync(path.join(siteDir, sitePath, f), 'utf8')); } catch { return null; } };
  const v = j('version.json'), b = j('build.json');
  return { build: v?.build || b?.build || 'none', source: typeof v?.source === 'string' ? v.source : '' };
}

const git = (cwd, args, opts = {}) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();

export function pathGuard(names, sitePath, { _disable = [] } = {}) {
  if (new Set(_disable).has('path-guard')) return;
  const bad = names.filter((n) => !n.startsWith(sitePath + '/'));
  if (bad.length) refuse('path-guard', `refusing: paths outside ${sitePath}/ would change: ${bad.slice(0, 10).join(', ')}`);
}

// The commit about to be pushed: exactly one commit on top of base, touching sitePath/ only.
export function guardCommit(siteDir, base, sitePath, opts = {}) {
  const n = Number(git(siteDir, ['rev-list', '--count', `${base}..HEAD`]));
  if (n !== 1 && !new Set(opts._disable || []).has('path-guard')) refuse('path-guard', `expected exactly 1 commit on top of ${base.slice(0, 12)}, found ${n}`);
  pathGuard(git(siteDir, ['diff', '--name-only', base, 'HEAD']).split('\n').filter(Boolean), sitePath, opts);
}

// Replace sitePath/ with the artifact, stage only that, check, commit once. Returns { prev, next, changed }.
export function stage({ siteDir, artifactDir, sitePath, sha, run = '', _disable = [] }) {
  const prev = liveVersion(siteDir, sitePath).build;
  const next = JSON.parse(fs.readFileSync(path.join(artifactDir, 'version.json'), 'utf8')).build;
  const dst = path.join(siteDir, sitePath);
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(artifactDir, dst, { recursive: true });
  git(siteDir, ['add', '-A', '--', sitePath]);
  const names = git(siteDir, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
  pathGuard(names, sitePath, { _disable });
  if (!names.length) return { prev, next, changed: [] };
  git(siteDir, ['-c', 'user.name=KMOB CI', '-c', 'user.email=ci@keepitil.com', 'commit', '-q',
    '-m', `KMOB games/kmob: build ${next} (KMOB ${sha.slice(0, 7)}), replaces ${prev}`,
    '-m', `Published by kmob-publish from KEEPITIL/KMOB ${sha}${run ? ' (' + run + ')' : ''}. Rollback: revert the KMOB merge and publish that, or revert this commit.`]);
  guardCommit(siteDir, 'HEAD~1', sitePath, { _disable });
  return { prev, next, changed: names };
}

// Push with a fresh tip check before EVERY attempt; on a race, rebase (the commit touches sitePath/ only) and re-check.
export async function push({ siteDir, api, sha, config, remote = 'origin', siteBranch = 'main', tries = 5, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), _disable = [] }) {
  const off = new Set(_disable);
  for (let i = 1; i <= tries; i++) {
    if (!off.has('tip')) await assertTip({ api, sha, config });
    guardCommit(siteDir, 'HEAD~1', config.sitePath, { _disable });
    try { git(siteDir, ['push', '-q', remote, `HEAD:${siteBranch}`]); return { attempts: i, head: git(siteDir, ['rev-parse', 'HEAD']) }; } catch (e) {
      if (i === tries) refuse('push', `could not push after ${tries} tries: ${String(e.stderr || e.message).trim().split('\n').pop()}`);
      await sleep(i * 3000);
      try { git(siteDir, ['-c', 'user.name=KMOB CI', '-c', 'user.email=ci@keepitil.com', 'pull', '-q', '--rebase', remote, siteBranch]); } catch (e2) { try { git(siteDir, ['rebase', '--abort']); } catch {} refuse('push', 'rebase onto the new site tip failed (someone else changed games/kmob?): ' + String(e2.stderr || e2.message).trim().split('\n').pop()); }
    }
  }
}
