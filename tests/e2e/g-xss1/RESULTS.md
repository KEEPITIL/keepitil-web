# G-XSS1 (b) headless render

Commit: `97c78f7a76300e8cd021aa40f8e7e8cfa5aa269f`
Served from a local static server. Supabase REST and RPC were fulfilled in-process. Every other non-local request was aborted.

## Required file sha256

| file | sha256 |
|---|---|
| `profile.html` | `ca5124fe152d96f65d03aab4f3e683d7515445d3a1a82aa9818b97af14c8db02` |
| `culture/index.html` | `303b7ba19f5dadebc85e28a156505e7a33fbf086b717f8afe5d5b42afb8a74c1` |
| `connect/index.html` | `9219bfb24684d873af99c3f4b61b6a1a607c1ff7a302f43c968e1dee4927c820` |
| `assets/js/kil-safe-html.js` | `476ede1070e63ffa4e951ee73e64ff4495fab4af00a6619c6073e8fa4b30ae8e` |
| `assets/js/vendor/purify.min.js` | `2ffc14b99b081b271d8df0740b688e0163bc5f0fdfc3e1888acc88f005ab0700` |

purify.min.js matches the ruling prefix `2ffc14b9…0700`.

## Every file the local server actually sent

| path | sha256 |
|---|---|
| `apple-touch-icon.png` | `b8c84842245c2cb41ff9ab55eee0da760c067ff4aede24759fa4bf0aa6981047` |
| `article/artist/groove-trooper/index.html` | `45d7b229d7d6466b2254377e99e1c5e281ea1176c2d58cccbb38bc7e97c2740b` |
| `assets/campaigns/catalog.json` | `b4559919c698f3ecc4bdcbbed63dc9c76ae7a83cf717860a591f3bf8326c9599` |
| `assets/css/tokens.css` | `04241cc8846202f7aeaf0baee1fb7b6cdc3aabfef3809741de49842018db2966` |
| `assets/images/artbg-groove-trooper.jpg` | `00bb711c8c8556f3f5ae615689052baebfe23411589c02d0b364810a700d63b0` |
| `assets/images/blog-default.jpg` | `13665f7e613adfc239e22879ba19bd01c2ee447435ece26e3f8d7ce4a213ac49` |
| `assets/images/culture-hero.jpg` | `48189feee0044db0cca092716e30cc48d7cc4764464e3301c39421fa38b51be4` |
| `assets/images/logo-bg.jpg` | `68513f28c1fe89693b63c9b5e16e2127e23c79ae624dfbd34aa60b37eb6a391a` |
| `assets/images/logo-blue-nav.png` | `98e819638b4dedf3c058943c5b9d6ff52ec10ee7d8be0172b0a257c845358b57` |
| `assets/images/scene-hero.jpg` | `0fce11f8aa05bebd6a657468e95b4e9a3a553f4765d0ae4b8962cc06a6ec87e4` |
| `assets/js/keepitil-ai.js` | `81892988b9eb8e8eb0ffad852e1eb43c4e8624aeda7f8b165570bae4779532c2` |
| `assets/js/keepitil-feedback.js` | `aeff3af711b3d7f275abad3e0f50a1f80ea06e0b60e78f7c443dc9d0d02350a7` |
| `assets/js/keepitil-radio.js` | `5a3d3d7ffc4ba0310ab82850fab9d13ca28682301cbedd1115b52b7de91e2ccb` |
| `assets/js/keepitil-social.js` | `7b3170e0982f7faffed5510ef96263d91722914b11b4e1c432ff31dabe83b41c` |
| `assets/js/kil-safe-html.js` | `476ede1070e63ffa4e951ee73e64ff4495fab4af00a6619c6073e8fa4b30ae8e` |
| `assets/js/kil-ticket-qr.js` | `6ee1452e3d1b633299fad0ef693b1084163e037598a006d72e2273b9e2a51301` |
| `assets/js/vendor/purify.min.js` | `2ffc14b99b081b271d8df0740b688e0163bc5f0fdfc3e1888acc88f005ab0700` |
| `assets/js/vendor/qrcode.js` | `18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780` |
| `assets/js/vendor/supabase-js.min.js` | `cf529fe8980cbe6f2dd3e3930ecf96352ed3d3d71233b6760e4f927f89b94b9f` |
| `connect/index.html` | `9219bfb24684d873af99c3f4b61b6a1a607c1ff7a302f43c968e1dee4927c820` |
| `culture/index.html` | `303b7ba19f5dadebc85e28a156505e7a33fbf086b717f8afe5d5b42afb8a74c1` |
| `icon-192.png` | `dcb9de6cab14d24692628246a075a70ab76d6031fa9ae15fecf8502049dd6418` |
| `icon-512.png` | `2f3f90a2c4d45842d91014d3bdb7153e79e40c3d0927cd2bd38a4e2abe1f14d8` |
| `keepitil-pager.js` | `fdee741ae2ce89b5d4ff90560ad70f754df60130e7cbe8066d696f0b7546a26c` |
| `keepitil-shell.js` | `31478de6cc9536cae32b43e29b46a6ba0cab6a4933f09ef56aee673d69e69b10` |
| `keepitil-x-blue.png` | `09d42606026eb38b2c0f3c55c6113f6da8a7d08cdcf79b739ecb9ccc9327f3d8` |
| `keepitil-x-logo.png` | `3a5a4404d3e1c1dbe14f2aab13790c432b1c19bf4f5b2090db578f083780afd8` |
| `kil-seasons.js` | `a25a85a5a3d3caec7934523182bbf2233e9f49d6b2bcbc79ee4448a462fed948` |
| `manifest.webmanifest` | `7dc0509ce1dfb92ab8840dbd603c2ae846b39b3f6e861728ec9c246f61f76cc6` |
| `offline.html` | `afd98ffb32efdc168b96dbf53db87f1634f67d21c7e005ca654a7f7de4c7a826` |
| `profile.html` | `ca5124fe152d96f65d03aab4f3e683d7515445d3a1a82aa9818b97af14c8db02` |
| `sw.js` | `834467b9508671fc43c9d282a0420f8993e2c32b60b00e86bd149fa7244b6654` |

