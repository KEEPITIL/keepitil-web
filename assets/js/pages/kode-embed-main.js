/* KEEPITIL kode/embed.html: inline script "main" moved verbatim to an external file (CSP: no executable inline script). */
const SUPABASE_URL = 'https://xdoxfoectugsbbujjezq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_F1oMr-STZ3HH3Z_Wu4CYCg_oDwhLKnm';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const ICON = {instagram:'📸',tiktok:'🎵',linkedin:'💼',facebook:'👥',pinterest:'📌',x:'✖️',youtube:'▶️'};

const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
/* strict URL gate: this widget renders on third-party sites — never allow attribute breakout */
const thumb = p => {
  const u = p.media_url;
  if (!u || !/^https:\/\/[^\s"'<>]+$/.test(u)) return '';
  if (/\.(mp4|mov|webm)(\?|$)/i.test(u)) return '<span class="pthumb vid">🎬</span>';
  return `<img class="pthumb" src="${u}" alt="" loading="lazy" data-fb="hide">`;
};

(async () => {
  const handle = new URLSearchParams(location.search).get('profile');
  const list = document.getElementById('list');
  if (!handle) { list.innerHTML = '<div class="empty">No profile specified.</div>'; return; }

  const { data: prof } = await db.from('profiles').select('id,handle,display_name').eq('handle', handle).maybeSingle();
  if (!prof) {
    document.getElementById('title').textContent = '@' + handle;
    list.innerHTML = '<div class="empty">Profile not found.</div>';
    return;
  }
  document.getElementById('title').textContent = prof.display_name || '@' + prof.handle;
  document.getElementById('subtitle').textContent = '@' + prof.handle + ' · upcoming posts';

  const { data: posts, error } = await db.from('posts')
    .select('platform,caption,scheduled_at,media_url')
    .eq('user_id', prof.id).eq('is_public', true).eq('status', 'queued')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true }).limit(30);

  if (error || !posts || !posts.length) {
    list.innerHTML = '<div class="empty">Nothing scheduled right now — check back soon.</div>';
    return;
  }
  const groups = {};
  for (const p of posts) {
    const key = new Date(p.scheduled_at).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
    (groups[key] = groups[key] || []).push(p);
  }
  list.innerHTML = Object.entries(groups).map(([day, ps]) => `
    <div class="day-label">${day}</div>
    ${ps.map(p => `
      <div class="post">
        <div class="pico">${ICON[p.platform] || '📄'}</div>
        ${thumb(p)}
        <div>
          <div class="pcap">${esc(p.caption)}</div>
          <div class="pmeta"><em>${p.platform}</em> · ${new Date(p.scheduled_at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</div>
        </div>
      </div>`).join('')}`).join('');
})();
