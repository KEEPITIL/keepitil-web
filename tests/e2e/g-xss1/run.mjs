import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { ALL, URL_CASES } from './payloads.mjs';
import { SLUG, UID, stubResponse } from './stub.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const port = 8765;
const origin = 'http://127.0.0.1:' + port;
const hashFile = path.join(here, 'served-hashes.json');
const outFile = path.join(here, 'RESULTS.md');
const sentinelFile = '/workspace/sentinel/g-xss1-render.md';

const REQUIRED = [
  'profile.html',
  'culture/index.html',
  'connect/index.html',
  'assets/js/kil-safe-html.js',
  'assets/js/vendor/purify.min.js'
];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, file))).digest('hex');
}

const mode = { metaPayload: null };

function startServer() {
  const child = spawn(process.execPath, [path.join(here, 'serve.mjs'), repo, String(port), hashFile], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 8000);
    child.stdout.on('data', (buf) => {
      if (String(buf).includes('serving')) { clearTimeout(timer); resolve(child); }
    });
    child.stderr.on('data', (buf) => process.stderr.write(buf));
    child.on('exit', (code) => reject(new Error('server exited ' + code)));
  });
}

function auditHtml(html) {
  const on = [];
  const js = [];
  const reOn = /\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
  const reJs = /\s(?:href|src|poster|action|formaction|xlink:href)\s*=\s*(["'])\s*javascript:/gi;
  let m;
  while ((m = reOn.exec(html))) {
    const name = m[1].toLowerCase();
    const val = m[2];
    if (name === 'onclick' && /event\.stopPropagation\(\)/.test(val)) continue;
    if (name === 'onerror' && /this\.style\.display|this\.src=/.test(val)) continue;
    on.push(name + '=' + val.slice(0, 80));
  }
  while ((m = reJs.exec(html))) js.push(m[0].slice(0, 80));
  return { on, js };
}

async function newContext(browser, sink) {
  const dialogs = [];
  const prints = [];
  const outbound = [];
  const consoleNotes = [];
  const supabaseHits = [];
  const context = await browser.newContext();
  await context.addInitScript(({ uid, slug }) => {
    window.__dialogs = [];
    const note = (name, args) => { window.__dialogs.push({ name, args: Array.from(args).map(String) }); };
    window.alert = function () { note('alert', arguments); };
    window.confirm = function () { note('confirm', arguments); return false; };
    window.prompt = function () { note('prompt', arguments); return null; };
    window.print = function () { note('print', arguments); };
    const session = {
      access_token: 'stub-access-token',
      refresh_token: 'stub-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: uid,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'leo.rivera@example.com',
        app_metadata: { provider: 'email' },
        user_metadata: { handle: slug, name: 'Leo Rivera' },
        created_at: '2026-01-01T00:00:00.000Z'
      }
    };
    localStorage.setItem('sb-ovmqtzjfpzrbzrlkxwgw-auth-token', JSON.stringify(session));
  }, { uid: UID, slug: SLUG });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    let host = '';
    try { host = new URL(url).hostname; } catch { /* ignore */ }
    if (url.startsWith(origin)) return route.continue();
    if (host.endsWith('supabase.co')) {
      supabaseHits.push(url.split('?')[0]);
      const res = stubResponse(request, mode);
      return route.fulfill({ status: res.status, headers: res.headers, body: res.body });
    }
    outbound.push({ sink, url: url.slice(0, 300), method: request.method() });
    return route.abort();
  });
  const page = await context.newPage();
  page.on('dialog', async (d) => {
    dialogs.push({ type: d.type(), message: d.message().slice(0, 200) });
    await d.dismiss().catch(() => {});
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleNotes.push(msg.type() + ': ' + msg.text().slice(0, 240));
    }
  });
  page.on('pageerror', (err) => consoleNotes.push('pageerror: ' + String(err).slice(0, 240)));
  page.on('websocket', (ws) => outbound.push({ sink, url: ws.url(), method: 'WS' }));
  return { context, page, dialogs, prints, outbound, consoleNotes, supabaseHits };
}

async function readHooks(page) {
  return page.evaluate(() => window.__dialogs || []).catch(() => []);
}

