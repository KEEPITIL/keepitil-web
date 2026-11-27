/* KEEPITIL kode/app.html: inline script "main" moved verbatim to an external file (CSP: no executable inline script). */
const SUPABASE_URL = 'https://xdoxfoectugsbbujjezq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_F1oMr-STZ3HH3Z_Wu4CYCg_oDwhLKnm';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const PLATFORM_ICON = {instagram:'📸',tiktok:'🎵',linkedin:'💼',facebook:'👥',pinterest:'📌',x:'✖️',youtube:'▶️'};
let me = null;        // auth user
let myProfile = null; // profiles row
let signupMode = false;

const $ = id => document.getElementById(id);
const show = id => {
  for (const v of document.querySelectorAll('.view')) v.classList.remove('on');
  $(id).classList.add('on');
};
const flash = (el, text, ok) => { el.textContent = text; el.className = 'msg ' + (ok ? 'ok' : 'err'); };

/* ---------- routing ---------- */
async function route(){
  const { data: { session } } = await db.auth.getSession();
  if (!session) { me = null; myProfile = null; renderWho(); show('view-auth'); return; }
  me = session.user;
  const { data: prof } = await db.from('profiles').select('*').eq('id', me.id).maybeSingle();
  myProfile = prof;
  renderWho();
  if (!prof) { show('view-handle'); return; }
  show('view-app');
  renderSnippet();
  renderPlan();
  if (localStorage.getItem('kode-linking') === '1') {
    localStorage.removeItem('kode-linking');
    await syncVendor(); // returning from the account-linking page — pick up new connections
    return;
  }
  await loadConnections();
  loadQueue();
}
db.auth.onAuthStateChange(() => route());

function renderWho(){
  $('who').innerHTML = me
    ? `<span>@<b>${myProfile ? escapeHtml(myProfile.handle) : '…'}</b></span><button class="linkbtn" data-click="signOut">Sign out</button>`
    : '';
}
async function signOut(){ await db.auth.signOut(); }

/* ---------- auth ---------- */
$('tab-in').onclick = () => setMode(false);
$('tab-up').onclick = () => setMode(true);
function setMode(up){
  signupMode = up;
  $('tab-in').classList.toggle('on', !up);
  $('tab-up').classList.toggle('on', up);
  $('auth-btn').textContent = up ? 'Create free account' : 'Sign in';
  $('password').autocomplete = up ? 'new-password' : 'current-password';
}
$('auth-form').onsubmit = async e => {
  e.preventDefault();
  const btn = $('auth-btn'); btn.disabled = true;
  const email = $('email').value.trim(), password = $('password').value;
  try {
    if (signupMode) {
      const { data, error } = await db.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.session) { flash($('auth-msg'), 'Almost there — check your email for a confirmation link, then sign in.', true); return; }
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) { flash($('auth-msg'), err.message || 'Something went wrong.', false); }
  finally { btn.disabled = false; }
};

/* ---------- handle ---------- */
$('handle-form').onsubmit = async e => {
  e.preventDefault();
  const handle = $('handle').value.trim().toLowerCase();
  const display_name = $('display_name').value.trim() || handle;
  const { error } = await db.from('profiles').insert({ id: me.id, handle, display_name });
  if (error) {
    flash($('handle-msg'), error.code === '23505' ? 'That handle is taken — try another.' : error.message, false);
    return;
  }
  route();
};

/* ---------- plan / billing ---------- */
const PAYMENT_LINK = 'https://buy.stripe.com/dRm8wP3Sd7LI68t3xH14401';
function renderPlan(){
  const pro = myProfile.plan === 'pro';
  $('plan-status').innerHTML = pro
    ? '⚡ <b>KODE Pro</b> — hands-off auto-posting unlocked on every platform.'
    : '<b>Free plan</b> — LinkedIn &amp; X auto-post free once connected; other platforms use reminder posting. Upgrade to unlock hands-off auto-posting everywhere.';
  $('upgrade-btn').style.display = pro ? 'none' : 'inline-block';
  $('plan-note').style.display = pro ? 'none' : 'block';
  if (!pro) {
    $('upgrade-btn').href = `${PAYMENT_LINK}?client_reference_id=${me.id}&prefilled_email=${encodeURIComponent(me.email || '')}`;
  }
}

