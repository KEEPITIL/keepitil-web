/* STORY & HISTORY DATA — the single source for timeline, cases, provenance-classified facts and HQ progression.
   Provenance classes are enforced: THIRTEEN_FICTION can never render as history (see T13.history.render + tests). */
(function () {
  const H = T13.history = {};
  H.CLASS = { DOCUMENTED_HISTORY: 'Documented history', REPORTED_ACCOUNT: 'Reported account', FOLKLORE: 'Folklore', BIBLICAL_SOURCE: 'Biblical source', THIRTEEN_FICTION: 'THIRTEEN fiction' };
  /* every factual or fictional statement shown to the player is an entry: { id, class, text, source?, citation? }
     DOCUMENTED_HISTORY and REPORTED_ACCOUNT require a source; BIBLICAL_SOURCE requires a citation. */
  H.entries = new Map();
  H.add = e => { if (!H.CLASS[e.class]) throw new Error('unknown provenance class ' + e.class); if ((e.class === 'DOCUMENTED_HISTORY' || e.class === 'REPORTED_ACCOUNT') && !e.source) throw new Error(e.id + ': history needs a source'); if (e.class === 'BIBLICAL_SOURCE' && !e.citation) throw new Error(e.id + ': scripture needs a citation'); H.entries.set(e.id, e); return e; };
  H.render = id => { const e = H.entries.get(id); if (!e) return null; return { label: H.CLASS[e.class], cls: e.class, text: e.text, source: e.source || e.citation || null, isFiction: e.class === 'THIRTEEN_FICTION' }; };
  [
    { id: 'bib.rev9_11', class: 'BIBLICAL_SOURCE', citation: 'Revelation 9:11', text: 'The angel of the bottomless pit, whose name in Hebrew is Abaddon, and in Greek Apollyon ("Destroyer").' },
    { id: 'bib.1john4_1', class: 'BIBLICAL_SOURCE', citation: '1 John 4:1', text: 'Do not believe every spirit, but test the spirits.' },
    { id: 'bib.eph6_12', class: 'BIBLICAL_SOURCE', citation: 'Ephesians 6:12', text: 'Our struggle is not against flesh and blood, but against the powers of this dark world.' },
    { id: 'bib.rev13', class: 'BIBLICAL_SOURCE', citation: 'Revelation 13', text: 'The beasts from the sea and the earth; signs, deception and allegiance.' },
    { id: 'bib.gen14_4', class: 'BIBLICAL_SOURCE', citation: 'Genesis 14:4', text: 'Twelve years they served … and in the thirteenth year they rebelled.' },
    { id: 'fic.thirteen_number', class: 'THIRTEEN_FICTION', text: 'The cult teaches "Twelve is order. Thirteen is rebellion." Scripture does not call thirteen a satanic number — this is the cult’s invented theology.' },
    { id: 'fic.hollow', class: 'THIRTEEN_FICTION', text: 'The Hollow cannot create — it counterfeits voices, faces and memories.' },
    { id: 'fic.massacre', class: 'THIRTEEN_FICTION', text: 'Late 1998: the Hollow turns a Lantern gathering into a convergence. Evelyn Vane dies protecting the children; Elias vanishes into the Between.' },
    { id: 'fic.ashgrove', class: 'THIRTEEN_FICTION', text: 'The Ashgrove wing is invented for the prologue. It depicts no real place or tragedy.' },
    { id: 'fic.case13_frame', class: 'THIRTEEN_FICTION', text: 'THIRTEEN’s fictional cult prepared a supernatural ritual to exploit the September 11 attacks. It did not cause them.' },
  ].forEach(H.add);

  /* CAMPAIGN — March 1999 → September 11, 2001. Real-location cases stay locked (research.verified) until sourced dossiers exist. */
  const S = T13.story = {};
  S.MASSACRE = '1998-11';
  S.CASES = [
    { n: 1, id: 'winchester', title: 'Winchester', place: 'San Jose, California', date: '1999-03', theme: 'Can you trust the dead?' },
    { n: 2, id: 'stfrancis', title: 'St. Francis Dam', place: 'California', date: '1999-05', theme: 'Survival' },
    { n: 3, id: 'galveston', title: 'Galveston', place: 'Texas', date: '1999-08', theme: 'The children of the storm' },
    { n: 4, id: 'peshtigo', title: 'Peshtigo', place: 'Wisconsin', date: '1999-10', theme: 'Fire' },
    { n: 5, id: 'iroquois', title: 'Iroquois Theatre', place: 'Chicago', date: '1999-12', theme: 'Blocked exits' },
    { n: 6, id: 'easternstate', title: 'Eastern State', place: 'Philadelphia', date: '2000-03', theme: 'Guilt' },
    { n: 7, id: 'halifax', title: 'Halifax', place: 'Nova Scotia', date: '2000-05', theme: 'Sacrifice' },
    { n: 8, id: 'baguio', title: 'Baguio', place: 'Philippines', date: '2000-08', theme: 'Faith' },
    { n: 9, id: 'changi', title: 'Changi', place: 'Singapore', date: '2000-11', theme: 'History versus legend' },
    { n: 10, id: 'portarthur', title: 'Port Arthur', place: 'Tasmania', date: '2001-02', theme: 'Captivity', reveal: 'cult' },
    { n: 11, id: 'armero', title: 'Armero', place: 'Colombia', date: '2001-05', theme: 'Thirteen', reveal: 'elias' },
    { n: 12, id: 'aberfan', title: 'Aberfan', place: 'Wales', date: '2001-07', theme: 'Warnings', reveal: 'evelyn_date' },
    { n: 13, id: 'dayofsorrow', title: 'The Day of Sorrow', place: 'New York · Washington · Pennsylvania', date: '2001-09-11', theme: 'The Power of Three', finale: true },
  ].map(c => ({ ...c, research: { verified: false } }));
  /* reveal locks: a reveal flag can only become true once its case is complete — never by default */
  S.REVEALS = { cult: 10, elias: 11, evelyn_date: 12 };
  S.canReveal = (key, progress) => (progress?.completed || []).includes(S.REVEALS[key]);
  S.case13Unlocked = progress => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every(n => (progress?.completed || []).includes(n));

  /* HQ STATES — HQ_STATE_00 (campaign start) … HQ_STATE_13; flags add detail on top */
  S.HQ_STATES = Array.from({ length: 14 }, (_, i) => ({ id: 'HQ_STATE_' + String(i).padStart(2, '0'), markers: i, clippings: Math.min(i, 8), photosDeveloped: Math.min(i, 6), trophies: i, cultSymbol: i >= 3 ? Math.min(1, (i - 2) / 8) : 0, eliasTrace: i >= 11 ? 2 : i >= 6 ? 1 : 0, lampFailing: i >= 9, chairMoved: i >= 4 }));
  S.hqState = progress => { const n = Math.max(0, Math.min(13, (progress?.completed || []).length)); return { ...S.HQ_STATES[n], flags: progress?.flags || {} }; };
})();
