/* Share links and link-preview tags for public profiles and events.
   UTMs are only utm_source=share, utm_medium=profile|event, and — for an event —
   utm_campaign=<event slug>. A profile share has no utm_campaign. No UTM carries
   a user id, handle, or email. The profile preview image is an image the public
   view already shows, or the 1200×630 KEEPITIL brand card. */
(function (root) {
  'use strict';

  var BRAND_CARD = 'https://keepitil.com/keepitil-og.png';
  var ORIGIN = 'https://keepitil.com';

  function safeHttps(u) {
    var s = String(u == null ? '' : u).trim();
    return /^https:\/\/[^\s<>"'\\]+$/i.test(s) ? s : '';
  }

  /** Event and profile slugs only. Rejects emails, user ids, and anything else. */
  function safeSlug(s) {
    var v = String(s == null ? '' : s).trim().toLowerCase();
    if (!/^[a-z0-9-]{1,80}$/.test(v)) return '';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)) return '';
    return v;
  }

  function shortText(text, fallback) {
    var s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!s) return fallback || '';
    if (s.length <= 160) return s;
    var cut = s.slice(0, 157);
    cut = cut.replace(/\s+\S*$/, '');
    return (cut || s.slice(0, 157)) + '\u2026';
  }

  function accountKind(meta) {
    var t = String(meta && meta.account_type || '').toLowerCase();
    if (t === 'member' || t === 'artist' || t === 'creator' || t === 'dj' || t === 'subscriber_profile') return 'person';
    if (t === 'brand' || t === 'venue' || t === 'organizer' || t === 'promoter' || t === 'company') return 'business';
    if (t === 'editorial_artist' || t === 'editorial_venue' || t === 'editorial_organizer' || t === 'editorial_brand') return 'house';
    return '';
  }

  /**
   * Same rule as private.profile_is_public. Null fails closed.
   * A person also needs age_verified. A business does not, but both minor
   * flags must already be false (the server copies those from a verified
   * adult owner). The owner row itself is checked only in the SQL helper.
   */
  function profileIsShareable(meta) {
    if (!meta || typeof meta !== 'object') return false;
    if (meta.availability === 'minor') return false;
    if (meta.admin_approved !== true) return false;
    if (String(meta.status || '') !== 'published') return false;
    if (meta.profile_public !== true) return false;
    if (!Array.isArray(meta.public_fields) || !meta.public_fields.length) return false;
    if (meta.is_minor !== false || meta.under_18 !== false) return false;
    var kind = accountKind(meta);
    if (kind === 'business' || kind === 'house') return true;
    if (kind === 'person') return meta.age_verified === true;
    return false;
  }

  function fieldOn(meta, key) {
    if (!Array.isArray(meta.public_fields)) return false;
    return meta.public_fields.indexOf(key) !== -1;
  }

  /**
   * The fields a logged-out visitor is allowed to see. null when the profile
   * is private or belongs to someone under 18 / not verified 18+.
   */
  function publicFace(meta, opts) {
    opts = opts || {};
    if (!profileIsShareable(meta)) return null;
    var slug = safeSlug(meta.slug || '');
    var name = fieldOn(meta, 'display_name') ? String(meta.display_name || '') : '';
    var handle = fieldOn(meta, 'handle') ? String(meta.handle || '') : '';
    var avatar = (fieldOn(meta, 'avatar_url') || fieldOn(meta, 'avatar')) ? safeHttps(meta.avatar_url || meta.avatar) : '';
    var bio = fieldOn(meta, 'bio') ? String(meta.bio || '') : '';
    var tagline = fieldOn(meta, 'tagline') ? String(meta.tagline || '') : '';
    var location = fieldOn(meta, 'location') ? String(meta.location || '') : '';
    var who = name || (handle ? ('@' + handle) : 'Profile');
    var path = opts.path || '/member';
    var image = avatar || BRAND_CARD;
    return {
      slug: slug,
      name: name,
      handle: handle,
      avatar: avatar,
      bio: bio,
      tagline: tagline,
      location: location,
      showLinks: fieldOn(meta, 'links') || fieldOn(meta, 'socials'),
      title: who + ' \u2014 KEEPITIL',
      description: shortText(bio || tagline, who + ' on KEEPITIL.'),
      image: image,
      imageWidth: image === BRAND_CARD ? '1200' : '',
      imageHeight: image === BRAND_CARD ? '630' : '',
      url: canonical(path, slug ? { slug: slug } : {}),
      share: profileShareUrl(slug, path)
    };
  }

  function canonical(path, query) {
    var u = new URL(ORIGIN + path);
    Object.keys(query || {}).forEach(function (k) { if (query[k]) u.searchParams.set(k, query[k]); });
    return u.toString();
  }

  function profileShareUrl(slug, path) {
    var u = new URL(canonical(path || '/member', safeSlug(slug) ? { slug: safeSlug(slug) } : {}));
    u.searchParams.set('utm_source', 'share');
    u.searchParams.set('utm_medium', 'profile');
    u.searchParams.delete('utm_campaign');
    u.searchParams.delete('utm_content');
    u.searchParams.delete('utm_term');
    u.searchParams.delete('utm_id');
    return u.toString();
  }

  function eventShareUrl(slug, path) {
    var s = safeSlug(slug);
    var u = new URL(canonical(path || '/event', s ? { e: s } : {}));
    u.searchParams.set('utm_source', 'share');
    u.searchParams.set('utm_medium', 'event');
    if (s) u.searchParams.set('utm_campaign', s);
    u.searchParams.delete('utm_content');
    u.searchParams.delete('utm_term');
    u.searchParams.delete('utm_id');
    return u.toString();
  }

  function eventPreview(ev, opts) {
    opts = opts || {};
    if (!ev || ev.privateEvent) return null;
    if (ev.status && String(ev.status).toLowerCase() !== 'published') return null;
    var slug = safeSlug(ev.slug);
    if (!slug) return null;
    var where = [ev.venue, ev.city].filter(Boolean).join(', ');
    var blurb = ev.tagline || ev.description || (where ? ((ev.title || 'Event') + ' at ' + where) : '');
    var path = opts.path || '/event';
    return {
      type: 'event',
      title: (ev.title || 'Event') + ' \u2014 KEEPITIL',
      description: shortText(blurb, 'A KEEPITIL event.'),
      image: BRAND_CARD,
      imageWidth: '1200',
      imageHeight: '630',
      url: canonical(path, { e: slug }),
      share: eventShareUrl(slug, path)
    };
  }

  function previewTags(card) {
    if (!card) return { robots: 'noindex, nofollow', tags: [] };
    var image = safeHttps(card.image) || BRAND_CARD;
    var tags = [
      ['property', 'og:type', card.type || 'website'],
      ['property', 'og:title', card.title || 'KEEPITIL'],
      ['property', 'og:description', card.description || ''],
      ['property', 'og:image', image],
      ['property', 'og:url', card.url || ORIGIN + '/'],
      ['name', 'twitter:card', 'summary_large_image'],
      ['name', 'twitter:title', card.title || 'KEEPITIL'],
      ['name', 'twitter:description', card.description || ''],
      ['name', 'twitter:image', image]
    ];
    if (image === BRAND_CARD || (card.imageWidth === '1200' && card.imageHeight === '630')) {
      tags.push(['property', 'og:image:width', '1200']);
      tags.push(['property', 'og:image:height', '630']);
    }
    return { robots: 'index, follow', tags: tags };
  }

  function upsert(doc, attr, key, value) {
    var sel = 'meta[' + attr + '="' + key + '"]';
    var el = doc.head ? doc.head.querySelector(sel) : doc.querySelector(sel);
    if (!value) { if (el && el.parentNode) el.parentNode.removeChild(el); return; }
    if (!el) {
      el = doc.createElement('meta');
      el.setAttribute(attr, key);
      (doc.head || doc.documentElement).appendChild(el);
    }
    el.setAttribute('content', value);
  }

  function applyPreview(doc, card) {
    if (!doc) return previewTags(card);
    var spec = previewTags(card);
    var robots = doc.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = doc.createElement('meta');
      robots.setAttribute('name', 'robots');
      (doc.head || doc.documentElement).appendChild(robots);
    }
    robots.setAttribute('content', spec.robots);
    ['og:type', 'og:title', 'og:description', 'og:image', 'og:image:width', 'og:image:height', 'og:url'].forEach(function (k) { upsert(doc, 'property', k, ''); });
    ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'].forEach(function (k) { upsert(doc, 'name', k, ''); });
    spec.tags.forEach(function (t) { upsert(doc, t[0], t[1], t[2]); });
    if (card && card.title) doc.title = card.title;
    var desc = doc.querySelector('meta[name="description"]');
    if (desc && card && card.description) desc.setAttribute('content', card.description);
    return spec;
  }

  var api = {
    BRAND_CARD: BRAND_CARD,
    safeSlug: safeSlug,
    shortText: shortText,
    profileIsShareable: profileIsShareable,
    publicFace: publicFace,
    profileShareUrl: profileShareUrl,
    eventShareUrl: eventShareUrl,
    eventPreview: eventPreview,
    previewTags: previewTags,
    applyPreview: applyPreview
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof root !== 'undefined' && root) root.KilShare = api;
})(typeof window !== 'undefined' ? window : this);