/* ---------- connected accounts ---------- */
const PROVIDERS = [
  { key:'instagram', label:'Instagram', icon:'📸', live:true },
  { key:'tiktok',    label:'TikTok',    icon:'🎵', live:true },
  { key:'linkedin',  label:'LinkedIn',  icon:'💼', live:true },
  { key:'x',         label:'X (Twitter)', icon:'✖️', live:true },
  { key:'facebook',  label:'Facebook',  icon:'👥', live:true },
  { key:'pinterest', label:'Pinterest', icon:'📌', live:true },
  { key:'youtube',   label:'YouTube',   icon:'▶️', live:true }
];
const OPEN_LINK = {
  instagram:'https://www.instagram.com/', tiktok:'https://www.tiktok.com/upload',
  linkedin:'https://www.linkedin.com/feed/?shareActive=true', facebook:'https://www.facebook.com/',
  pinterest:'https://www.pinterest.com/pin-builder/', x:'https://x.com/intent/post',
  youtube:'https://studio.youtube.com/'
};
let connected = {}; // platform -> account_name

async function loadConnections(){
  const { data } = await db.from('connected_accounts').select('platform,account_name');
  connected = Object.fromEntries((data || []).map(r => [r.platform, r.account_name || 'connected']));
  $('connections').innerHTML = `<div style="text-align:right;margin-bottom:8px"><button class="linkbtn" type="button" data-click="syncVendor">↻ Refresh connections</button></div>` + PROVIDERS.map(p => `
    <div class="conn">
      <div class="cico">${p.icon}</div>
      <div class="cbody">
        <div class="cname">${p.label}</div>
        <div class="cstate ${connected[p.key] ? 'live' : ''}">${
          connected[p.key] ? '✓ ' + escapeHtml(connected[p.key]) + ' · auto-post on'
          : p.live ? 'Not connected — posts stay manual' : 'Platform approval in progress'
        }</div>
      </div>
      ${connected[p.key]
        ? `<button class="off" data-click="disconnectSocial" data-a="${escapeHtml(JSON.stringify([p.key]))}">Disconnect</button>`
        : p.live ? `<button data-click="connectSocial" data-a="${escapeHtml(JSON.stringify([p.key]))}">Connect</button>`
        : `<span class="soon">Soon</span>`}
    </div>`).join('');
}

async function connectSocial(platform){
  const { data: { session } } = await db.auth.getSession();
  if (!session) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/kode-oauth-start?platform=${platform}`, {
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_KEY }
    });
    const j = await r.json();
    if (j.url) {
      if (j.vendor === 'ayrshare') localStorage.setItem('kode-linking', '1');
      location.href = j.url;
      return;
    }
    flash($('conn-msg'), j.error || 'Could not start the connection.', false);
  } catch (e) {
    flash($('conn-msg'), 'Could not reach the connection service — try again in a minute.', false);
  }
}

/* After linking on the aggregator's hosted page, sync which platforms got connected */
async function syncVendor(){
  const { data: { session } } = await db.auth.getSession();
  if (!session) return;
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/kode-ayrshare-sync`, {
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_KEY }
    });
  } catch (e) { /* non-fatal */ }
  await loadConnections();
  loadQueue();
}

async function disconnectSocial(platform){
  await db.from('social_accounts').delete().eq('platform', platform).eq('user_id', me.id);
  await loadConnections();
  loadQueue();
}

/* ---------- posts ---------- */
/* Media file uploads (free core): file -> post-media bucket (per-user folder, 25MB cap) -> public URL fills the field. */
$('media_file').onchange = async () => {
  const f = $('media_file').files[0]; if (!f) return;
  const msg = $('media_file_msg');
  if (f.size > 25 * 1024 * 1024) { msg.textContent = 'Too big — 25MB max.'; msg.style.color = '#d64b6b'; return; }
  msg.style.color = ''; msg.textContent = 'Uploading…';
  const path = `${me.id}/${Date.now()}-${f.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-')}`;
  const { error } = await db.storage.from('post-media').upload(path, f, { contentType: f.type, upsert: false });
  if (error) { msg.textContent = 'Upload failed: ' + error.message; msg.style.color = '#d64b6b'; return; }
  const { data } = db.storage.from('post-media').getPublicUrl(path);
  $('media_url').value = data.publicUrl;
  msg.textContent = 'Uploaded ✓ (URL filled in)'; msg.style.color = 'var(--blue,#2ee6ff)';
};

$('post-form').onsubmit = async e => {
  e.preventDefault();
  const btn = $('post-btn'); btn.disabled = true;
  const scheduled_at = new Date($('when').value).toISOString(); // local time -> UTC, tz-correct
  const { error } = await db.from('posts').insert({
    user_id: me.id,
    platform: $('platform').value,
    caption: $('caption').value.trim(),
    media_url: $('media_url').value.trim() || null,
    scheduled_at,
    is_public: $('is_public').checked
  });
  btn.disabled = false;
  if (error) { flash($('post-msg'), error.message, false); return; }
  $('caption').value = ''; $('media_url').value = '';
  $('media_file').value = ''; $('media_file_msg').textContent = 'or paste a URL above · max 25MB'; $('media_file_msg').style.color = '';
  flash($('post-msg'), 'Queued ✓', true);
  setTimeout(() => $('post-msg').className = 'msg', 1600);
  loadQueue();
};