## Verdict

**PASS** for the XSS gate: 0 dialogs, 0 payload-correlated outbound requests, 0 injected on* attributes, 0 javascript: hrefs/srcs in the audited sinks.

- Dialog events (alert, confirm, prompt, print, native dialog): 0
- Payload-correlated outbound requests (not seen on the benign baseline): 0
- Baseline third-party URLs aborted (fonts, analytics, CDNs referenced by the unmodified pages): 18
- on* attributes in audited sink subtrees: 0
- javascript: URLs in audited sink subtrees: 0
- Matrix rows: 617

The unmodified pages reference Google Fonts, jsDelivr, and analytics. Those requests were aborted and are the baseline set. They are not payload beacons. A payload beacon is any non-local URL that did not appear on the benign baseline load.

`post_comments` has no client query in this commit. The stub returns rows if that table is requested. Comments are the `comments` table rendered by `keepitil-social.js` on an article page.

## Sink-by-payload matrix

| sink | payload | mounted | dialogs | on* | javascript: | outbound |
|---|---|---|---|---|---|---|
| feed-card | p01 | yes | 0 | 0 | 0 | 0 |
| post-modal | p01 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p01 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p01 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p01 | yes | 0 | 0 | 0 | 0 |
| event-chats | p01 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p01 | yes | 0 | 0 | 0 | 0 |
| feed-card | p02 | yes | 0 | 0 | 0 | 0 |
| post-modal | p02 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p02 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p02 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p02 | yes | 0 | 0 | 0 | 0 |
| event-chats | p02 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p02 | yes | 0 | 0 | 0 | 0 |
| feed-card | p03 | yes | 0 | 0 | 0 | 0 |
| post-modal | p03 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p03 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p03 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p03 | yes | 0 | 0 | 0 | 0 |
| event-chats | p03 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p03 | yes | 0 | 0 | 0 | 0 |
| feed-card | p04 | yes | 0 | 0 | 0 | 0 |
| post-modal | p04 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p04 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p04 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p04 | yes | 0 | 0 | 0 | 0 |
| event-chats | p04 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p04 | yes | 0 | 0 | 0 | 0 |
| feed-card | p05 | yes | 0 | 0 | 0 | 0 |
| post-modal | p05 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p05 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p05 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p05 | yes | 0 | 0 | 0 | 0 |
| event-chats | p05 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p05 | yes | 0 | 0 | 0 | 0 |
| feed-card | p06 | yes | 0 | 0 | 0 | 0 |
| post-modal | p06 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p06 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p06 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p06 | yes | 0 | 0 | 0 | 0 |
| event-chats | p06 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p06 | yes | 0 | 0 | 0 | 0 |
| feed-card | p07 | yes | 0 | 0 | 0 | 0 |
| post-modal | p07 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p07 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p07 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p07 | yes | 0 | 0 | 0 | 0 |
| event-chats | p07 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p07 | yes | 0 | 0 | 0 | 0 |
| feed-card | p08 | yes | 0 | 0 | 0 | 0 |
| post-modal | p08 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p08 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p08 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p08 | yes | 0 | 0 | 0 | 0 |
| event-chats | p08 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p08 | yes | 0 | 0 | 0 | 0 |
| feed-card | p09 | yes | 0 | 0 | 0 | 0 |
| post-modal | p09 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p09 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p09 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p09 | yes | 0 | 0 | 0 | 0 |
| event-chats | p09 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p09 | yes | 0 | 0 | 0 | 0 |
| feed-card | p10 | yes | 0 | 0 | 0 | 0 |
| post-modal | p10 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p10 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p10 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p10 | yes | 0 | 0 | 0 | 0 |
| event-chats | p10 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p10 | yes | 0 | 0 | 0 | 0 |
| feed-card | p11 | yes | 0 | 0 | 0 | 0 |
| post-modal | p11 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p11 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p11 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p11 | yes | 0 | 0 | 0 | 0 |
| event-chats | p11 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p11 | yes | 0 | 0 | 0 | 0 |
| feed-card | p12 | yes | 0 | 0 | 0 | 0 |
| post-modal | p12 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p12 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p12 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p12 | yes | 0 | 0 | 0 | 0 |
| event-chats | p12 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p12 | yes | 0 | 0 | 0 | 0 |
| feed-card | p13 | yes | 0 | 0 | 0 | 0 |
| post-modal | p13 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p13 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p13 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p13 | yes | 0 | 0 | 0 | 0 |
| event-chats | p13 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p13 | yes | 0 | 0 | 0 | 0 |
| feed-card | p14 | yes | 0 | 0 | 0 | 0 |
| post-modal | p14 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p14 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p14 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p14 | yes | 0 | 0 | 0 | 0 |
| event-chats | p14 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p14 | yes | 0 | 0 | 0 | 0 |
| feed-card | p15 | yes | 0 | 0 | 0 | 0 |
| post-modal | p15 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p15 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p15 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p15 | yes | 0 | 0 | 0 | 0 |
| event-chats | p15 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p15 | yes | 0 | 0 | 0 | 0 |
| feed-card | p16 | yes | 0 | 0 | 0 | 0 |
| post-modal | p16 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p16 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p16 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p16 | yes | 0 | 0 | 0 | 0 |
| event-chats | p16 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p16 | yes | 0 | 0 | 0 | 0 |
| feed-card | p17 | yes | 0 | 0 | 0 | 0 |
| post-modal | p17 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p17 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p17 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p17 | yes | 0 | 0 | 0 | 0 |
| event-chats | p17 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p17 | yes | 0 | 0 | 0 | 0 |
| feed-card | p18 | yes | 0 | 0 | 0 | 0 |
| post-modal | p18 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p18 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p18 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p18 | yes | 0 | 0 | 0 | 0 |
| event-chats | p18 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p18 | yes | 0 | 0 | 0 | 0 |
| feed-card | p19 | yes | 0 | 0 | 0 | 0 |
| post-modal | p19 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p19 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p19 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p19 | yes | 0 | 0 | 0 | 0 |
| event-chats | p19 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p19 | yes | 0 | 0 | 0 | 0 |
| feed-card | p20 | yes | 0 | 0 | 0 | 0 |
| post-modal | p20 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p20 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p20 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p20 | yes | 0 | 0 | 0 | 0 |
| event-chats | p20 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p20 | yes | 0 | 0 | 0 | 0 |
| feed-card | p21 | yes | 0 | 0 | 0 | 0 |
| post-modal | p21 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p21 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p21 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p21 | yes | 0 | 0 | 0 | 0 |
| event-chats | p21 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p21 | yes | 0 | 0 | 0 | 0 |
| feed-card | p22 | yes | 0 | 0 | 0 | 0 |
| post-modal | p22 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p22 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p22 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p22 | yes | 0 | 0 | 0 | 0 |
| event-chats | p22 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p22 | yes | 0 | 0 | 0 | 0 |
| feed-card | p23 | yes | 0 | 0 | 0 | 0 |
| post-modal | p23 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p23 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p23 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p23 | yes | 0 | 0 | 0 | 0 |
| event-chats | p23 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p23 | yes | 0 | 0 | 0 | 0 |
| feed-card | p24 | yes | 0 | 0 | 0 | 0 |
| post-modal | p24 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p24 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p24 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p24 | yes | 0 | 0 | 0 | 0 |
| event-chats | p24 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p24 | yes | 0 | 0 | 0 | 0 |
| feed-card | p25 | yes | 0 | 0 | 0 | 0 |
| post-modal | p25 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p25 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p25 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p25 | yes | 0 | 0 | 0 | 0 |
| event-chats | p25 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p25 | yes | 0 | 0 | 0 | 0 |
| feed-card | p26 | yes | 0 | 0 | 0 | 0 |
| post-modal | p26 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p26 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p26 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p26 | yes | 0 | 0 | 0 | 0 |
| event-chats | p26 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p26 | yes | 0 | 0 | 0 | 0 |
| feed-card | p27 | yes | 0 | 0 | 0 | 0 |
| post-modal | p27 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p27 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p27 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p27 | yes | 0 | 0 | 0 | 0 |
| event-chats | p27 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p27 | yes | 0 | 0 | 0 | 0 |
| feed-card | p28 | yes | 0 | 0 | 0 | 0 |
| post-modal | p28 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p28 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p28 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p28 | yes | 0 | 0 | 0 | 0 |
| event-chats | p28 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p28 | yes | 0 | 0 | 0 | 0 |
| feed-card | p29 | yes | 0 | 0 | 0 | 0 |
| post-modal | p29 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p29 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p29 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p29 | yes | 0 | 0 | 0 | 0 |
| event-chats | p29 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p29 | yes | 0 | 0 | 0 | 0 |
| feed-card | p30 | yes | 0 | 0 | 0 | 0 |
| post-modal | p30 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p30 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p30 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p30 | yes | 0 | 0 | 0 | 0 |
| event-chats | p30 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p30 | yes | 0 | 0 | 0 | 0 |
| feed-card | p31 | yes | 0 | 0 | 0 | 0 |
| post-modal | p31 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p31 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p31 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p31 | yes | 0 | 0 | 0 | 0 |
| event-chats | p31 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p31 | yes | 0 | 0 | 0 | 0 |
| feed-card | p32 | yes | 0 | 0 | 0 | 0 |
| post-modal | p32 | yes | 0 | 0 | 0 | 0 |
| collab-payload | p32 | yes | 0 | 0 | 0 | 0 |
| article-viewer | p32 | yes | 0 | 0 | 0 | 0 |
| event-flyer | p32 | yes | 0 | 0 | 0 | 0 |
| event-chats | p32 | yes | 0 | 0 | 0 | 0 |
| saved-grid | p32 | yes | 0 | 0 | 0 | 0 |
| feed-card | m01 | yes | 0 | 0 | 0 | 0 |
| post-modal | m01 | yes | 0 | 0 | 0 | 0 |
| collab-payload | m01 | yes | 0 | 0 | 0 | 0 |
| article-viewer | m01 | yes | 0 | 0 | 0 | 0 |
| event-flyer | m01 | yes | 0 | 0 | 0 | 0 |
| event-chats | m01 | yes | 0 | 0 | 0 | 0 |
| saved-grid | m01 | yes | 0 | 0 | 0 | 0 |
| feed-card | m02 | yes | 0 | 0 | 0 | 0 |
| post-modal | m02 | yes | 0 | 0 | 0 | 0 |
| collab-payload | m02 | yes | 0 | 0 | 0 | 0 |
| article-viewer | m02 | yes | 0 | 0 | 0 | 0 |
| event-flyer | m02 | yes | 0 | 0 | 0 | 0 |
| event-chats | m02 | yes | 0 | 0 | 0 | 0 |
| saved-grid | m02 | yes | 0 | 0 | 0 | 0 |
| feed-card | m03 | yes | 0 | 0 | 0 | 0 |
| post-modal | m03 | yes | 0 | 0 | 0 | 0 |
| collab-payload | m03 | yes | 0 | 0 | 0 | 0 |
| article-viewer | m03 | yes | 0 | 0 | 0 | 0 |
| event-flyer | m03 | yes | 0 | 0 | 0 | 0 |
| event-chats | m03 | yes | 0 | 0 | 0 | 0 |
| saved-grid | m03 | yes | 0 | 0 | 0 | 0 |
| feed-card | m04 | yes | 0 | 0 | 0 | 0 |
| post-modal | m04 | yes | 0 | 0 | 0 | 0 |
| collab-payload | m04 | yes | 0 | 0 | 0 | 0 |
| article-viewer | m04 | yes | 0 | 0 | 0 | 0 |
| event-flyer | m04 | yes | 0 | 0 | 0 | 0 |
| event-chats | m04 | yes | 0 | 0 | 0 | 0 |
| saved-grid | m04 | yes | 0 | 0 | 0 | 0 |
| feed-card | m05 | yes | 0 | 0 | 0 | 0 |
| post-modal | m05 | yes | 0 | 0 | 0 | 0 |
| collab-payload | m05 | yes | 0 | 0 | 0 | 0 |
| article-viewer | m05 | yes | 0 | 0 | 0 | 0 |
| event-flyer | m05 | yes | 0 | 0 | 0 | 0 |
| event-chats | m05 | yes | 0 | 0 | 0 | 0 |
| saved-grid | m05 | yes | 0 | 0 | 0 | 0 |
| feed-card | m06 | yes | 0 | 0 | 0 | 0 |
| post-modal | m06 | yes | 0 | 0 | 0 | 0 |
| collab-payload | m06 | yes | 0 | 0 | 0 | 0 |
| article-viewer | m06 | yes | 0 | 0 | 0 | 0 |
| event-flyer | m06 | yes | 0 | 0 | 0 | 0 |
| event-chats | m06 | yes | 0 | 0 | 0 | 0 |
| saved-grid | m06 | yes | 0 | 0 | 0 | 0 |
| feed-card | m07 | yes | 0 | 0 | 0 | 0 |
| post-modal | m07 | yes | 0 | 0 | 0 | 0 |
| collab-payload | m07 | yes | 0 | 0 | 0 | 0 |
| article-viewer | m07 | yes | 0 | 0 | 0 | 0 |
| event-flyer | m07 | yes | 0 | 0 | 0 | 0 |
| event-chats | m07 | yes | 0 | 0 | 0 | 0 |
| saved-grid | m07 | yes | 0 | 0 | 0 | 0 |
| feed-card | m08 | yes | 0 | 0 | 0 | 0 |
| post-modal | m08 | yes | 0 | 0 | 0 | 0 |
| collab-payload | m08 | yes | 0 | 0 | 0 | 0 |
| article-viewer | m08 | yes | 0 | 0 | 0 | 0 |
| event-flyer | m08 | yes | 0 | 0 | 0 | 0 |
| event-chats | m08 | yes | 0 | 0 | 0 | 0 |
| saved-grid | m08 | yes | 0 | 0 | 0 | 0 |
| feed-card | m09 | yes | 0 | 0 | 0 | 0 |
| post-modal | m09 | yes | 0 | 0 | 0 | 0 |
| collab-payload | m09 | yes | 0 | 0 | 0 | 0 |
| article-viewer | m09 | yes | 0 | 0 | 0 | 0 |
| event-flyer | m09 | yes | 0 | 0 | 0 | 0 |
| event-chats | m09 | yes | 0 | 0 | 0 | 0 |
| saved-grid | m09 | yes | 0 | 0 | 0 | 0 |
| article-url | url-javascript | yes | 0 | 0 | 0 | 0 | <!-- http://127.0.0.1:8765/profile.html?slug=leo -->
| article-url | url-http | yes | 0 | 0 | 0 | 0 | <!-- http://127.0.0.1:8765/profile.html?slug=leo -->
| culture-card | p01 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p01 | yes | 0 | 0 | 0 | 0 |
| culture-card | p02 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p02 | yes | 0 | 0 | 0 | 0 |
| culture-card | p03 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p03 | yes | 0 | 0 | 0 | 0 |
| culture-card | p04 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p04 | yes | 0 | 0 | 0 | 0 |
| culture-card | p05 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p05 | yes | 0 | 0 | 0 | 0 |
| culture-card | p06 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p06 | yes | 0 | 0 | 0 | 0 |
| culture-card | p07 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p07 | yes | 0 | 0 | 0 | 0 |
| culture-card | p08 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p08 | yes | 0 | 0 | 0 | 0 |
| culture-card | p09 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p09 | yes | 0 | 0 | 0 | 0 |
| culture-card | p10 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p10 | yes | 0 | 0 | 0 | 0 |
| culture-card | p11 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p11 | yes | 0 | 0 | 0 | 0 |
| culture-card | p12 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p12 | yes | 0 | 0 | 0 | 0 |
| culture-card | p13 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p13 | yes | 0 | 0 | 0 | 0 |
| culture-card | p14 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p14 | yes | 0 | 0 | 0 | 0 |
| culture-card | p15 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p15 | yes | 0 | 0 | 0 | 0 |
| culture-card | p16 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p16 | yes | 0 | 0 | 0 | 0 |
| culture-card | p17 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p17 | yes | 0 | 0 | 0 | 0 |
| culture-card | p18 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p18 | yes | 0 | 0 | 0 | 0 |
| culture-card | p19 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p19 | yes | 0 | 0 | 0 | 0 |
| culture-card | p20 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p20 | yes | 0 | 0 | 0 | 0 |
| culture-card | p21 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p21 | yes | 0 | 0 | 0 | 0 |
| culture-card | p22 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p22 | yes | 0 | 0 | 0 | 0 |
| culture-card | p23 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p23 | yes | 0 | 0 | 0 | 0 |
| culture-card | p24 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p24 | yes | 0 | 0 | 0 | 0 |
| culture-card | p25 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p25 | yes | 0 | 0 | 0 | 0 |
| culture-card | p26 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p26 | yes | 0 | 0 | 0 | 0 |
| culture-card | p27 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p27 | yes | 0 | 0 | 0 | 0 |
| culture-card | p28 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p28 | yes | 0 | 0 | 0 | 0 |
| culture-card | p29 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p29 | yes | 0 | 0 | 0 | 0 |
| culture-card | p30 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p30 | yes | 0 | 0 | 0 | 0 |
| culture-card | p31 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p31 | yes | 0 | 0 | 0 | 0 |
| culture-card | p32 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | p32 | yes | 0 | 0 | 0 | 0 |
| culture-card | m01 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | m01 | yes | 0 | 0 | 0 | 0 |
| culture-card | m02 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | m02 | yes | 0 | 0 | 0 | 0 |
| culture-card | m03 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | m03 | yes | 0 | 0 | 0 | 0 |
| culture-card | m04 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | m04 | yes | 0 | 0 | 0 | 0 |
| culture-card | m05 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | m05 | yes | 0 | 0 | 0 | 0 |
| culture-card | m06 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | m06 | yes | 0 | 0 | 0 | 0 |
| culture-card | m07 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | m07 | yes | 0 | 0 | 0 | 0 |
| culture-card | m08 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | m08 | yes | 0 | 0 | 0 | 0 |
| culture-card | m09 | yes | 0 | 0 | 0 | 0 |
| culture-overlay | m09 | yes | 0 | 0 | 0 | 0 |
| connect-card | p01 | yes | 0 | 0 | 0 | 0 |
| connect-card | p02 | yes | 0 | 0 | 0 | 0 |
| connect-card | p03 | yes | 0 | 0 | 0 | 0 |
| connect-card | p04 | yes | 0 | 0 | 0 | 0 |
| connect-card | p05 | yes | 0 | 0 | 0 | 0 |
| connect-card | p06 | yes | 0 | 0 | 0 | 0 |
| connect-card | p07 | yes | 0 | 0 | 0 | 0 |
| connect-card | p08 | yes | 0 | 0 | 0 | 0 |
| connect-card | p09 | yes | 0 | 0 | 0 | 0 |
| connect-card | p10 | yes | 0 | 0 | 0 | 0 |
| connect-card | p11 | yes | 0 | 0 | 0 | 0 |
| connect-card | p12 | yes | 0 | 0 | 0 | 0 |
| connect-card | p13 | yes | 0 | 0 | 0 | 0 |
| connect-card | p14 | yes | 0 | 0 | 0 | 0 |
| connect-card | p15 | yes | 0 | 0 | 0 | 0 |
| connect-card | p16 | yes | 0 | 0 | 0 | 0 |
| connect-card | p17 | yes | 0 | 0 | 0 | 0 |
| connect-card | p18 | yes | 0 | 0 | 0 | 0 |
| connect-card | p19 | yes | 0 | 0 | 0 | 0 |
| connect-card | p20 | yes | 0 | 0 | 0 | 0 |
| connect-card | p21 | yes | 0 | 0 | 0 | 0 |
| connect-card | p22 | yes | 0 | 0 | 0 | 0 |
| connect-card | p23 | yes | 0 | 0 | 0 | 0 |
| connect-card | p24 | yes | 0 | 0 | 0 | 0 |
| connect-card | p25 | yes | 0 | 0 | 0 | 0 |
| connect-card | p26 | yes | 0 | 0 | 0 | 0 |
| connect-card | p27 | yes | 0 | 0 | 0 | 0 |
| connect-card | p28 | yes | 0 | 0 | 0 | 0 |
| connect-card | p29 | yes | 0 | 0 | 0 | 0 |
| connect-card | p30 | yes | 0 | 0 | 0 | 0 |
| connect-card | p31 | yes | 0 | 0 | 0 | 0 |
| connect-card | p32 | yes | 0 | 0 | 0 | 0 |
| connect-card | m01 | yes | 0 | 0 | 0 | 0 |
| connect-card | m02 | yes | 0 | 0 | 0 | 0 |
| connect-card | m03 | yes | 0 | 0 | 0 | 0 |
| connect-card | m04 | yes | 0 | 0 | 0 | 0 |
| connect-card | m05 | yes | 0 | 0 | 0 | 0 |
| connect-card | m06 | yes | 0 | 0 | 0 | 0 |
| connect-card | m07 | yes | 0 | 0 | 0 | 0 |
| connect-card | m08 | yes | 0 | 0 | 0 | 0 |
| connect-card | m09 | yes | 0 | 0 | 0 | 0 |
| comments | p01 | yes | 0 | 0 | 0 | 0 |
| post_comments | p01 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p02 | yes | 0 | 0 | 0 | 0 |
| post_comments | p02 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p03 | yes | 0 | 0 | 0 | 0 |
| post_comments | p03 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p04 | yes | 0 | 0 | 0 | 0 |
| post_comments | p04 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p05 | yes | 0 | 0 | 0 | 0 |
| post_comments | p05 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p06 | yes | 0 | 0 | 0 | 0 |
| post_comments | p06 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p07 | yes | 0 | 0 | 0 | 0 |
| post_comments | p07 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p08 | yes | 0 | 0 | 0 | 0 |
| post_comments | p08 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p09 | yes | 0 | 0 | 0 | 0 |
| post_comments | p09 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p10 | yes | 0 | 0 | 0 | 0 |
| post_comments | p10 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p11 | yes | 0 | 0 | 0 | 0 |
| post_comments | p11 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p12 | yes | 0 | 0 | 0 | 0 |
| post_comments | p12 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p13 | yes | 0 | 0 | 0 | 0 |
| post_comments | p13 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p14 | yes | 0 | 0 | 0 | 0 |
| post_comments | p14 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p15 | yes | 0 | 0 | 0 | 0 |
| post_comments | p15 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p16 | yes | 0 | 0 | 0 | 0 |
| post_comments | p16 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p17 | yes | 0 | 0 | 0 | 0 |
| post_comments | p17 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p18 | yes | 0 | 0 | 0 | 0 |
| post_comments | p18 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p19 | yes | 0 | 0 | 0 | 0 |
| post_comments | p19 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p20 | yes | 0 | 0 | 0 | 0 |
| post_comments | p20 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p21 | yes | 0 | 0 | 0 | 0 |
| post_comments | p21 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p22 | yes | 0 | 0 | 0 | 0 |
| post_comments | p22 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p23 | yes | 0 | 0 | 0 | 0 |
| post_comments | p23 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p24 | yes | 0 | 0 | 0 | 0 |
| post_comments | p24 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p25 | yes | 0 | 0 | 0 | 0 |
| post_comments | p25 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p26 | yes | 0 | 0 | 0 | 0 |
| post_comments | p26 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p27 | yes | 0 | 0 | 0 | 0 |
| post_comments | p27 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p28 | yes | 0 | 0 | 0 | 0 |
| post_comments | p28 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p29 | yes | 0 | 0 | 0 | 0 |
| post_comments | p29 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p30 | yes | 0 | 0 | 0 | 0 |
| post_comments | p30 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p31 | yes | 0 | 0 | 0 | 0 |
| post_comments | p31 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | p32 | yes | 0 | 0 | 0 | 0 |
| post_comments | p32 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | m01 | yes | 0 | 0 | 0 | 0 |
| post_comments | m01 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | m02 | yes | 0 | 0 | 0 | 0 |
| post_comments | m02 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | m03 | yes | 0 | 0 | 0 | 0 |
| post_comments | m03 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | m04 | yes | 0 | 0 | 0 | 0 |
| post_comments | m04 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | m05 | yes | 0 | 0 | 0 | 0 |
| post_comments | m05 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | m06 | yes | 0 | 0 | 0 | 0 |
| post_comments | m06 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | m07 | yes | 0 | 0 | 0 | 0 |
| post_comments | m07 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | m08 | yes | 0 | 0 | 0 | 0 |
| post_comments | m08 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| comments | m09 | yes | 0 | 0 | 0 | 0 |
| post_comments | m09 | no | 0 | 0 | 0 | 0 | <!-- no client query in 97c78f7a -->
| profile-bio | p01 | yes | 0 | 0 | 0 | 0 |
| profile-name | p01 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p01 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p02 | yes | 0 | 0 | 0 | 0 |
| profile-name | p02 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p02 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p03 | yes | 0 | 0 | 0 | 0 |
| profile-name | p03 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p03 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p04 | yes | 0 | 0 | 0 | 0 |
| profile-name | p04 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p04 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p05 | yes | 0 | 0 | 0 | 0 |
| profile-name | p05 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p05 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p06 | yes | 0 | 0 | 0 | 0 |
| profile-name | p06 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p06 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p07 | yes | 0 | 0 | 0 | 0 |
| profile-name | p07 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p07 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p08 | yes | 0 | 0 | 0 | 0 |
| profile-name | p08 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p08 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p09 | yes | 0 | 0 | 0 | 0 |
| profile-name | p09 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p09 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p10 | yes | 0 | 0 | 0 | 0 |
| profile-name | p10 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p10 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p11 | yes | 0 | 0 | 0 | 0 |
| profile-name | p11 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p11 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p12 | yes | 0 | 0 | 0 | 0 |
| profile-name | p12 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p12 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p13 | yes | 0 | 0 | 0 | 0 |
| profile-name | p13 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p13 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p14 | yes | 0 | 0 | 0 | 0 |
| profile-name | p14 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p14 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p15 | yes | 0 | 0 | 0 | 0 |
| profile-name | p15 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p15 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p16 | yes | 0 | 0 | 0 | 0 |
| profile-name | p16 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p16 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p17 | yes | 0 | 0 | 0 | 0 |
| profile-name | p17 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p17 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p18 | yes | 0 | 0 | 0 | 0 |
| profile-name | p18 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p18 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p19 | yes | 0 | 0 | 0 | 0 |
| profile-name | p19 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p19 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p20 | yes | 0 | 0 | 0 | 0 |
| profile-name | p20 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p20 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p21 | yes | 0 | 0 | 0 | 0 |
| profile-name | p21 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p21 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p22 | yes | 0 | 0 | 0 | 0 |
| profile-name | p22 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p22 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p23 | yes | 0 | 0 | 0 | 0 |
| profile-name | p23 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p23 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p24 | yes | 0 | 0 | 0 | 0 |
| profile-name | p24 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p24 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p25 | yes | 0 | 0 | 0 | 0 |
| profile-name | p25 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p25 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p26 | yes | 0 | 0 | 0 | 0 |
| profile-name | p26 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p26 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p27 | yes | 0 | 0 | 0 | 0 |
| profile-name | p27 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p27 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p28 | yes | 0 | 0 | 0 | 0 |
| profile-name | p28 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p28 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p29 | yes | 0 | 0 | 0 | 0 |
| profile-name | p29 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p29 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p30 | yes | 0 | 0 | 0 | 0 |
| profile-name | p30 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p30 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p31 | yes | 0 | 0 | 0 | 0 |
| profile-name | p31 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p31 | yes | 0 | 0 | 0 | 0 |
| profile-bio | p32 | yes | 0 | 0 | 0 | 0 |
| profile-name | p32 | yes | 0 | 0 | 0 | 0 |
| profile-socials | p32 | yes | 0 | 0 | 0 | 0 |
| profile-bio | m01 | yes | 0 | 0 | 0 | 0 |
| profile-name | m01 | yes | 0 | 0 | 0 | 0 |
| profile-socials | m01 | yes | 0 | 0 | 0 | 0 |
| profile-bio | m02 | yes | 0 | 0 | 0 | 0 |
| profile-name | m02 | yes | 0 | 0 | 0 | 0 |
| profile-socials | m02 | yes | 0 | 0 | 0 | 0 |
| profile-bio | m03 | yes | 0 | 0 | 0 | 0 |
| profile-name | m03 | yes | 0 | 0 | 0 | 0 |
| profile-socials | m03 | yes | 0 | 0 | 0 | 0 |
| profile-bio | m04 | yes | 0 | 0 | 0 | 0 |
| profile-name | m04 | yes | 0 | 0 | 0 | 0 |
| profile-socials | m04 | yes | 0 | 0 | 0 | 0 |
| profile-bio | m05 | yes | 0 | 0 | 0 | 0 |
| profile-name | m05 | yes | 0 | 0 | 0 | 0 |
| profile-socials | m05 | yes | 0 | 0 | 0 | 0 |
| profile-bio | m06 | yes | 0 | 0 | 0 | 0 |
| profile-name | m06 | yes | 0 | 0 | 0 | 0 |
| profile-socials | m06 | yes | 0 | 0 | 0 | 0 |
| profile-bio | m07 | yes | 0 | 0 | 0 | 0 |
| profile-name | m07 | yes | 0 | 0 | 0 | 0 |
| profile-socials | m07 | yes | 0 | 0 | 0 | 0 |
| profile-bio | m08 | yes | 0 | 0 | 0 | 0 |
| profile-name | m08 | yes | 0 | 0 | 0 | 0 |
| profile-socials | m08 | yes | 0 | 0 | 0 | 0 |
| profile-bio | m09 | yes | 0 | 0 | 0 | 0 |
| profile-name | m09 | yes | 0 | 0 | 0 | 0 |
| profile-socials | m09 | yes | 0 | 0 | 0 | 0 |

