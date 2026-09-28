/* REWARDED MEDIA — voluntary, capped, never in the camera flow.
   ---------------------------------------------------------------------------
   Provider contract (a third-party SDK can implement the same shape later):
     requestAd() -> ad|null · showAd(ad, el) -> Promise<'completed'|'skipped'|'failed'>
     onCompleted / onSkipped / onFailed callbacks · grantReward(st, ad, token)
   The house provider plays our own MP4 in a <video> element. Completion needs
   >= REWARDED.minWatchRatio of the duration actually PLAYED (seeking forward
   does not count). Each play gets a one-time token; grantReward pays once per
   token through the ledger, within the daily cap -- so reload/replay cannot
   pay twice. */

import { CAMPAIGNS } from '../data/ads.js';
import { REWARDED } from '../data/economy.js';
import * as ledger from '../game/ledger.js';

const inRange = (c, now) => (!c.startAt || now >= +new Date(c.startAt)) && (!c.endAt || now <= +new Date(c.endAt) + 864e5);
export function remainingToday(st, now = Date.now()) { return Math.max(0, REWARDED.perDay - ledger.countToday(st, 'rewardedMedia', now)); }

export const houseProvider = {
  id: 'house',
  requestAd(st, now = Date.now()) {
    if (remainingToday(st, now) <= 0) return null;
    const list = CAMPAIGNS.filter(c => c.isActive && c.mediaUrl && inRange(c, now));
    if (!list.length) return null;
    const c = list[ledger.countToday(st, 'rewardedMedia', now) % list.length];
    return { ...c, token: `ad:${ledger.dayKey(now)}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}` };
  },
  /** Plays in `video`; resolves when the viewer finishes, closes or it errors. */
  showAd(ad, video, { onProgress } = {}) {
    return new Promise(resolve => {
      let played = 0, last = null, done = false;
      const finish = r => { if (done) return; done = true; video.pause(); resolve(r); };
      video.src = ad.mediaUrl; if (ad.posterUrl) video.poster = ad.posterUrl;
      video.playsInline = true; video.muted = false; video.controls = false;
      video.ontimeupdate = () => {
        const t = video.currentTime;
        if (last != null && t > last && t - last < 1.5) played += t - last;   // forward seeks don't count
        last = t; onProgress?.(played, video.duration || ad.durationSeconds);
      };
      video.onended = () => finish(played >= (video.duration || ad.durationSeconds) * REWARDED.minWatchRatio ? 'completed' : 'skipped');
      video.onerror = () => finish('failed');
      video.play().catch(() => { video.muted = true; video.play().catch(() => finish('failed')); });
      video._skip = () => finish('skipped');
    });
  },
  grantReward(st, ad, now = Date.now()) {
    return ledger.earn(st, { id: ad.token, source: 'rewardedMedia', amount: ad.rewardCoins || REWARDED.coins, cap: Math.min(REWARDED.perDay, ad.dailyCap || REWARDED.perDay), ref: ad.campaignId, now });
  },
};
export const provider = houseProvider;
