import { ALL, URL_CASES } from './payloads.mjs';

export const UID = '11111111-1111-4111-8111-111111111111';
export const SLUG = 'leo';
const NOW = '2026-11-07T08:00:00.000Z';

function uuid(n) {
  return '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
}

export function buildWorld() {
  const content = [];
  const collabs = [];
  const events = [];
  const chats = [];
  const saves = [];
  const comments = [];
  const connectProfiles = [];
  const articles = [];
  let n = 1;

  function pushArticle(id, data) {
    const row = {
      id: uuid(n++),
      profile_slug: SLUG,
      kind: 'article',
      data,
      created_by: UID,
      created_at: NOW,
      archived: false
    };
    content.push(row);
    return row;
  }

  for (const p of ALL) {
    pushArticle(p.id, {
      t: 'KEEP-' + p.id,
      d: 'Post',
      html: p.body,
      img: 'https://keepitil.com/icon-192.png',
      mtype: 'image',
      probe: p.id
    });
    pushArticle(p.id + '-desc', {
      t: 'KEEP-' + p.id + '-desc',
      d: 'Post',
      desc: p.body + '\nline two',
      html: p.body,
      img: 'javascript:alert(1)',
      tags: ['<b>x'],
      collab: ['"><svg onload=alert(1)>'],
      location: '<i>LA',
      mtype: 'image',
      probe: p.id
    });
    content.push({
      id: uuid(n++),
      profile_slug: SLUG,
      kind: 'show',
      data: {
        month: 'DEC', day: '1', dow: 'TUE', title: 'KEEP-' + p.id + '-show',
        venue: 'Hall', tags: 'House', cover: p.body, tix: 'javascript:alert(1)', kind: 'kil', probe: p.id
      },
      created_by: UID, created_at: NOW, archived: false
    });
    content.push({
      id: uuid(n++),
      profile_slug: SLUG,
      kind: 'chat',
      data: {
        slug: p.body, name: p.body, preview: 'KEEP-' + p.id + '-chat',
        avatar: 'https://keepitil.com/icon-192.png', category: 'primary', probe: p.id
      },
      created_by: UID, created_at: NOW, archived: false
    });
    events.push({
      id: uuid(n++), title: 'KEEP-' + p.id + '-event', slug: 'ev-' + p.id,
      starts_at: NOW, venue: 'Hall', city: 'LA', cover_url: p.body,
      status: 'published', genres: 'House', ticket_url: p.body, is_external: false
    });
    chats.push({
      id: uuid(n++), title: 'KEEP-' + p.id + '-room', slug: p.body,
      starts_at: NOW, cover_url: p.body
    });
    const savedId = uuid(n++);
    saves.push({
      user_id: UID,
      content_id: savedId,
      collection_id: 1,
      created_at: NOW,
      profile_content: {
        id: savedId,
        kind: 'article',
        profile_slug: SLUG,
        data: { title: p.body, text: p.body, img: p.body, probe: p.id }
      }
    });
    comments.push({
      id: uuid(n++),
      user_id: UID,
      author_handle: p.body,
      target_type: 'blog',
      target_id: 'groove-trooper',
      body: p.body,
      created_at: NOW
    });
    collabs.push({
      id: uuid(n++),
      source_slug: SLUG,
      collaborator_slug: SLUG,
      title: 'KEEP-' + p.id + '-collab',
      status: 'accepted',
      created_by: UID,
      created_at: NOW,
      payload: {
        t: 'KEEP-' + p.id + '-collab',
        d: 'Collab',
        html: p.body,
        desc: p.id.endsWith('skip') ? undefined : undefined,
        img: 'javascript:alert(1)',
        mtype: 'image'
      }
    });
    collabs.push({
      id: uuid(n++),
      source_slug: SLUG,
      collaborator_slug: SLUG,
      title: 'KEEP-' + p.id + '-collab-desc',
      status: 'accepted',
      created_by: UID,
      created_at: NOW,
      payload: {
        t: 'KEEP-' + p.id + '-collab-desc',
        desc: p.body + '\nline two',
        html: p.body,
        img: 'https://keepitil.com/icon-192.png',
        mtype: 'image',
        tags: ['<b>x'],
        location: '<i>LA'
      }
    });
    connectProfiles.push({
      slug: 'card-' + p.id,
      display_name: p.body,
      account_type: 'brand',
      location: p.body,
      cover_url: p.body,
      avatar_url: p.body,
      status: 'published'
    });
    articles.push({
      slug: 'art-' + p.id,
      title: 'KEEP-' + p.id + '-article',
      excerpt: 'KEEP-' + p.id,
      image_url: 'https://keepitil.com/icon-192.png',
      hero_image: 'https://keepitil.com/icon-192.png',
      url: '/article/art-' + p.id + '/',
      published_at: NOW,
      created_at: NOW,
      body_html: p.body,
      content: p.body,
      category: 'feature',
      author: 'KEEPITIL',
      artist_slug: null,
      artist_name: p.body,
      artist_avatar: p.body,
      artist_city: p.body,
      artist_genre: 'House',
      status: 'published',
      published: true
    });
  }

  for (const u of URL_CASES) {
    pushArticle(u.id, {
      t: 'KEEP-' + u.id,
      d: 'Post',
      desc: 'url probe',
      url: u.body,
      html: '<img src=x onerror=alert(1)>',
      img: 'https://keepitil.com/icon-192.png',
      probe: u.id
    });
  }

  return { content, collabs, events, chats, saves, comments, connectProfiles, articles };
}

const WORLD = buildWorld();