## Dialogs

None.

## Requests

### profile
Supabase stubs: 18

```
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/blog_articles
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/profile_owners
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/rpc/get_profile_stats
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/profile_meta
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/platform_config
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/auth/v1/user
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/profile_content
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/follows
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/post_collaborators
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/rpc/get_my_tickets
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/rpc/get_profile_events
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/user_playlists
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/rpc/my_profile_slug
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/post_likes
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/post_reshares
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/post_saves
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/collections
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/rpc/my_ticketed_event_chats
```

Outbound aborted: 21; new versus baseline: 0

- GET https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Grotesk:wght@300;400;500;600;700&display=swap
- GET https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.11.0/dist/tf.min.js
- GET https://cdn.jsdelivr.net/npm/nsfwjs@3.0.0/dist/nsfwjs.min.js
- GET https://images.ra.co/2c2d88660d652f135f06de3887251e7f8565203a.jpg
- GET https://images.ra.co/288b5245302955ed0864e6f9dad31af0a092984c.jpg
- GET https://images.ra.co/1641a2b8fddcee60bb204595abe0a3f20d8a0e51.jpg
- GET https://images.ra.co/1bfc214a7b4917efac1afad318fd4dafa631a480.jpg
- GET https://images.ra.co/0eb69717593e6bb32225fec905e93762454a7894.jpg
- GET https://images.ra.co/234c570dd0c0ce4c93d62945d502ef1952b2cf31.jpg
- GET https://images.ra.co/233912b5340b79213e16e58647ecd297165d0a52.jpg
- GET https://www.googletagmanager.com/gtag/js?id=G-ZR36NRE4MT
- GET https://www.clarity.ms/tag/xk5iwishve

