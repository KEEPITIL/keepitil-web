/* KEEPITIL organizers/dashboard.html: inline script "main" moved verbatim to an external file (CSP: no executable inline script). */
// ─── SUPABASE CONFIG ────────────────────────────────────────────────────────
// Replace these with your actual Supabase project URL and anon key
const SUPABASE_URL = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let organizerProfile = null;

// ─── INIT ────────────────────────────────────────────────────────────────────
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    showDashboard();
  } else {
    document.getElementById('auth-screen').style.display = 'flex';
  }
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') { currentUser = session.user; showDashboard(); }
    if (event === 'SIGNED_OUT') { currentUser = null; location.reload(); }
  });
})();

// ─── AUTH ────────────────────────────────────────────────────────────────────
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t,i) => t.classList.toggle('active', (tab==='login'?i===0:i===1)));
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('signup-form').style.display = tab === 'signup' ? 'block' : 'none';
  document.getElementById('reset-form').style.display = 'none';
  clearMsg();
}
function showReset() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('reset-form').style.display = 'block';
}
function showLogin() {
  document.getElementById('reset-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'block';
}
function showMsg(msg, type='error') {
  const el = document.getElementById('auth-msg');
  el.textContent = msg; el.className = 'auth-msg ' + type;
}
function clearMsg() { document.getElementById('auth-msg').className = 'auth-msg'; }

async function doLogin() {
  const email = document.getElementById('login-email').value;
  const pass = document.getElementById('login-pass').value;
  if (!email || !pass) return showMsg('Please fill in all fields.');
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) showMsg(error.message);
}
async function doSignup() {
  const email = document.getElementById('signup-email').value;
  const pass = document.getElementById('signup-pass').value;
  if (!document.getElementById('terms-check').checked) return showMsg('Please confirm you are applying as an event organizer.');
  if (!email || !pass) return showMsg('Please fill in all fields.');
  if (pass.length < 8) return showMsg('Password must be at least 8 characters.');
  const { error } = await sb.auth.signUp({ email, password: pass });
  if (error) showMsg(error.message);
  else showMsg('Check your email to confirm your account, then log in.', 'success');
}
async function doReset() {
  const email = document.getElementById('reset-email').value;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
  if (error) showMsg(error.message);
  else showMsg('Password reset link sent to your email.', 'success');
}
async function doLogout() { await sb.auth.signOut(); }

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
async function showDashboard() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('dashboard-screen').style.display = 'block';
  document.getElementById('top-user-email').textContent = currentUser.email;
  await loadProfile();
  await loadOverview();
}

async function loadProfile() {
  const { data } = await sb.from('organizer_profiles').select('*').eq('user_id', currentUser.id).single();
  organizerProfile = data;
  if (data) {
    document.getElementById('p-name').value = data.org_name || '';
    document.getElementById('p-bio').value = data.bio || '';
    document.getElementById('p-logo').value = data.logo_url || '';
    document.getElementById('p-ig').value = data.instagram || '';
    document.getElementById('p-sc').value = data.soundcloud || '';
    document.getElementById('p-sp').value = data.spotify || '';
    document.getElementById('p-web').value = data.website || '';
    document.getElementById('p-email').value = data.contact_email || '';
    document.getElementById('p-phone').value = data.contact_phone || '';
    if (!data.org_name || !data.contact_email) document.getElementById('profile-banner').style.display = 'block';
  } else {
    document.getElementById('profile-banner').style.display = 'block';
  }
}

async function loadOverview() {
  const profile = organizerProfile;
  const statusEl = document.getElementById('account-status-display');
  if (!profile) {
    document.getElementById('overview-welcome').textContent = 'Welcome! Complete your profile to get started.';
    statusEl.innerHTML = '<span class="badge badge-pending">Profile Incomplete</span> — Fill out your profile before submitting events.';
  } else {
    document.getElementById('overview-welcome').textContent = `Welcome back, ${profile.org_name || 'Organizer'}.`;
    const statusMap = { pending:'<span class="badge badge-pending">Under Review</span> — Your account is being reviewed. You\'ll receive an email within 48 hours.', approved:'<span class="badge badge-approved">Approved</span> — You can submit events and receive the full marketing package.', suspended:'<span class="badge badge-rejected">Suspended</span> — Contact keepitil for more info.' };
    statusEl.innerHTML = statusMap[profile.status] || statusMap.pending;
  }

  if (!profile) return;
  const { data: events } = await sb.from('submitted_events').select('id,status').eq('organizer_id', profile.id);
  if (events) {
    document.getElementById('stat-total').textContent = events.length;
    document.getElementById('stat-live').textContent = events.filter(e=>e.status==='live').length;
    document.getElementById('stat-pending').textContent = events.filter(e=>e.status==='pending').length;
    const { data: mkt } = await sb.from('marketing_status').select('posh_blast').in('event_id', events.map(e=>e.id));
    document.getElementById('stat-blasted').textContent = mkt ? mkt.filter(m=>m.posh_blast).length : 0;

    const recentEl = document.getElementById('recent-events-list');
    if (events.length === 0) { recentEl.innerHTML = '<p style="color:var(--grey);font-size:.85rem;">No events yet. <a href="#" data-click="showTab" data-a="[&quot;submit&quot;]" style="color:var(--blue);">Submit your first event →</a></p>'; return; }
    const { data: fullEvents } = await sb.from('submitted_events').select('*').eq('organizer_id', profile.id).order('created_at', {ascending:false}).limit(3);
    recentEl.innerHTML = fullEvents.map(ev => eventCardHTML(ev)).join('');
  }
}

