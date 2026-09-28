/* INTRO MUSIC — "Meow Meow" (Raving Animals, KEEPITIL on SoundCloud), official widget only.
   ---------------------------------------------------------------------------
   - Only when the player's Music setting is ON and the device is online.
   - The widget is always VISIBLE (a slim SoundCloud player), never hidden; no raw stream URL.
   - Nothing waits for it: the intro runs on its own clock; a slow/blocked/offline widget = silent intro.
   - While it plays the game's own music is held (no overlap); it stops when the track ends,
     when the player taps ✕, when Music is turned off, or on quiet screens (camera, results…).
   - Autoplay is attempted; if iOS blocks it, the visible player's own ▶ starts it.
   - Automated QA never autoplays (no monetized plays by test agents). Never rewarded. */

import { get } from '../game/state.js';
import { TRACKS } from '../data/music.js';
import { music } from './sound.js';
import { appInfo } from './update.js';

export const INTRO_TRACK_TITLE = 'Meow Meow';
export const INTRO_ALBUM = 'Raving Animals';
export const introTrack = () => TRACKS.find(t => t.title === INTRO_TRACK_TITLE && t.genre === 'animal') || null;
const SC_WIDGET = 'https://w.soundcloud.com/player/';
export const qaMode = () => typeof window !== 'undefined' && !!(window.POKA_REVIEW || window.__pokaQA);
export const introWidgetUrl = (t, autoplay) => `${SC_WIDGET}?url=${encodeURIComponent(t.sc)}&auto_play=${autoplay ? 'true' : 'false'}&visual=false&show_comments=false&show_teaser=false&hide_related=true&show_user=true&color=%23ff6b8b`;

/** Pure decision: should the intro try to play music? */
export function shouldPlay({ musicOn, online, track }) { return !!(musicOn && online && track); }

let el = null;
export function stop(reason = 'stop') {
  if (!el) return;
  el.remove(); el = null; window.__externalAudio = false; document.body.classList.remove('has-intro-music');
  window.__pokaQA?.log?.(`intro-music stop ${reason}`);
  try { if (reason !== 'quiet' && get().settings.music) music.start(); } catch (e) {}
}
/** Mount the slim official player (fixed; never re-parented, so it never reloads).
 *  Async: autoplay is decided only after the native build type is known, so a device-QA build
 *  can never autoplay (a QA agent must not generate plays). Nothing awaits this. */
export async function start() {
  let qa = qaMode();
  try { qa = qa || (await appInfo()).qa; } catch (e) {}
  const t = introTrack();
  const ok = shouldPlay({ musicOn: !!get().settings?.music, online: typeof navigator === 'undefined' || navigator.onLine !== false, track: t });
  if (!ok) return { mounted: false, reason: !t ? 'no-track' : !get().settings?.music ? 'music-off' : 'offline' };
  music.stop(); window.__externalAudio = true;                 // never two musics at once
  const frame = document.createElement('iframe');
  frame.className = 'intro-sc'; frame.title = `SoundCloud player: ${t.title} by KEEPITIL`; frame.allow = 'autoplay';
  frame.height = '20'; frame.src = introWidgetUrl(t, !qa);
  const note = document.createElement('p'); note.className = 'intro-music-note';
  note.textContent = `♪ ${t.title} · ${INTRO_ALBUM} · KEEPITIL on SoundCloud`;
  const close = document.createElement('button'); close.type = 'button'; close.className = 'intro-sc-stop'; close.setAttribute('aria-label', 'Stop intro music'); close.textContent = '✕';
  close.addEventListener('click', () => stop('user'));
  el = document.createElement('div'); el.className = 'intro-music on-intro'; el.append(note, frame, close);
  document.body.append(el); document.body.classList.add('has-intro-music');
  window.__pokaQA?.log?.(`intro-music mounted autoplay=${!qa}`);
  // silent fallback: if the widget never loads, release the game music quietly
  const giveUp = setTimeout(() => { if (el && !frame.dataset.loaded) stop('timeout'); }, 9000);
  frame.addEventListener('load', () => { frame.dataset.loaded = '1'; clearTimeout(giveUp);
    // end of track → hand back to the game music
    import('./intromusic-widget.js').then(m => m.onFinish(frame, () => stop('ended'))).catch(() => {});
  }, { once: true });
  return { mounted: true, track: t.title };
}
/** After the intro the same player becomes a small "now playing" bar (CSS only; no reload). */
export function dock() { if (el) { el.classList.remove('on-intro'); el.classList.add('docked'); } }
export const playing = () => !!el;