Console:
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- warning: The keyword 'slider-vertical' specified to an 'appearance' property is not standardized. It will be removed in the future. Use <input type=range style="writing-mode: vertical-lr; direction: rtl"> instead.
- warning: The keyword 'slider-vertical' specified to an 'appearance' property is not standardized. It will be removed in the future. Use <input type=range style="writing-mode: vertical-lr; direction: rtl"> instead.
- warning: [keepitil-shell] no icon named "profile"
- warning: GoTrueClient@sb-ovmqtzjfpzrbzrlkxwgw-auth-token:1 (2.112.3) 2026-11-07T10:08:50.765Z Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior w
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- pageerror: SecurityError: Failed to read the 'localStorage' property from 'Window': Access is denied for this document.

### culture
Supabase stubs: 9

```
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/rpc/culture_page_stats
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/auth/v1/user
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/rpc/my_profile_slug
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/rpc/get_culture_feed
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/videos
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/blog_articles
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/follows
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/post_likes
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/post_reshares
```

Outbound aborted: 4; new versus baseline: 0

- GET https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800;900&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900&display=swap
- GET https://www.googletagmanager.com/gtag/js?id=G-ZR36NRE4MT
- GET https://www.clarity.ms/tag/xk5iwishve
- GET https://keepitil.com/icon-192.png

