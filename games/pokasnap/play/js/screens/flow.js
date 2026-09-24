/* WELCOME (PLAY NOW / sign in) -> HOW TO PLAY (one card) -> CREATE PET
   (5 one-tap steps) -> straight into the first photo mission.
   Target: first photo in under a minute; teach only the core loop. */

import { h, toast, sheet } from '../ui.js';
import { portrait } from '../render/pet.js';
import { SPECIES, LAUNCH_SPECIES, species as speciesOf, freeAppearances } from '../data/pets.js';
import { PERSONALITIES, PERSONALITY_ORDER, line } from '../data/personality.js';
import { starterItems } from '../data/items.js';
import { drawItemThumb } from '../render/items.js';
import { get, update } from '../game/state.js';
import { providers, oauth, emailSignIn, emailSignUp } from '../platform/auth.js';
import { track } from '../platform/analytics.js';
import { sfx, unlockAudio } from '../platform/sound.js';
import { haptic } from '../platform/native.js';

/* A live, animated pet canvas used across the flow. */
export function livePet(petFn, poseFn, size = 220, opts = {}) {
  const c = h('canvas', { width: size * 2, height: size * 2, style: `width:${size}px;height:${size}px`, class: 'hero-pet' });
  let raf = 0, blinkUntil = 0, nextBlink = performance.now() + 1800;
  const loop = now => {
    if (!c.isConnected && raf) { cancelAnimationFrame(raf); return; }
    if (now > nextBlink) { blinkUntil = now + 140; nextBlink = now + 2400 + Math.random() * 2400; }
    opts.tick?.(now);
    const pet = petFn(); if (pet) portrait(c, pet, poseFn(), { t: now / 1000, blink: now < blinkUntil, zoom: opts.zoom || 1, squash: opts.squash?.() || 0 });
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return c;
}

/* ---------------------------------------------------------------- WELCOME -- */
export function welcomeScreen(app) {
  const demo = { species: 'cat_fluffy', appearance: 'cloud', equipped: { NECK: 'neck_bowtie_blue' } };
  let pose = 'wave';
  const iv = setInterval(() => { pose = pose === 'wave' ? 'happy' : 'wave'; }, 2400);
  const guest = () => { unlockAudio(); update(s => { s.account = { mode: 'guest', userId: null, email: null }; }); app.go('onboarding'); };

  const signIn = () => {
    const sh = sheet(h('h2', {}, 'Sign in'),
      h('p', { class: 'small', style: 'margin:0 0 12px' }, 'Keep your pet safe across devices. You can always do this later.'),
      h('div', { class: 'stack' },
        providers.apple ? h('button', { class: 'btn dark block', onclick: () => social('apple') }, ' Sign in with Apple') : null,
        providers.google ? h('button', { class: 'btn ghost block', onclick: () => social('google') }, h('b', { style: 'color:#4285f4' }, 'G'), 'Sign in with Google') : null,
        h('button', { class: 'btn sky block', onclick: () => { sh.close(); app.go('email'); } }, '✉️ Continue with email')));
  };

  app.mount(h('div', { class: 'screen center bg-dots welcome' },
    h('p', { class: 'logo' }, h('span', { class: 'p' }, 'Poka'), h('span', { class: 's' }, 'Snap')),
    h('p', { class: 'tag' }, 'POKE · POSE · SNAP'),
    livePet(() => demo, () => pose, Math.min(260, window.innerHeight * 0.34)),
    h('p', { class: 'sub', style: 'max-width:320px' }, 'A photo game starring your very own pet. Pose it anywhere and snap photo missions together!'),
    h('div', { class: 'stack', style: 'width:100%;max-width:360px' },
      h('button', { class: 'btn block big', onclick: () => { track('play_now_tapped', { from: 'welcome' }); guest(); } }, 'PLAY NOW'),
      h('button', { class: 'btn ghost block', onclick: signIn }, 'SIGN IN'),
      h('p', { class: 'small', style: 'margin:0' }, 'No account needed. Your pet and photos stay on this device.'),
    )));

  return () => clearInterval(iv);

  async function social(p) {
    track('signup_started', { method: p });
    try { await oauth(p); } catch (e) { toast('Could not reach sign-in. Try again or play as guest.'); }
  }
}

export function emailScreen(app) {
  let mode = 'signup';
  const email = h('input', { class: 'field', type: 'email', placeholder: 'you@example.com', autocomplete: 'email', style: 'font-size:18px' });
  const pass = h('input', { class: 'field', type: 'password', placeholder: 'Password (8+ characters)', autocomplete: 'new-password', style: 'font-size:18px' });
  const title = h('h1', {}, 'Create your account');
  const go = h('button', { class: 'btn block' }, 'Create account');
  const swap = h('button', { class: 'linkbtn' }, 'Already have an account? Sign in');
  swap.onclick = () => {
    mode = mode === 'signup' ? 'signin' : 'signup';
    title.textContent = mode === 'signup' ? 'Create your account' : 'Welcome back!';
    go.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
    swap.textContent = mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account';
    pass.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  };
  go.onclick = async () => {
    const e = email.value.trim(), p = pass.value;
    if (!/^\S+@\S+\.\S+$/.test(e)) return toast('Enter a valid email');
    if (p.length < 8) return toast('Password needs 8+ characters');
    go.disabled = true;
    try {
      if (mode === 'signup') {
        track('signup_started', { method: 'email' });
        const r = await emailSignUp(e, p);
        // Playing never waits on the inbox: they continue as a guest now, and the
        // account attaches when the link is confirmed.
        update(s => { s.account = { mode: r.session ? 'email' : 'guest', userId: r.session?.user.id || null, email: e }; });
        toast(r.needsConfirm ? 'Check your email to confirm — you can play now!' : 'Account created!', 3500);
        if (r.session) track('signup_completed', { method: 'email' });
      } else {
        const s = await emailSignIn(e, p);
        update(st => { st.account = { mode: 'email', userId: s.user.id, email: e }; });
        track('signup_completed', { method: 'email' });
        toast('Signed in!');
      }
      app.go(get().pet ? 'home' : 'onboarding');
    } catch (err) {
      toast(/confirm/i.test(err.message) ? 'Please confirm your email first' : /invalid/i.test(err.message) ? 'Email or password is wrong' : 'Could not sign in — check your connection');
    } finally { go.disabled = false; }
  };
  app.mount(h('div', { class: 'screen' },
    h('button', { class: 'icon-btn', onclick: () => app.go('welcome'), 'aria-label': 'Back' }, '←'),
    h('div', { class: 'stack', style: 'margin-top:18px' }, title,
      h('p', { class: 'sub' }, 'Save your pet and photos progress to your KEEPITIL account.'),
      email, pass, go, swap)));
}

/* ------------------------------------------------------------- ONBOARDING -- */
/* One card, six beats, then you're choosing your pet. Everything else
   (care, training, closet, badges) is discovered after the first photo. */
const HOW = [
  ['🐾', 'Pick your pet'], ['👆', 'Poke it to react'], ['🎭', 'Pose it'],
  ['🌍', 'Put it into your world'], ['📸', 'Snap!'], ['🏆', 'Earn rewards'],
];
export function onboardingScreen(app) {
  const pet = { species: 'dog_small', appearance: 'apricot', equipped: { NECK: 'neck_bandana' } };
  let pose = 'happy', k = 0;
  const iv = setInterval(() => { pose = ['happy', 'surprised', 'wave', 'jump'][++k % 4]; if (!document.body.contains(c)) clearInterval(iv); }, 1400);
  track('onboarding_started', {});
  const go = () => { clearInterval(iv); update(s => { s.onboarded = true; }); sfx.tap(); app.go('create'); };
  const c = livePet(() => pet, () => pose, Math.min(200, window.innerHeight * 0.24));
  app.mount(h('div', { class: 'screen center bg-dots' },
    c, h('h1', {}, 'How to play'),
    h('ol', { class: 'how' }, ...HOW.map(([i, t], n) => h('li', {}, h('span', { class: 'n' }, n + 1), h('span', { class: 'i' }, i), t))),
    h('div', { class: 'stack', style: 'width:100%;max-width:360px;margin-top:14px' },
      h('button', { class: 'btn block big', onclick: go }, 'PICK MY PET'))));
}

/* ------------------------------------------------------------- CREATE PET -- */
const NAMES = ['Mochi', 'Biscuit', 'Pudding', 'Waffles', 'Noodle', 'Pickles', 'Bean', 'Sprinkles', 'Nugget', 'Marshmallow', 'Pebbles', 'Taco'];

export function createScreen(app) {
  const draft = { species: 'cat_fluffy', appearance: null, name: '', personality: 'cuddly', starter: 'neck_collar_red' };
  let step = 0, pose = 'idle', squash = 0;
  const STEPS = 5;
  const petNow = () => ({ species: draft.species, appearance: draft.appearance || speciesOf(draft.species).appearances[0].id,
    equipped: step >= 4 ? { [itemSlot(draft.starter)]: draft.starter } : {} });

  const head = (t, s) => [h('div', { class: 'stepper' }, ...Array.from({ length: STEPS }, (_, k) => h('i', { class: k === step ? 'on' : '' }))), h('h1', { style: 'text-align:center' }, t), h('p', { class: 'sub', style: 'text-align:center' }, s)];
  const nav = (label, ok) => h('div', { class: 'row sticky-nav' },
    step > 0 ? h('button', { class: 'icon-btn', onclick: () => { step--; render(); }, 'aria-label': 'Back' }, '←') : null,
    h('button', { class: 'btn block grow', onclick: () => { if (!ok()) return; sfx.tap(); step++; render(); } }, label));

  function render() {
    pose = ['idle', 'look', 'happy', 'wave', 'happy'][step];
    const hero = livePet(petNow, () => pose, step === 0 ? 150 : 190, { squash: () => (squash *= 0.86) > 0.02 ? Math.sin(squash * Math.PI) * squash : 0 });
    hero.onclick = () => { squash = 1; pose = 'surprised'; sfx.poke(); haptic('light'); setTimeout(() => pose = 'happy', 700); };
    let body;
    if (step === 0) {
      body = [...head('Choose your pet', 'Who\'s coming on adventures with you?'),
        h('div', { class: 'choices species' }, ...LAUNCH_SPECIES.map(id => {
          const sp = SPECIES[id], c = h('canvas', { width: 240, height: 240 });
          portrait(c, { species: id, appearance: sp.appearances[0].id }, 'idle', { t: 0.3 });
          return h('div', { class: 'choice' + (draft.species === id ? ' on' : ''), onclick: () => { draft.species = id; draft.appearance = null; track('pet_selected', { species: id }); sfx.tap(); render(); } },
            c, h('b', {}, sp.name));
        })),
        h('p', { class: 'sub', style: 'text-align:center;margin:12px 0 0' }, SPECIES[draft.species].blurb),
        nav('NEXT', () => true)];
    } else if (step === 1) {
      const sp = { ...speciesOf(draft.species), appearances: freeAppearances(draft.species) };   // premium looks come later, from the store
      if (!draft.appearance) draft.appearance = sp.appearances[0].id;
      body = [...head('Choose a look', sp.name + ' comes in these colours.'), hero,
        h('div', { class: 'swatches', style: 'margin-top:8px' }, ...sp.appearances.map(a => h('button', {
          class: 'swatch' + (draft.appearance === a.id ? ' on' : ''), 'aria-label': a.name,
          style: `background:radial-gradient(circle at 35% 30%, ${a.belly}, ${a.base} 55%, ${a.shade})`,
          onclick: () => { draft.appearance = a.id; sfx.tap(); render(); } }))),
        h('p', { class: 'small', style: 'text-align:center' }, sp.appearances.find(a => a.id === draft.appearance).name),
        nav('NEXT', () => true)];
    } else if (step === 2) {
      const input = h('input', { class: 'field', maxlength: 14, placeholder: 'Pet name', value: draft.name, 'aria-label': 'Pet name' });
      input.oninput = () => { draft.name = input.value; };
      body = [...head('Name your pet', 'Tap your pet — they love attention.'), hero, input,
        h('div', { class: 'chips', style: 'margin-top:10px' }, ...NAMES.slice(0, 8).map(n => h('button', { class: 'chip', onclick: () => { draft.name = n; input.value = n; sfx.tap(); } }, n))),
        nav('NEXT', () => { draft.name = draft.name.trim(); if (!draft.name) { toast('Give your pet a name!'); return false; } return true; })];
    } else if (step === 3) {
      body = [...head(`What is ${draft.name} like?`, 'Personality changes how your pet talks and reacts.'), hero,
        h('div', { class: 'stack' }, ...PERSONALITY_ORDER.map(id => {
          const p = PERSONALITIES[id];
          return h('div', { class: 'choice' + (draft.personality === id ? ' on' : ''), style: 'display:flex;align-items:center;gap:12px;text-align:left;padding:12px',
            onclick: () => { draft.personality = id; sfx.tap(); render(); } },
            h('div', { class: 'emoji' }, p.icon), h('div', {}, h('b', { style: 'margin:0' }, p.name), h('span', {}, p.blurb)));
        })),
        h('p', { class: 'bubble', style: 'align-self:center;margin-top:14px' }, `"${line(draft.personality, 'greet', draft.name)}"`),
        nav('NEXT', () => true)];
    } else {
      body = [...head('Pick a starter accessory', 'Earn more by completing missions.'), hero,
        h('div', { class: 'choices', style: 'grid-template-columns:repeat(3,1fr)' }, ...starterItems().map(it => {
          const c = h('canvas', { width: 180, height: 180 }); drawItemThumb(c, it.itemID);
          return h('div', { class: 'choice' + (draft.starter === it.itemID ? ' on' : ''), onclick: () => { draft.starter = it.itemID; sfx.equip(); render(); } }, c, h('b', {}, it.name));
        })),
        h('div', { class: 'row sticky-nav' },
          h('button', { class: 'icon-btn', onclick: () => { step--; render(); }, 'aria-label': 'Back' }, '←'),
          h('button', { class: 'btn block big grow', onclick: finish }, 'LET\'S GO! 🐾'))];
    }
    app.mount(h('div', { class: 'screen' }, ...body));
  }

  function finish() {
    const starter = draft.starter;
    update(s => {
      s.pet = { species: draft.species, appearance: draft.appearance, name: draft.name, personality: draft.personality,
        equipped: { [itemSlot(starter)]: starter }, createdAt: Date.now() };
      if (!s.inventory.includes(starter)) s.inventory.push(starter);
      s.currentMission = 'first_snap';
    });
    track('pet_created', { species: draft.species, appearance: draft.appearance, personality: draft.personality });
    track('pet_named', { suggested: NAMES.includes(draft.name) });
    track('first_pet_created', { species: draft.species });
    track('onboarding_completed', {});
    track('signup_completed', { method: get().account.mode || 'guest' });
    track('pet_customized', { item: starter, via: 'starter' });
    sfx.level(); haptic('success');
    // first photo as fast as possible: straight into the first mission
    app.go('brief', { missionId: 'first_snap' });
  }
  render();
}

function itemSlot(id) { return starterItems().find(i => i.itemID === id)?.slot || 'NECK'; }
