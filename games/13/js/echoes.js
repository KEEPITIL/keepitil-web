/* ECHOES — persistent structured spirits. Not enemies. Each carries identity, provenance, truth/emotion/desire,
   relationships, possible outcomes and three reward channels. Outcomes persist in the campaign save (save.echoes). */
(function () {
  const E = T13.echoes = { list: [] };
  E.SCHEMA = ['identity', 'historical_source', 'truth_state', 'emotional_state', 'desire', 'relationship_to_location', 'relationship_to_hollow', 'possible_outcomes', 'temporary_reward', 'persistent_reward', 'hollow_reward_if_consumed'];
  E.DESIRES = ['release', 'revenge', 'recognition', 'justice', 'protection', 'remain', 'be_left_alone', 'truth'];
  E.OUTCOMES = ['RELEASED', 'SAVED', 'LEFT', 'ANGERED', 'CONSUMED'];
  E.DATA = {
    'ashgrove.nurse': {
      identity: { name: 'Nurse Agnes Hale', role: 'night nurse, Ashgrove wing' },
      historical_source: 'fic.ashgrove',                // fictional prologue — provenance says so
      truth_state: 'confused',                          // truthful | lying | confused | unaware_dead
      emotional_state: 'frightened, dutiful',
      desire: 'protection',                             // she wants the children counted and out
      relationship_to_location: 'She was counting the wards the night of the fire. She is still counting.',
      relationship_to_hollow: 'hunted',                 // hunted | serving | unaware | hostile
      cell: [23, 2],
      possible_outcomes: {
        RELEASED: { how: 'Mara tells her the children are safe', reward: 'persistent' },
        SAVED: { how: 'Ask for the count, then protect her from the Hollow', reward: 'temporary' },
        LEFT: { how: 'Walk away', reward: null },
        CONSUMED: { how: 'The Hollow reaches her before you resolve her', reward: 'hollow' },
      },
      temporary_reward: { id: 'code_and_distraction', text: 'She says the ward count aloud (4-1-3) and draws the Hollow away once.' },
      persistent_reward: { id: 'mara.sense_range', value: 1.25, text: 'Mara’s Sense reaches further for the rest of the season.' },
      hollow_reward_if_consumed: { id: 'hollow.speed', value: 0.35, text: 'The Hollow is faster and hears better for the rest of the prologue.' },
      lines: {
        greet: 'Four… one… three… I have to count them. Where are the children? Are they out?',
        released: 'Out. They’re out. Then I can stop counting. Thank you, love.',
        saved: 'Four. One. Three. Go — I’ll call it away from you.',
        left: '…four… one…',
        consumed: 'NO— not me— it has my voice—',
      },
    },
  };
  E.validate = (id, d = E.DATA[id]) => E.SCHEMA.filter(k => !(k in d));
  E.spawn = (id, scene, L) => {
    const d = E.DATA[id], p = L.center(d.cell[0], d.cell[1]);
    const fig = T13.people.buildProcedural('mara'); const ghost = new THREE.MeshBasicMaterial({ color: 0xbfd6ff, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
    fig.root.traverse(o => { if (o.isMesh) { o.material = ghost; o.castShadow = false; } }); fig.root.position.set(p.x - 0.9, 0, p.z + 0.6); fig.root.rotation.y = Math.PI * 0.8; fig.root.scale.setScalar(0.96); scene.add(fig.root);
    const light = { intensity: 0 };   // no real light: an extra per-pixel light cost ~4 fps on device; the figure is additive/emissive
    const e = { id, d, fig, light, outcome: null, x: p.x - 0.9, z: p.z + 0.6, talked: false, t: 0 }; E.list.push(e); return e;
  };
  E.resolve = (e, outcome, apply) => { if (e.outcome) return false; if (!E.OUTCOMES.includes(outcome)) throw new Error('bad outcome'); e.outcome = outcome; apply && apply(e, outcome); return true; };
  E.tick = (dt) => E.list.forEach(e => { e.t += dt; if (!e.fig.root.visible) return; e.fig.update(dt, {}); e.fig.root.position.y = Math.sin(e.t * 1.3) * 0.04; e.light.intensity = 0.4 + Math.sin(e.t * 3.1) * 0.12; if (e.outcome && e.outcome !== 'SAVED') { e.fade = (e.fade || 1) - dt * 0.4; e.fig.root.traverse(o => { if (o.isMesh) o.material.opacity = Math.max(0, 0.32 * e.fade); }); e.light.intensity *= Math.max(0, e.fade); if (e.fade <= 0) e.fig.root.visible = false; } });
  E.reset = () => { E.list = []; };
})();