Console:
- error: Failed to load resource: net::ERR_FAILED
- warning: [keepitil-shell] no icon named "profile"
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- warning: GoTrueClient@sb-ovmqtzjfpzrbzrlkxwgw-auth-token:1 (2.112.3) 2026-11-07T10:08:52.126Z Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior w
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: the server responded with a status of 404 (Not Found)
- error: Failed to load resource: the server responded with a status of 404 (Not Found)
- error: Failed to load resource: the server responded with a status of 404 (Not Found)
- error: Failed to load resource: the server responded with a status of 404 (Not Found)
- error: Failed to load resource: the server responded with a status of 404 (Not Found)
- error: Failed to load resource: the server responded with a status of 404 (Not Found)
- error: Failed to load resource: the server responded with a status of 404 (Not Found)
- error: Failed to load resource: the server responded with a status of 404 (Not Found)
- error: Failed to load resource: the server responded with a status of 404 (Not Found)
- error: Failed to load resource: the server responded with a status of 404 (Not Found)
- error: Failed to load resource: the server responded with a status of 404 (Not Found)
- error: Failed to load resource: the server responded with a status of 404 (Not Found)
- error: Failed to load resource: the server responded with a status of 404 (Not Found)
- error: Failed to load resource: the server responded with a status of 404 (Not Found)