export function benignMeta() {
  return {
    slug: SLUG,
    display_name: 'Leo Rivera',
    handle: SLUG,
    location: 'Los Angeles',
    bio: 'KEEP-legit plays house.',
    tagline: 'KEEP-legit',
    pronouns: '',
    avatar_url: 'https://keepitil.com/icon-192.png',
    cover_url: 'https://keepitil.com/icon-192.png',
    cover_mobile_url: '',
    book_email: '',
    socials: { instagram: 'https://instagram.com/leo', soundcloud: 'https://soundcloud.com/leo' },
    links: ['https://keepitil.com/'],
    highlights: [],
    account_type: 'artist',
    status: 'published',
    badges: []
  };
}

export function metaFor(payload) {
  const base = benignMeta();
  if (!payload) return base;
  return Object.assign(base, {
    display_name: payload.body,
    bio: payload.body,
    location: payload.body,
    socials: { instagram: payload.body, soundcloud: payload.body, website: payload.body },
    links: [payload.body],
    avatar_url: payload.body,
    cover_url: payload.body
  });
}

function wantsObject(req) {
  const accept = req.headers().accept || req.headers()['Accept'] || '';
  return accept.includes('application/vnd.pgrst.object');
}

function tableOf(url) {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  const i = parts.indexOf('v1');
  return i >= 0 ? parts[i + 1] : parts[parts.length - 1];
}

export function stubResponse(request, mode) {
  const url = request.url();
  const method = request.method();
  if (method === 'OPTIONS') {
    return { status: 204, headers: cors(), body: '' };
  }
  const u = new URL(url);
  if (u.pathname.startsWith('/auth/v1/')) {
    const user = benignMeta() && {
      id: UID, aud: 'authenticated', role: 'authenticated',
      email: 'leo.rivera@example.com',
      user_metadata: { handle: SLUG, name: 'Leo Rivera' }
    };
    if (u.pathname.includes('/user')) return json(user);
    return json({ access_token: 'stub', token_type: 'bearer', expires_in: 3600, user });
  }
  if (u.pathname.includes('/rpc/')) {
    const name = u.pathname.split('/').pop();
    return json(rpc(name, mode));
  }
  const table = tableOf(url);
  const object = wantsObject(request);
  if (method !== 'GET' && method !== 'HEAD') return json(object ? {} : []);
  return json(selectTable(table, u, object, mode));
}

function rpc(name, mode) {
  if (name === 'get_profile_events' || name === 'get_my_tickets') return mode === 'meta' ? [] : WORLD.events;
  if (name === 'my_ticketed_event_chats') return mode === 'meta' ? [] : WORLD.chats;
  if (name === 'get_culture_feed') return cultureRows();
  if (name === 'my_profile_slug') return SLUG;
  if (name === 'get_profile_insights') return { profile_views_total: 1, top_posts: [{ title: 'KEEP-legit', likes: 0, comments: 0 }] };
  if (name === 'log_view') return null;
  return [];
}

function cultureRows() {
  const rows = [];
  for (const p of ALL) {
    rows.push({
      id: 'cul-' + p.id,
      kind: 'post',
      profile_slug: SLUG,
      author_name: 'Leo Rivera',
      author_avatar: 'https://keepitil.com/icon-192.png',
      created_at: NOW,
      title: 'KEEP-' + p.id,
      data: { t: 'KEEP-' + p.id, html: p.body, img: 'https://keepitil.com/icon-192.png', mtype: 'image' },
      media: [{ src: 'https://keepitil.com/icon-192.png', mtype: 'image' }]
    });
    rows.push({
      id: 'cul-art-' + p.id,
      kind: 'article',
      profile_slug: SLUG,
      author_name: 'KEEPITIL',
      author_avatar: 'https://keepitil.com/icon-192.png',
      created_at: NOW,
      title: 'KEEP-' + p.id + '-feed-article',
      data: {
        t: 'KEEP-' + p.id + '-feed-article',
        body: p.body,
        html: p.body,
        caption: p.body,
        img: 'https://keepitil.com/icon-192.png',
        cover: 'https://keepitil.com/icon-192.png',
        source_url: ''
      }
    });
  }
  return rows;
}

function selectTable(table, url, object, mode) {
  const meta = mode.metaPayload ? metaFor(mode.metaPayload) : benignMeta();
  if (table === 'profile_meta') {
    if (url.search.includes('account_type=in')) return WORLD.connectProfiles;
    return object ? meta : [meta];
  }
  if (table === 'profile_owners') {
    const row = { profile_slug: SLUG, owner_id: UID };
    return object ? row : [row];
  }
  if (table === 'profile_content') {
    if (url.search.includes('kind=eq.profile_categories')) return object ? null : [];
    if (mode.metaPayload) return object ? null : [];
    return WORLD.content;
  }
  if (table === 'post_collaborators') return mode.metaPayload ? [] : WORLD.collabs;
  if (table === 'blog_articles') {
    if (url.search.includes('artist_slug=eq.')) return WORLD.articles.filter((a) => a.artist_slug === SLUG);
    return WORLD.articles;
  }
  if (table === 'venues') return [];
  if (table === 'collections') return [{ id: 1, name: 'Saved', user_id: UID, created_at: NOW }];
  if (table === 'post_saves') return mode.metaPayload ? [] : WORLD.saves;
  if (table === 'comments' || table === 'post_comments') return WORLD.comments;
  if (table === 'follows' || table === 'post_likes' || table === 'post_reshares') return [];
  if (table === 'videos') return [];
  if (table === 'platform_config') return [];
  return object ? null : [];
}

function cors() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'content-type': 'application/json'
  };
}

function json(data) {
  return { status: 200, headers: cors(), body: JSON.stringify(data) };
}
