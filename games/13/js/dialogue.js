/* DIALOGUE — every line: { id, speaker, subtitle, audioAsset, emotion, priority, spatial, interruptible, historicalSource, localizationKey }.
   Lines play while the player moves. Higher priority interrupts interruptible lines; equal/lower queue. Missing VO → subtitle-only
   (reported once per asset). historicalSource must reference a T13.history entry, whose provenance label is shown with it. */
(function () {
  const D = T13.dialogue = { queue: [], current: null, missing: new Set(), log: [], strings: {} };
  const PRI = { ambient: 0, bark: 1, story: 2, warning: 3, critical: 4 };
  D.PRI = PRI;
  D.line = (o) => ({ id: o.id || ('l' + Math.random().toString(36).slice(2, 8)), speaker: o.speaker, subtitle: o.subtitle, audioAsset: o.audioAsset || null, emotion: o.emotion || 'neutral', priority: PRI[o.priority] ?? (typeof o.priority === 'number' ? o.priority : 1), spatial: o.spatial !== false, interruptible: o.interruptible !== false, historicalSource: o.historicalSource || null, localizationKey: o.localizationKey || o.id || null, ms: o.ms || Math.max(2200, (o.subtitle || '').length * 55), pointAt: o.pointAt || null });
  const text = l => (l.localizationKey && D.strings[l.localizationKey]) || l.subtitle;   // localisation hook
  /* play: returns true if started now, false if queued/dropped */
  D.play = (spec, hooks = D.hooks) => {
    const l = D.line(spec);
    if (l.historicalSource && !T13.history.entries.has(l.historicalSource)) { D.log.push({ warn: 'unknown historicalSource ' + l.historicalSource, id: l.id }); l.historicalSource = null; }
    const cur = D.current;
    if (cur && performance.now() < cur.until) {
      if (l.priority > cur.priority && cur.interruptible) { D.log.push({ interrupted: cur.id, by: l.id }); start(l, hooks); return true; }
      if (l.priority >= PRI.story) { D.queue.push(l); D.queue.sort((a, b) => b.priority - a.priority); return false; }
      return false;   // barks that can't play now are dropped, not stacked
    }
    start(l, hooks); return true;
  };
  function start(l, hooks) {
    D.current = { ...l, until: performance.now() + l.ms };
    const src = l.historicalSource ? T13.history.render(l.historicalSource) : null;
    hooks?.show && hooks.show(l, text(l), src);
    if (l.audioAsset) { if (!hooks?.audio || !hooks.audio(l)) { if (!D.missing.has(l.audioAsset)) { D.missing.add(l.audioAsset); D.log.push({ missingVO: l.audioAsset }); } } }
    D.log.push({ line: l.id, speaker: l.speaker, priority: l.priority, t: Math.round(performance.now()) });
  }
  D.tick = (hooks = D.hooks) => { if (D.current && performance.now() >= D.current.until) { D.current = null; const n = D.queue.shift(); if (n) start(n, hooks); } };
  D.reset = () => { D.queue = []; D.current = null; };

  /* REACTIVE VO BANKS — category → per-speaker lines (temporary text; audioAsset keys ready for recorded VO) */
  const bank = (cat, rows) => rows.map(([speaker, subtitle, emotion], i) => ({ id: `${cat}.${speaker}.${i}`, speaker, subtitle, emotion: emotion || 'neutral', audioAsset: `vo/${cat}/${speaker}_${i}.m4a`, priority: cat === 'warning' || cat === 'hollow' ? 'warning' : 'bark', localizationKey: `vo.${cat}.${speaker}.${i}` }));
  D.BANKS = {
    injury: bank('injury', [['mara', 'Ah— I’m okay. I’m okay.', 'pain'], ['gabriel', 'It got me. Keep moving.', 'pain'], ['daniel', 'That’s— that’s bleeding. Fine. Fine.', 'pain']]),
    fear: bank('fear', [['mara', 'Something’s wrong with this room.', 'fear'], ['gabriel', 'Stay behind me.', 'concern'], ['daniel', 'That shouldn’t be possible.', 'fear']]),
    discovery: bank('discovery', [['mara', 'There’s something here. I can feel it.', 'concern'], ['gabriel', 'Over here.', 'neutral'], ['daniel', 'Look at this. It doesn’t match the plan.', 'neutral']]),
    hollow: bank('hollow', [['mara', 'It’s close. It’s listening.', 'fear'], ['gabriel', 'Hide. Now.', 'anger'], ['daniel', 'Don’t look at it. Move.', 'fear']]),
    echo: bank('echo', [['mara', 'She doesn’t know she’s gone.', 'concern'], ['gabriel', 'Is it friendly?', 'concern'], ['daniel', 'Ask her what she remembers.', 'neutral']]),
    combat: bank('combat', [['mara', 'Get off him!', 'anger'], ['gabriel', 'BACK!', 'anger'], ['daniel', 'It’s solid — hit it now!', 'anger']]),
    rescue: bank('rescue', [['mara', 'I’ve got you — pull!', 'fear'], ['gabriel', 'Let. Her. GO.', 'anger'], ['daniel', 'Its grip isn’t real — I can break it!', 'fear']]),
    powers: bank('powers', [['mara', 'Quiet. Let me listen.', 'neutral'], ['gabriel', 'Stand back.', 'neutral'], ['daniel', 'Let me see what’s actually here.', 'neutral']]),
    separation: bank('separation', [['mara', 'Where are you? Say something!', 'fear'], ['gabriel', 'Nobody splits up. Regroup on me.', 'anger'], ['daniel', 'I’ve lost them. That’s bad.', 'fear']]),
    captured: bank('captured', [['mara', 'It took him. I can still feel him — that way.', 'fear'], ['gabriel', 'We get her back. Now.', 'anger'], ['daniel', 'It didn’t kill them. It needs them alive. Why?', 'concern']]),
  };
  D.bark = (cat, speaker, extra = {}) => { const rows = (D.BANKS[cat] || []).filter(r => !speaker || r.speaker === speaker); if (!rows.length) return false; const r = rows[Math.floor(Math.random() * rows.length)]; return D.play({ ...r, ...extra }); };
})();