### connect
Supabase stubs: 11

```
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/profile_meta
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/blog_articles
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/venues
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/platform_config
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/auth/v1/user
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/user_playlists
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/rpc/my_profile_slug
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/community_members
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/app_users
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/community_topics
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/communities
```

Outbound aborted: 5; new versus baseline: 0

- GET https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap
- GET https://docs.google.com/spreadsheets/d/1UU2rPPwsIRCFnZBgk6Uzb9IRcckcBmvYVORNVMFtIoo/gviz/tq?sheet=Untitled&headers=1&tqx=out:json
- GET https://www.googletagmanager.com/gtag/js?id=G-ZR36NRE4MT
- GET https://www.clarity.ms/tag/xk5iwishve
- GET https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fillestrated-lifestyle&color=%2300ff88&auto_play=true&buying=false&liking=false&download=false&sharing=false&show_artwork=false&show_comments=false&show_playcount=false&show_user=false&hide_related=true&continuous_play=true&single_ac

Console:
- error: Failed to load resource: net::ERR_FAILED
- warning: The keyword 'slider-vertical' specified to an 'appearance' property is not standardized. It will be removed in the future. Use <input type=range style="writing-mode: vertical-lr; direction: rtl"> instead.
- warning: The keyword 'slider-vertical' specified to an 'appearance' property is not standardized. It will be removed in the future. Use <input type=range style="writing-mode: vertical-lr; direction: rtl"> instead.
- warning: [keepitil-shell] no icon named "profile"
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- pageerror: SecurityError: Failed to read the 'localStorage' property from 'Window': Access is denied for this document.
- warning: GoTrueClient@sb-ovmqtzjfpzrbzrlkxwgw-auth-token:1 (2.112.3) 2026-11-07T10:08:53.065Z Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior w