/* media preview: image -> thumbnail; video/unknown -> 🎬 chip; broken URLs hide themselves */
function mediaThumb(p){
  if (!p.media_url || !/^https?:\/\/[^\s"'<>]+$/.test(p.media_url)) return '';
  const u = escapeHtml(p.media_url);
  if (/\.(mp4|mov|webm)(\?|$)/i.test(p.media_url)) return `<a class="pthumb vid" href="${u}" target="_blank" rel="noopener noreferrer" title="Open video">🎬</a>`;
  return `<a href="${u}" target="_blank" rel="noopener noreferrer" title="Open media"><img class="pthumb" src="${u}" alt="" loading="lazy" data-fb="hide-parent"></a>`;
}

async function loadQueue(){
  const { data: allPosts, error } = await db.from('posts')
    .select('*').eq('user_id', me.id)
    .order('scheduled_at', { ascending: true }).limit(200);
  const q = $('queue');
  if (error) { q.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`; return; }

  renderReady(allPosts.filter(p => p.status === 'ready'));
  const posts = allPosts.filter(p => p.status !== 'ready');
  if (!posts.length) { q.innerHTML = '<div class="empty">Nothing queued yet — schedule your first post above.</div>'; return; }

  const groups = {};
  for (const p of posts) {
    const d = new Date(p.scheduled_at);
    const key = d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric' });
    (groups[key] = groups[key] || []).push(p);
  }
  q.innerHTML = Object.entries(groups).map(([day, list]) => `
    <div class="day-group">
      <div class="day-label">${day}</div>
      ${list.map(p => `
        <div class="post">
          <div class="pico">${PLATFORM_ICON[p.platform] || '📄'}</div>
          ${mediaThumb(p)}
          <div class="pbody">
            <div class="pcap">${escapeHtml(p.caption)}</div>
            <div class="pmeta">
              ${new Date(p.scheduled_at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}
              · <span class="st ${p.status}">${p.status}</span>
              ${p.is_public ? '· on embed' : '· private'}
              ${p.status === 'queued' ? (connected[p.platform] ? ' · ⚡ auto-posts' : ' · manual') : ''}
            </div>
            ${p.status === 'failed' && p.error ? `<div class="perr">${escapeHtml(p.error)}</div>` : ''}
          </div>
          <div class="acts">
            ${p.status === 'queued' && !connected[p.platform] ? `<button data-click="markPublished" data-a="${escapeHtml(JSON.stringify([p.id]))}">✓ published</button>` : ''}
            ${p.status === 'failed' ? `<button data-click="retryPost" data-a="${escapeHtml(JSON.stringify([p.id]))}">↻ retry</button>` : ''}
            <button class="del" data-click="delPost" data-a="${escapeHtml(JSON.stringify([p.id]))}">delete</button>
          </div>
        </div>`).join('')}
    </div>`).join('');
}
/* ---------- reminder posting (\"ready\") ---------- */
function renderReady(list){
  const card = $('ready-card');
  if (!list.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  $('alerts-btn').style.display =
    ('Notification' in window && Notification.permission === 'default') ? 'inline' : 'none';
  $('ready-list').innerHTML = list.map(p => `
    <div class="post" style="background:#fff">
      <div class="pico">${PLATFORM_ICON[p.platform] || '📄'}</div>
      ${mediaThumb(p)}
      <div class="pbody">
        <div class="pcap">${escapeHtml(p.caption)}</div>
        <div class="pmeta">was due ${new Date(p.scheduled_at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</div>
      </div>
      <div class="acts">
        ${p.media_url && /^https?:\/\/[^\s"'<>]+$/.test(p.media_url) ? `<button data-url="${escapeHtml(p.media_url)}" data-click="kodeOpenMedia" data-a="[&quot;$el&quot;]">🖼 media</button>` : ''}
        <button data-click="copyCaption" data-a="${escapeHtml(JSON.stringify([p.id]))}" id="copy-${p.id}">⧉ copy caption</button>
        <button data-click="kodeOpenPlatform" data-a="${escapeHtml(JSON.stringify([p.platform]))}">↗ open ${p.platform}</button>
        <button data-click="markPublished" data-a="${escapeHtml(JSON.stringify([p.id]))}">✓ posted</button>
        <button class="del" data-click="delPost" data-a="${escapeHtml(JSON.stringify([p.id]))}">delete</button>
      </div>
    </div>`).join('');
  notifyReady(list);
}
let readyCache = {};
async function copyCaption(id){
  const { data } = await db.from('posts').select('caption').eq('id', id).single();
  if (data) {
    await navigator.clipboard.writeText(data.caption);
    const b = $('copy-' + id); if (b) { b.textContent = '✓ copied'; setTimeout(() => b.textContent = '⧉ copy caption', 1500); }
  }
}
function notifyReady(list){
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const seen = new Set(JSON.parse(localStorage.getItem('kode-notified') || '[]'));
  for (const p of list) {
    if (seen.has(p.id)) continue;
    new Notification('KODE — time to post', {
      body: `${p.platform}: ${p.caption.slice(0, 80)}`,
      icon: 'icon.svg', tag: p.id
    });
    seen.add(p.id);
  }
  localStorage.setItem('kode-notified', JSON.stringify([...seen].slice(-100)));
}
/* web push: alerts even when the app is closed */
const VAPID_PUBLIC = 'BDP214LWnUH_SQEMeypiGYZSOcpkza4ECY43LVgHNnTGO82XMq1NvzSgHB_lO51st2t_aHUvq3hkRNhn0w5LJso';
function urlB64ToU8(s){
  const pad = '='.repeat((4 - s.length % 4) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function subscribePush(){
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !me) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToU8(VAPID_PUBLIC) });
    const j = sub.toJSON();
    await db.from('push_subscriptions').upsert({ endpoint: sub.endpoint, user_id: me.id, p256dh: j.keys.p256dh, auth: j.keys.auth });
  } catch (e) { /* push unsupported/blocked — in-app alerts still work */ }
}
$('alerts-btn').onclick = async () => {
  await Notification.requestPermission();
  if (Notification.permission === 'granted') await subscribePush();
  $('alerts-btn').style.display = Notification.permission === 'default' ? 'inline' : 'none';
};
/* keep the device subscribed if permission was granted earlier */
if ('Notification' in window && Notification.permission === 'granted') {
  setTimeout(() => subscribePush(), 3000);
}
/* poll for newly-ready posts while the app is open */
setInterval(() => { if (me && myProfile && $('view-app').classList.contains('on')) loadQueue(); }, 60000);

async function delPost(id){ await db.from('posts').delete().eq('id', id); loadQueue(); }
async function markPublished(id){ await db.from('posts').update({ status:'published' }).eq('id', id); loadQueue(); }
async function retryPost(id){ await db.from('posts').update({ status:'queued', error:null }).eq('id', id); loadQueue(); }
function escapeHtml(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

/* ---------- embed snippet ---------- */
function renderSnippet(){
  const base = location.origin === 'null' || location.protocol === 'file:'
    ? 'https://YOUR-DOMAIN.com/' : location.href.replace(/app\.html.*$/, '');
  $('snippet').textContent = `<script src="${base}embed.js" data-profile="${myProfile.handle}" data-height="480"><\/script>`;
}
$('copy-btn').onclick = async () => {
  await navigator.clipboard.writeText($('snippet').textContent);
  $('copy-btn').textContent = 'Copied ✓';
  setTimeout(() => $('copy-btn').textContent = 'Copy snippet', 1500);
};

/* ---------- default schedule time: next hour ---------- */
(function(){
  const d = new Date(Date.now() + 60*60*1000); d.setMinutes(0,0,0);
  const pad = n => String(n).padStart(2,'0');
  $('when').value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
})();

route();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
/* Delegated actions (assets/js/kil-actions.js): the markup carries data-click instead of inline handlers; only the names listed in KilActions.allow() can run. */
function kodeOpenMedia(el){ window.open(el.dataset.url,'_blank','noopener,noreferrer'); }
function kodeOpenPlatform(platform){ if(Object.prototype.hasOwnProperty.call(OPEN_LINK,platform)) window.open(OPEN_LINK[platform],'_blank','noopener,noreferrer'); }
window.signOut = signOut; window.delPost = delPost; window.markPublished = markPublished;
window.retryPost = retryPost; window.connectSocial = connectSocial; window.disconnectSocial = disconnectSocial;
window.syncVendor = syncVendor; window.copyCaption = copyCaption; window.OPEN_LINK = OPEN_LINK;
if (window.KilActions) KilActions.allow(["connectSocial", "copyCaption", "delPost", "disconnectSocial", "kodeOpenMedia", "kodeOpenPlatform", "markPublished", "retryPost", "signOut", "syncVendor"]);