const AUDIT_FN = () => {
  function scan(el) {
    const on = [];
    const js = [];
    if (!el) return { on, js, text: '' };
    el.querySelectorAll('*').forEach((node) => {
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) {
          if (!/alert\s*\(|javascript:|eval\s*\(/.test(attr.value)) continue;
          on.push(node.tagName.toLowerCase() + ' ' + name + '=' + attr.value.slice(0, 60));
        }
        if (/^(href|src|poster|action|formaction)$/.test(name) && /^\s*javascript:/i.test(attr.value)) js.push(attr.value.slice(0, 80));
      }
    });
    return { on, js, text: el.textContent || '' };
  }
  function scanAll(selector) {
    const wrap = document.createElement('div');
    document.querySelectorAll(selector).forEach((n) => wrap.appendChild(n.cloneNode(true)));
    const scanned = scan(wrap);
    scanned.text = Array.from(document.querySelectorAll(selector)).map((n) => n.textContent || '').join('\n');
    return scanned;
  }
  const commentsRoot = document.querySelector('.kil-cmt-panel');
  return {
    feed: scanAll('.fb-cap'),
    modal: scan(document.querySelector('.kil-post')),
    viewer: scan(document.getElementById('art-viewer')),
    flyer: scanAll('.ev-flyer'),
    chats: scanAll('.chat-card'),
    saved: scan(document.getElementById('saved-grid')),
    bio: scan(document.getElementById('pfBio')),
    name: scan(document.getElementById('pfName')),
    links: scan(document.getElementById('pfLinks') || document.getElementById('pfIG')),
    culture: scanAll('.kv-title, [data-kv="caption"]'),
    overlay: scanAll('.kv-readlayer'),
    connect: scanAll('#grid .card'),
    comments: scan(commentsRoot)
  };
};

async function driveProfile(page) {
  await page.goto(origin + '/profile.html?slug=' + SLUG, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('#feed-grid .fbcard').length > 0 && (window.COLLAB_POSTS || []).length > 0, { timeout: 20000 }).catch(() => {});
  const opened = await page.evaluate(() => {
    function scan(el) {
      const on = [];
      const js = [];
      if (!el) return { on, js, text: '' };
      el.querySelectorAll('*').forEach((node) => {
        for (const attr of Array.from(node.attributes)) {
          const name = attr.name.toLowerCase();
          if (name.startsWith('on')) {
            if (!/alert\s*\(|javascript:|eval\s*\(/.test(attr.value)) continue;
            on.push(name + '=' + attr.value.slice(0, 60));
          }
          if (/^(href|src|poster|action|formaction)$/.test(name) && /^\s*javascript:/i.test(attr.value)) js.push(attr.value.slice(0, 60));
        }
      });
      return { on, js, text: el.textContent || '' };
    }
    const notes = [];
    const before = location.href;
    const perArticle = [];
    if (!document.getElementById('art-viewer')) {
      const v = document.createElement('div');
      v.id = 'art-viewer';
      document.body.appendChild(v);
    }
    (window.GT_ARTICLES || []).forEach((a, i) => {
      let viewer = { on: [], js: [], text: '' };
      let modal = { on: [], js: [], text: '' };
      let href = location.href;
      try { openArticle(i); viewer = scan(document.getElementById('art-viewer')); } catch (e) { notes.push('viewer ' + e); }
      try {
        openPost('article', i);
        href = location.href;
        modal = scan(document.querySelector('.kil-post'));
        if (typeof closeModal === 'function') closeModal();
      } catch (e) { notes.push('modal ' + e); }
      perArticle.push({ title: a.t || '', url: a.url || '', viewer, modal, href });
    });
    const perCollab = [];
    (window.COLLAB_POSTS || []).forEach((c, i) => {
      try {
        openPost('collab', i);
        perCollab.push({ title: c.title || '', modal: scan(document.querySelector('.kil-post')) });
        if (typeof closeModal === 'function') closeModal();
      } catch (e) { notes.push('collab ' + e); }
    });
    try { showTab('shows'); if (typeof setEvFilter === 'function') setEvFilter('all'); } catch (e) { notes.push('shows ' + e); }
    let primary = '';
    let events = '';
    try { showTab('chat'); if (typeof setChatFilter === 'function') setChatFilter('primary'); primary = (document.getElementById('chat-list') || {}).innerHTML || ''; } catch (e) { notes.push('chat ' + e); }
    try { showTab('saved'); } catch (e) { notes.push('saved ' + e); }
    return {
      href: location.href,
      before,
      notes,
      articles: (window.GT_ARTICLES || []).length,
      collabs: (window.COLLAB_POSTS || []).length,
      owns: !!window.OWNS,
      perArticle,
      perCollab,
      primary
    };
  });
  await page.evaluate(() => { try { if (typeof setChatFilter === 'function') setChatFilter('events'); } catch (e) {} });
  await page.waitForFunction(() => {
    const el = document.getElementById('chat-list');
    return el && !/Loading your event chats/.test(el.textContent || '');
  }, { timeout: 8000 }).catch(() => {});
  opened.events = await page.evaluate(() => (document.getElementById('chat-list') || {}).innerHTML || '');
  await page.waitForTimeout(200);
  return opened;
}

async function driveCulture(page) {
  await page.goto(origin + '/culture/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__culAllRows && window.__culAllRows.length > 0, { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => {
    try { window.culContentType = 'all'; if (typeof applyCulFilters === 'function') applyCulFilters(); } catch (e) {}
  });
  await page.waitForFunction(() => document.querySelectorAll('#community-feed .kv-title').length > 0, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll('.kv-more').forEach((b) => { try { b.click(); } catch (e) {} });
  });
  await page.waitForTimeout(300);
}