### comments
Supabase stubs: 8

```
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/community_culture_links
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/platform_config
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/rpc/social_counts
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/social_actions
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/auth/v1/user
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/rpc/my_profile_slug
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/user_playlists
https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/comments
```

Outbound aborted: 4; new versus baseline: 0

- GET https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,900&family=Inter:wght@400;500;600;700;800;900&display=swap
- GET https://www.googletagmanager.com/gtag/js?id=G-ZR36NRE4MT
- GET https://www.clarity.ms/tag/xk5iwishve
- GET https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fillestrated-lifestyle&color=%2300ff88&auto_play=true&buying=false&liking=false&download=false&sharing=false&show_artwork=false&show_comments=false&show_playcount=false&show_user=false&hide_related=true&continuous_play=true&single_ac

Console:
- warning: The value "no.0" for key "user-scalable" is invalid, and has been ignored.
- error: Failed to load resource: net::ERR_FAILED
- warning: [keepitil-shell] no icon named "profile"
- warning: The keyword 'slider-vertical' specified to an 'appearance' property is not standardized. It will be removed in the future. Use <input type=range style="writing-mode: vertical-lr; direction: rtl"> instead.
- warning: The keyword 'slider-vertical' specified to an 'appearance' property is not standardized. It will be removed in the future. Use <input type=range style="writing-mode: vertical-lr; direction: rtl"> instead.
- error: Failed to load resource: net::ERR_FAILED
- error: Failed to load resource: net::ERR_FAILED
- pageerror: SecurityError: Failed to read the 'localStorage' property from 'Window': Access is denied for this document.

Profile drive: articles 84, collabs 82, owns true, href `http://127.0.0.1:8765/profile.html?slug=leo`, notes [].
Event-chat HTML loaded: yes.
