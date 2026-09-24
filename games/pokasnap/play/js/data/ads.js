/* HOUSE VIDEO CAMPAIGNS — PokaSnap's own rewarded media. Data only.
   ---------------------------------------------------------------------------
   The reward is for finishing THIS in-app video asset. The same creative may
   also be published on YouTube, but a YouTube player is never the rewarded
   playback and no YouTube action (view, watch time, like, subscribe, comment,
   save, share) ever earns anything. `ctaUrl` may point to YouTube as a plain,
   unrewarded outbound link after the video ends.

   Owner supplies mediaUrl/ctaUrl for each campaign. A campaign without a
   mediaUrl is never offered (no dead "watch" button). */

export const CAMPAIGN_TYPES = ['keepitil_music', 'pokasnap', 'tuitea', 'wifi_remote', 'merch', 'events', 'sponsor'];

export const CAMPAIGNS = [
  { campaignId: 'pokasnap-dance-2026-09', campaignType: 'pokasnap', title: 'Teach your pet to Dance!',
    mediaUrl: 'media/ads/pokasnap-dance-15s.mp4', posterUrl: 'media/ads/pokasnap-dance-poster.jpg', durationSeconds: 15,
    rewardCoins: 25, startAt: '2026-09-01', endAt: '2026-12-31', ctaLabel: null, ctaUrl: null, isActive: true, dailyCap: 3 },
  // Owner-supplied creatives go here, e.g. a KEEPITIL music video:
  // { campaignId: 'keepitil-music-…', campaignType: 'keepitil_music', title: '…', mediaUrl: 'https://…/clip.mp4',
  //   posterUrl: '…', durationSeconds: 20, rewardCoins: 25, startAt: '…', endAt: '…',
  //   ctaLabel: 'Listen on YouTube', ctaUrl: 'https://youtube.com/…', isActive: true, dailyCap: 3 },
];
