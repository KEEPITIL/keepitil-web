#!/usr/bin/env node
// kmob-publish CLI, run by .github/workflows/kmob-publish.yml (docs/KMOB_PUBLISH.md).
//   verify   --sha <kmob commit> --site <keepitil-web dir> --out <facts.json>   all preconditions (lib.mjs verify)
//   download --facts <facts.json> --dest <dir>                                  the run's artifact, digest-checked, unzipped
//   stage    --sha <kmob commit> --site <dir> --artifact <dir> [--facts f]      integrity check, replace games/kmob, one commit
//   push     --sha <kmob commit> --site <dir>                                   tip re-check before every attempt, path guard, push
// KMOB_READ_TOKEN (env) is the read-only KMOB token; only verify, download and push read it. A refusal exits 1 with "REFUSED [code]".
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Refusal, loadConfig, githubApi, verify, validateArtifact, liveVersion, stage, push } from './lib.mjs';

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) o[a.slice(2)] = argv[++i]; else o._.push(a); }
  return o;
}
const say = (s) => process.stdout.write(s + '\n');
function output(env, pairs) {
  if (!env.GITHUB_OUTPUT) return;
  fs.appendFileSync(env.GITHUB_OUTPUT, Object.entries(pairs).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
}

async function download({ facts, dest, token, fetchImpl = globalThis.fetch }) {
  const a = facts.artifact;
  if (!a?.url) throw new Refusal('artifact', 'no artifact in the verified facts');
  if (!token) throw new Refusal('no-token', 'KMOB_READ_TOKEN is empty');
  const r = await fetchImpl(a.url, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'keepitil-web-kmob-publish' }, redirect: 'follow' });
  if (!r.ok) throw new Refusal('artifact', `artifact download -> HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (a.digest) {
    const [alg, want] = a.digest.split(':');
    if (alg !== 'sha256') throw new Refusal('artifact-integrity', `unknown artifact digest ${a.digest}`);
    const got = crypto.createHash('sha256').update(buf).digest('hex');
    if (got !== want) throw new Refusal('artifact-integrity', `artifact zip sha256 ${got.slice(0, 12)} != ${want.slice(0, 12)}`);
  }
  fs.rmSync(dest, { recursive: true, force: true }); fs.mkdirSync(dest, { recursive: true });
  const zip = dest.replace(/\/$/, '') + '.zip';
  fs.writeFileSync(zip, buf);
  const entries = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const bad = entries.filter((e) => e.startsWith('/') || e.split('/').includes('..') || e.includes('\\'));
  if (bad.length || !entries.length) throw new Refusal('artifact-integrity', `unsafe or empty zip entries: ${bad.slice(0, 5).join(', ') || '(none)'}`);
  execFileSync('unzip', ['-q', zip, '-d', dest]);
  return { bytes: buf.length, entries: entries.length };
}

// deps: { api, fetchImpl, env, config } are injected by the tests; the real entry point passes none of them.
export async function main(argv, deps = {}) {
  const o = args(argv), cmd = o._[0], env = deps.env || process.env;
  const config = deps.config || loadConfig();
  const token = env.KMOB_READ_TOKEN || '';
  const api = () => deps.api || githubApi(token, { fetchImpl: deps.fetchImpl });
  const site = o.site ? path.resolve(o.site) : process.cwd();
  try {
    if (cmd === 'verify') {
      const live = liveVersion(site, config.sitePath);
      const facts = await verify({ api: api(), sha: o.sha, config, liveSource: live.source });
      facts.live = live;
      if (o.out) fs.writeFileSync(o.out, JSON.stringify(facts, null, 1));
      say(`verified KMOB ${o.sha}: PR #${facts.pr} (head ${facts.prHead.slice(0, 12)}) merged into ${config.branch}, tip, run ${facts.run.url} green (${config.requiredJobs.join(', ')}), preconditions ${config.preconditions.map((p) => '#' + p.pr).join(', ') || '-'} met`);
      say(`live games/kmob: build ${live.build}, source ${live.source || '(not recorded)'}; artifact ${facts.artifact.name} (${facts.artifact.size} bytes)`);
      output(env, { pr: facts.pr, run: facts.run.url });
      return 0;
    }
    if (cmd === 'download') {
      const facts = JSON.parse(fs.readFileSync(o.facts, 'utf8'));
      const r = await download({ facts, dest: path.resolve(o.dest), token: deps.api ? 'fixture' : token, fetchImpl: deps.fetchImpl });
      say(`downloaded ${facts.artifact.name}: ${r.bytes} bytes, ${r.entries} entries`);
      return 0;
    }
    if (cmd === 'stage') {
      const art = path.resolve(o.artifact);
      const facts = o.facts ? JSON.parse(fs.readFileSync(o.facts, 'utf8')) : {};
      const v = validateArtifact(art, { sha: o.sha });
      const r = stage({ siteDir: site, artifactDir: art, sitePath: config.sitePath, sha: o.sha, run: facts.run?.url || '' });
      say(`games/kmob: live ${r.prev} -> ${r.next} (KMOB ${o.sha.slice(0, 7)}), artifact ${v.files} files verified against build.json`);
      say(r.changed.length ? `${r.changed.length} paths change:\n  ` + r.changed.slice(0, 60).join('\n  ') : 'nothing changes: this build is already live');
      output(env, { prev: r.prev, next: r.next, changed: r.changed.length });
      return 0;
    }
    if (cmd === 'push') {
      const r = await push({ siteDir: site, api: api(), sha: o.sha, config, sleep: deps.sleep });
      say(`pushed ${r.head.slice(0, 12)} to keepitil-web main (attempt ${r.attempts})`);
      output(env, { pushed: r.head });
      return 0;
    }
    say('usage: cli.mjs verify|download|stage|push ... (see the header)');
    return 2;
  } catch (e) {
    if (e instanceof Refusal) { say(`REFUSED [${e.code}]: ${e.message}`); if (env.GITHUB_ACTIONS) say(`::error title=kmob-publish refused (${e.code})::${e.message}`); return 1; }
    throw e;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { console.error(e); process.exitCode = 1; });
}