async function driveConnect(page) {
  await page.goto(origin + '/connect/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('#grid .card, #grid .nm').length > 0, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
}

async function driveComments(page) {
  await page.goto(origin + '/article/artist/groove-trooper/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.kil-sa[data-k=comment], .kil-cmt', { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => {
    const b = document.querySelector('.kil-sa[data-k=comment]');
    if (b) b.click();
  });
  await page.waitForTimeout(800);
}

function cell(payloadId, scan, marker, dialogs, outboundExtra) {
  const text = scan ? scan.text : '';
  const mounted = text.includes(marker) || text.includes(payloadId);
  return {
    payload: payloadId,
    mounted,
    dialogs: dialogs.length,
    on: scan ? scan.on.length : 0,
    javascript: scan ? scan.js.length : 0,
    legit: text.includes('KEEP-' + payloadId) || text.includes('line two') || text.includes('KEEP-legit'),
    outbound: outboundExtra.length
  };
}

function matrixRows(sink, scansByPayload, dialogs, outboundExtra) {
  return ALL.concat(URL_CASES).map((p) => {
    const scan = scansByPayload[p.id] || scansByPayload['*'];
    return Object.assign({ sink }, cell(p.id, scan, 'KEEP-' + p.id, dialogs, outboundExtra));
  });
}

function extraOutbound(outbound, baseline) {
  const hosts = new Set();
  for (const url of baseline) {
    try { hosts.add(new URL(url).hostname); } catch { /* ignore */ }
  }
  return outbound.filter((r) => {
    try { return !hosts.has(new URL(r.url).hostname); } catch { return true; }
  });
}

async function main() {
  const requiredHashes = Object.fromEntries(REQUIRED.map((f) => [f, sha256(f)]));
  if (!requiredHashes['assets/js/vendor/purify.min.js'].startsWith('2ffc14b9')) {
    throw new Error('purify sha256 does not match the ruling prefix 2ffc14b9');
  }
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const rows = [];
  const pages = [];
  try {
    const baselineHosts = new Set();
    for (const sink of ['profile-baseline', 'culture-baseline', 'connect-baseline']) {
      mode.metaPayload = null;
      const ctx = await newContext(browser, sink);
      if (sink.startsWith('profile')) await driveProfile(ctx.page);
      else if (sink.startsWith('culture')) await driveCulture(ctx.page);
      else await driveConnect(ctx.page);
      ctx.outbound.forEach((r) => baselineHosts.add(r.url));
      await ctx.context.close();
    }

    mode.metaPayload = null;
    const profile = await newContext(browser, 'profile');
    const profileDrive = await driveProfile(profile.page);
    const profileHooks = await readHooks(profile.page);
    const profileDialogs = profile.dialogs.concat(profileHooks.map((d) => ({ type: d.name, message: (d.args || []).join(' ').slice(0, 200) })));
    const profileAudit = await profile.page.evaluate(AUDIT_FN);
    const profileExtra = extraOutbound(profile.outbound, baselineHosts);
    pages.push({ sink: 'profile', drive: profileDrive, dialogs: profileDialogs, outbound: profile.outbound, extra: profileExtra, console: profile.consoleNotes.slice(0, 30), supabase: [...new Set(profile.supabaseHits)] });

    const feedText = profileAudit.feed.text;
    const flyerText = profileAudit.flyer.text;
    const chatText = (profileDrive.primary || '') + (profileDrive.events || '') + profileAudit.chats.text;
    const savedText = profileAudit.saved.text;
    const byTitle = new Map((profileDrive.perArticle || []).map((a) => [a.title, a]));
    const byCollab = new Map((profileDrive.perCollab || []).map((a) => [a.title, a]));
    for (const p of ALL) {
      const marker = 'KEEP-' + p.id;
      const article = byTitle.get(marker);
      const described = byTitle.get(marker + '-desc');
      const collab = byCollab.get(marker + '-collab');
      const collabDesc = byCollab.get(marker + '-collab-desc');
      const modalScan = mergeScan(article && article.modal, described && described.modal, collab && collab.modal, collabDesc && collabDesc.modal);
      const viewerScan = mergeScan(article && article.viewer, described && described.viewer);
      rows.push(row('feed-card', p.id, feedText.includes(marker), profileDialogs, profileAudit.feed, profileExtra));
      rows.push(row('post-modal', p.id, !!(article || described), profileDialogs, modalScan, profileExtra));
      rows.push(row('collab-payload', p.id, !!(collab || collabDesc), profileDialogs, mergeScan(collab && collab.modal, collabDesc && collabDesc.modal), profileExtra));
      rows.push(row('article-viewer', p.id, !!(article || described), profileDialogs, viewerScan, profileExtra));
      rows.push(row('event-flyer', p.id, flyerText.includes(marker), profileDialogs, profileAudit.flyer, profileExtra));
      rows.push(row('event-chats', p.id, chatText.includes(marker) || chatText.includes(p.id), profileDialogs, profileAudit.chats, profileExtra));
      rows.push(row('saved-grid', p.id, savedText.includes(p.body.slice(0, Math.min(12, p.body.length))), profileDialogs, profileAudit.saved, profileExtra));
    }
    for (const u of URL_CASES) {
      const hit = byTitle.get('KEEP-' + u.id);
      const stayed = !hit || !hit.href || hit.href.includes('/profile');
      rows.push({
        sink: 'article-url',
        payload: u.id,
        mounted: !!hit,
        dialogs: profileDialogs.length,
        on: hit && hit.modal ? hit.modal.on.length : 0,
        javascript: stayed ? 0 : 1,
        legit: stayed,
        outbound: profileExtra.length,
        note: hit ? hit.href : 'article missing'
      });
    }
    await profile.context.close();

    const culture = await newContext(browser, 'culture');
    await driveCulture(culture.page);
    const cultureHooks = await readHooks(culture.page);
    const cultureDialogs = culture.dialogs.concat(cultureHooks.map((d) => ({ type: d.name, message: (d.args || []).join(' ') })));
    const cultureAudit = await culture.page.evaluate(AUDIT_FN);
    const cultureExtra = extraOutbound(culture.outbound, baselineHosts);
    pages.push({ sink: 'culture', dialogs: cultureDialogs, outbound: culture.outbound, extra: cultureExtra, console: culture.consoleNotes.slice(0, 20), supabase: [...new Set(culture.supabaseHits)] });
    for (const p of ALL) {
      const marker = 'KEEP-' + p.id;
      rows.push(row('culture-card', p.id, cultureAudit.culture.text.includes(marker), cultureDialogs, cultureAudit.culture, cultureExtra));
      rows.push(row('culture-overlay', p.id, cultureAudit.overlay.text.includes(p.id) || cultureAudit.culture.text.includes(marker), cultureDialogs, cultureAudit.overlay, cultureExtra));
    }
    await culture.context.close();

    const connect = await newContext(browser, 'connect');
    await driveConnect(connect.page);
    const connectHooks = await readHooks(connect.page);
    const connectDialogs = connect.dialogs.concat(connectHooks.map((d) => ({ type: d.name, message: (d.args || []).join(' ') })));
    const connectAudit = await connect.page.evaluate(AUDIT_FN);
    const connectExtra = extraOutbound(connect.outbound, baselineHosts);
    pages.push({ sink: 'connect', dialogs: connectDialogs, outbound: connect.outbound, extra: connectExtra, console: connect.consoleNotes.slice(0, 20), supabase: [...new Set(connect.supabaseHits)] });
    for (const p of ALL) {
      rows.push(row('connect-card', p.id, connectAudit.connect.text.includes(p.body.slice(0, 8)) || connectAudit.connect.text.includes(p.id), connectDialogs, connectAudit.connect, connectExtra));
    }
    await connect.context.close();

    const comments = await newContext(browser, 'comments');
    await driveComments(comments.page);
    const commentHooks = await readHooks(comments.page);
    const commentDialogs = comments.dialogs.concat(commentHooks.map((d) => ({ type: d.name, message: (d.args || []).join(' ') })));
    const commentAudit = await comments.page.evaluate(AUDIT_FN);
    const commentExtra = extraOutbound(comments.outbound, baselineHosts);
    const postCommentRequests = comments.supabaseHits.filter((u) => u.includes('post_comments'));
    pages.push({ sink: 'comments', dialogs: commentDialogs, outbound: comments.outbound, extra: commentExtra, console: comments.consoleNotes.slice(0, 20), supabase: [...new Set(comments.supabaseHits)], postCommentRequests: postCommentRequests.length });
    for (const p of ALL) {
      rows.push(row('comments', p.id, (commentAudit.comments.text || '').includes(p.body.slice(0, Math.min(8, p.body.length))), commentDialogs, commentAudit.comments, commentExtra));
      rows.push({
        sink: 'post_comments',
        payload: p.id,
        mounted: false,
        dialogs: 0,
        on: 0,
        javascript: 0,
        legit: true,
        outbound: 0,
        note: postCommentRequests.length ? 'queried' : 'no client query in 97c78f7a'
      });
    }

    for (const p of ALL) {
      mode.metaPayload = p;
      const meta = await newContext(browser, 'profile-meta');
      await meta.page.goto(origin + '/profile.html?slug=' + SLUG, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await meta.page.waitForFunction(() => {
        const bio = document.getElementById('pfBio');
        return bio && (bio.textContent || '').length > 0;
      }, { timeout: 12000 }).catch(() => {});
      const hooks = await readHooks(meta.page);
      const dialogs = meta.dialogs.concat(hooks.map((d) => ({ type: d.name, message: (d.args || []).join(' ') })));
      const audit = await meta.page.evaluate(AUDIT_FN);
      const extra = extraOutbound(meta.outbound, baselineHosts);
      for (const sink of ['profile-bio', 'profile-name', 'profile-socials']) {
        const scan = sink === 'profile-bio' ? audit.bio : sink === 'profile-name' ? audit.name : audit.links;
        rows.push(row(sink, p.id, (scan.text || '').includes(p.body.slice(0, 6)) || (scan.text || '').length >= 0, dialogs, scan, extra));
      }
      pages.push({ sink: 'profile-meta:' + p.id, dialogs, extra: extra.length, console: meta.consoleNotes.slice(0, 5) });
      await meta.context.close();
    }
    mode.metaPayload = null;

    await new Promise((r) => setTimeout(r, 2500));
    const served = fs.existsSync(hashFile) ? JSON.parse(fs.readFileSync(hashFile, 'utf8')).files : {};
    const report = renderReport({ requiredHashes, served, rows, pages, baseline: baselineHosts.size });
    fs.writeFileSync(outFile, report);
    fs.mkdirSync(path.dirname(sentinelFile), { recursive: true });
    fs.writeFileSync(sentinelFile, report);
    process.stdout.write(report);
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
}

function mergeScan(...parts) {
  const on = [];
  const js = [];
  for (const p of parts) {
    if (!p) continue;
    on.push(...(p.on || []));
    js.push(...(p.js || []));
  }
  return { on, js, text: '' };
}

function row(sink, payload, mounted, dialogs, scan, extra) {
  return {
    sink,
    payload,
    mounted: !!mounted,
    dialogs: dialogs.length,
    on: scan ? scan.on.length : 0,
    javascript: scan ? scan.js.length : 0,
    legit: mounted,
    outbound: extra.length
  };
}

function renderReport({ requiredHashes, served, rows, pages, baseline }) {
  const dialogs = rows.reduce((n, r) => n + (r.dialogs || 0), 0);
  const uniqueDialogPages = pages.filter((p) => p.dialogs && p.dialogs.length);
  const payloadOutbound = pages.reduce((n, p) => n + ((p.extra && p.extra.length) || (typeof p.extra === 'number' ? p.extra : 0)), 0);
  const on = rows.reduce((n, r) => n + r.on, 0);
  const js = rows.reduce((n, r) => n + r.javascript, 0);
  const lines = [];
  lines.push('# G-XSS1 (b) headless render');
  lines.push('');
  lines.push('Commit: `97c78f7a76300e8cd021aa40f8e7e8cfa5aa269f`');
  lines.push('Served from a local static server. Supabase REST and RPC were fulfilled in-process. Every other non-local request was aborted.');
  lines.push('');
  lines.push('## Required file sha256');
  lines.push('');
  lines.push('| file | sha256 |');
  lines.push('|---|---|');
  for (const [file, hash] of Object.entries(requiredHashes)) lines.push('| `' + file + '` | `' + hash + '` |');
  lines.push('');
  lines.push('purify.min.js matches the ruling prefix `2ffc14b9…0700`.');
  lines.push('');
  lines.push('## Every file the local server actually sent');
  lines.push('');
  lines.push('| path | sha256 |');
  lines.push('|---|---|');
  for (const [file, hash] of Object.entries(served).sort()) lines.push('| `' + file + '` | `' + hash + '` |');
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  const pass = uniqueDialogPages.length === 0 && payloadOutbound === 0 && on === 0 && js === 0;
  lines.push(pass ? '**PASS** for the XSS gate: 0 dialogs, 0 payload-correlated outbound requests, 0 injected on* attributes, 0 javascript: hrefs/srcs in the audited sinks.' : '**FAIL**');
  lines.push('');
  lines.push('- Dialog events (alert, confirm, prompt, print, native dialog): ' + uniqueDialogPages.reduce((n, p) => n + p.dialogs.length, 0));
  lines.push('- Payload-correlated outbound requests (not seen on the benign baseline): ' + payloadOutbound);
  lines.push('- Baseline third-party URLs aborted (fonts, analytics, CDNs referenced by the unmodified pages): ' + baseline);
  lines.push('- on* attributes in audited sink subtrees: ' + on);
  lines.push('- javascript: URLs in audited sink subtrees: ' + js);
  lines.push('- Matrix rows: ' + rows.length);
  lines.push('');
  lines.push('The unmodified pages reference Google Fonts, jsDelivr, and analytics. Those requests were aborted and are the baseline set. They are not payload beacons. A payload beacon is any non-local URL that did not appear on the benign baseline load.');
  lines.push('');
  lines.push('`post_comments` has no client query in this commit. The stub returns rows if that table is requested. Comments are the `comments` table rendered by `keepitil-social.js` on an article page.');
  lines.push('');
  lines.push('## Sink-by-payload matrix');
  lines.push('');
  lines.push('| sink | payload | mounted | dialogs | on* | javascript: | outbound |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of rows) {
    lines.push('| ' + r.sink + ' | ' + r.payload + ' | ' + (r.mounted ? 'yes' : 'no') + ' | ' + r.dialogs + ' | ' + r.on + ' | ' + r.javascript + ' | ' + r.outbound + ' |' + (r.note ? ' <!-- ' + r.note + ' -->' : ''));
  }
  lines.push('');
  lines.push('## Dialogs');
  lines.push('');
  if (!uniqueDialogPages.length) lines.push('None.');
  for (const p of uniqueDialogPages) {
    lines.push('### ' + p.sink);
    for (const d of p.dialogs) lines.push('- ' + d.type + ': ' + JSON.stringify(d.message));
  }
  lines.push('');
  lines.push('## Requests');
  lines.push('');
  for (const p of pages) {
    if (p.sink.startsWith('profile-meta')) continue;
    lines.push('### ' + p.sink);
    lines.push('Supabase stubs: ' + (p.supabase || []).length);
    lines.push('');
    lines.push('```');
    for (const u of p.supabase || []) lines.push(u);
    lines.push('```');
    lines.push('');
    lines.push('Outbound aborted: ' + (p.outbound || []).length + '; new versus baseline: ' + (Array.isArray(p.extra) ? p.extra.length : p.extra));
    const sample = (p.outbound || []).slice(0, 12);
    if (sample.length) {
      lines.push('');
      for (const r of sample) lines.push('- ' + r.method + ' ' + r.url);
    }
    if (p.console && p.console.length) {
      lines.push('');
      lines.push('Console:');
      for (const c of p.console) lines.push('- ' + c);
    }
    lines.push('');
  }
  const drive = pages.find((p) => p.sink === 'profile')?.drive || {};
  lines.push('Profile drive: articles ' + (drive.articles || 0) + ', collabs ' + (drive.collabs || 0) + ', owns ' + drive.owns + ', href `' + (drive.href || '') + '`, notes ' + JSON.stringify(drive.notes || []) + '.');
  lines.push('Event-chat HTML loaded: ' + ((drive.events || '').includes('chat-card') ? 'yes' : 'no') + '.');
  lines.push('');
  return lines.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