// ─── EVENTS ──────────────────────────────────────────────────────────────────
function escHtml(s){ return (window.KilSafeHtml ? KilSafeHtml.esc(s) : String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; })); }
function eventCardHTML(ev) {
  const statusClass = {pending:'badge-pending',approved:'badge-approved',live:'badge-live',rejected:'badge-rejected'};
  return `<div class="event-card">
    <div>
      <div class="event-name">${escHtml(ev.event_name)}</div>
      <div class="event-meta">${escHtml(ev.event_date)} · ${escHtml(ev.venue_name || '')} · ${escHtml(ev.city || '')}</div>
    </div>
    <div class="event-actions">
      <span class="badge ${statusClass[ev.status]||'badge-pending'}">${escHtml(ev.status)}</span>
    </div>
  </div>`;
}

async function loadEvents() {
  if (!organizerProfile) return;
  const { data } = await sb.from('submitted_events').select('*').eq('organizer_id', organizerProfile.id).order('event_date', {ascending:true});
  const el = document.getElementById('events-list');
  if (!data || data.length === 0) { el.innerHTML = '<p style="color:var(--grey);font-size:.85rem;">No events submitted yet.</p>'; return; }
  el.innerHTML = data.map(ev => eventCardHTML(ev)).join('');
}

async function loadMarketing() {
  if (!organizerProfile) return;
  const { data: events } = await sb.from('submitted_events').select('id,event_name,event_date').eq('organizer_id', organizerProfile.id).in('status', ['approved','live']);
  const el = document.getElementById('marketing-list');
  if (!events || events.length === 0) { el.innerHTML = '<p style="color:var(--grey);font-size:.85rem;">No approved events yet. Marketing campaigns activate after your event is approved.</p>'; return; }
  const { data: mktData } = await sb.from('marketing_status').select('*').in('event_id', events.map(e=>e.id));
  const mktMap = {};
  if (mktData) mktData.forEach(m => mktMap[m.event_id] = m);

  el.innerHTML = events.map(ev => {
    const m = mktMap[ev.id] || {};
    const channels = [
      {icon:'📲', label:'Posh Blast', done: m.posh_blast, date: m.posh_blast_at, reach: m.posh_followers_reached ? `${m.posh_followers_reached} reached` : ''},
      {icon:'📧', label:'EB Email', done: m.email_campaign, date: m.email_campaign_at, reach: m.emails_sent ? `${m.emails_sent} sent` : ''},
      {icon:'📸', label:'IG Collab', done: m.ig_collab, date: m.ig_collab_at, reach: (function(){ var u=window.KilSafeHtml&&KilSafeHtml.safeNavUrl(m.ig_post_url); return u ? '<a href="'+escHtml(u)+'" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">View post</a>' : ''; })()},
      {icon:'🗺', label:'Explore', done: m.explore_featured, date: m.explore_featured_at, reach: ''},
    ];
    return `<div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem;">
        <div class="card-title" style="margin:0;">${escHtml(ev.event_name)}</div>
        <span style="font-size:.8rem;color:var(--grey);">${escHtml(ev.event_date)}</span>
      </div>
      <div class="marketing-grid">
        ${channels.map(c=>`<div class="mkt-channel">
          <div class="mkt-icon">${c.icon}</div>
          <div class="mkt-label">${c.label}</div>
          <div class="mkt-status ${c.done?'mkt-done':'mkt-pending'}">${c.done?'✓ Done':'Pending'}</div>
          ${c.done && c.date ? `<div style="font-size:.7rem;color:var(--grey);margin-top:.2rem;">${new Date(c.date).toLocaleDateString()}</div>` : ''}
          ${c.reach ? `<div style="font-size:.7rem;margin-top:.2rem;">${c.reach}</div>` : ''}
        </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

// ─── SUBMIT EVENT ─────────────────────────────────────────────────────────────
function addTier() {
  const row = document.createElement('div');
  row.className = 'tier-row';
  row.innerHTML = '<input type="text" placeholder="Tier name" class="tier-name" style="flex:2;"/><input type="number" placeholder="Price $" class="tier-price" style="flex:1;"/><button class="tier-remove" data-click="removeTier" data-a="[&quot;$el&quot;]">×</button>';
  document.getElementById('tiers-container').appendChild(row);
}
function removeTier(btn) { btn.parentElement.remove(); }

async function submitEvent() {
  if (!organizerProfile || organizerProfile.status !== 'approved') {
    showAlert('submit-alert', 'Your organizer account must be approved before submitting events.', 'error'); return;
  }
  const name = document.getElementById('ev-name').value.trim();
  const date = document.getElementById('ev-date').value;
  const venue = document.getElementById('ev-venue').value.trim();
  const city = document.getElementById('ev-city').value.trim();
  if (!name || !date || !venue || !city) { showAlert('submit-alert', 'Please fill in all required fields (marked *).', 'error'); return; }

  const tiers = [...document.querySelectorAll('.tier-row')].map(r => ({
    name: r.querySelector('.tier-name').value,
    price: parseFloat(r.querySelector('.tier-price').value) || 0
  })).filter(t => t.name);

  const btn = document.getElementById('submit-btn');
  btn.disabled = true; btn.textContent = 'Submitting...';

  const { data, error } = await sb.from('submitted_events').insert({
    organizer_id: organizerProfile.id,
    event_name: name,
    event_date: date,
    start_time: document.getElementById('ev-start').value,
    end_time: document.getElementById('ev-end').value,
    venue_name: venue,
    address: document.getElementById('ev-address').value,
    city: city,
    county: document.getElementById('ev-county').value,
    genre: document.getElementById('ev-genre').value,
    description: document.getElementById('ev-desc').value,
    age_restriction: document.getElementById('ev-age').value,
    flyer_url: document.getElementById('ev-flyer').value,
    ticket_url: document.getElementById('ev-eb').value || document.getElementById('ev-posh').value,
    ticket_tiers: tiers,
    status: 'pending'
  }).select().single();

  btn.disabled = false; btn.textContent = 'Submit Event for Review';

  if (error) { showAlert('submit-alert', 'Error: ' + error.message, 'error'); return; }
  showAlert('submit-alert', '✓ Event submitted! We\'ll review within 48 hours.', 'success');
  // Clear form
  ['ev-name','ev-date','ev-venue','ev-address','ev-city','ev-desc','ev-eb','ev-posh','ev-flyer'].forEach(id => document.getElementById(id).value = '');
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────
async function saveProfile() {
  const name = document.getElementById('p-name').value.trim();
  const email = document.getElementById('p-email').value.trim();
  if (!name || !email) { showAlert('profile-alert', 'Organization name and contact email are required.', 'error'); return; }

  const payload = {
    user_id: currentUser.id,
    org_name: name,
    bio: document.getElementById('p-bio').value,
    logo_url: document.getElementById('p-logo').value,
    instagram: document.getElementById('p-ig').value,
    soundcloud: document.getElementById('p-sc').value,
    spotify: document.getElementById('p-sp').value,
    website: document.getElementById('p-web').value,
    contact_email: email,
    contact_phone: document.getElementById('p-phone').value,
    updated_at: new Date().toISOString()
  };

  const { error } = organizerProfile
    ? await sb.from('organizer_profiles').update(payload).eq('id', organizerProfile.id)
    : await sb.from('organizer_profiles').insert({...payload, status:'pending'});

  if (error) { showAlert('profile-alert', 'Error: ' + error.message, 'error'); return; }
  showAlert('profile-alert', '✓ Profile saved! Your account is pending review.', 'success');
  document.getElementById('profile-banner').style.display = 'none';
  await loadProfile();
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
/* Delegated actions (assets/js/kil-actions.js): the markup carries data-click instead of inline handlers; only the names listed here can run. */
if(window.KilActions) KilActions.allow(["addTier", "doLogin", "doLogout", "doReset", "doSignup", "removeTier", "saveProfile", "showLogin", "showReset", "showTab", "submitEvent", "switchAuthTab"]);
function showTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  if (tab === 'events') loadEvents();
  if (tab === 'marketing') loadMarketing();
  if (tab === 'overview') loadOverview();
}

// ─── UTIL ─────────────────────────────────────────────────────────────────────
function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 6000);
}
