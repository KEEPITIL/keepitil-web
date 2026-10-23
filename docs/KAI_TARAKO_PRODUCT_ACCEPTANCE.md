# Kai Tarako — product quality and learning acceptance plan
**Owner direction:** deliver a complete, efficient, visually polished early-alphabet and beginner-word learning app, based on the **approved Kai Tarako artwork**, without spending money or risking other KEEPITIL apps. This is a development directive, not approval to launch or change production.

## Baseline — verified vs reported (2026-10-23)
- Kode reports **94 lessons** (5 shapes, 26 uppercase, 26 lowercase, 26 letter pairs, 11 starter words), **538 automated tests**, and **$0.00** new spend. These are reported test results, not device acceptance.
- Published bundle inspected in `/app/kaitarako/`: `brand/logo.webp` (56,320 bytes), eight mascot pose/badge WebP files, app icons, one main JavaScript bundle and one CSS bundle.
- Existing branding uses the approved mascot and palette, with the public name **Kai Tarako** and tagline **Learn · Trace · Grow**. Preserve the original approved child-facing artwork; do not redraw or replace it without approval.
- The core has tracing, modes and limited beginner words. It is **not yet proven** that children can learn letter recognition, phonemes, word meaning and reading from the existing tracing curriculum alone.
- Real iPhone finger-gesture testing, spoken-audio listening, 14-day storage retention and child-privacy approval are pending. Service-worker safety draft is [website PR #16](https://github.com/KEEPITIL/keepitil-web/pull/16).
- Source project is separate/private `KEEPITIL/kai-tarako`; all lesson/design code changes belong **in the source project**, never in minified public bundles.

## P0 — do not compromise safety
1. No new tracking, accounts, online child profiles, network telemetry, paid subscriptions, marketing, or third-party assets requiring charges. Preserve ZERO_COST_MODE.
2. Keep production/release **unapproved** until the owner reviews test evidence, rights/consent for public child-facing artwork, a child-specific privacy assessment, and the real-device experience. A `noindex` preview is still publicly accessible.
3. Complete shared CacheStorage cleanup tests across root KEEPITIL, TUITEA, KWARS, KMOB and Kai Tarako before merging root service-worker changes; preserve older app data and PWA offline caches.
4. Maintain local progress, private caregiver control, erase-all, backup/import compatibility, and scope all worker/storage effects to Kai Tarako only.
5. Do not register a separate NEXUS app or give privileged permissions without specific owner authorization.

## P1 — make the app teach, not just trace
Implement a short, gentle learning loop **See → Hear → Try → Celebrate → Review**, available in age/ability-appropriate selectable levels. Existing lessons must remain functional.

| Activity | Essential learner capabilities | Completion evidence |
| --- | --- | --- |
| **Look & Listen** | Name recognition of both cases, matching capital to lowercase, identifying letter from 2 choices; hear **letter name** and **letter sound** separately, with replay. | Human-audited phoneme/letter-name audio, no wrong sound/letter mapping, offline fallback. |
| **Trace & Discover** | Guided stroke order with big stable letter, clear start dot, lift/resume tolerance, Assisted/Standard/Advanced, gentle correction. | Wobbly finger success, legitimate stroke checks, no board resizing during touch; all 52 glyphs verified. |
| **Pictures & Words** | Familiar object illustrations and spoken labels, picture ↔ word match, choose 2 then 3, repeat familiar meaningful words, simple regular CVC blend only when learner is ready. | Child can recognize meaning from a picture and a spoken **whole word**, not just recite letter names. |
| **Read Together** | Simple picture-supported phrases/cards, repeatable narration, optional adult guidance, recognition review. | Words taught match words reused, with explicit comprehension prompts and replay. |

Do not force a fixed order or gate all content behind tracing; children who have limited fine-motor control still need successful listening, identifying and matching activities. Avoid requiring spoken responses. Avoid long lessons or mandatory streaks; repetition should feel positive. Caregiver can repeat, skip, choose start level and view progress **by skill**, not just number of traces.

Suggested starter concepts: useful family- and daily-life words, familiar objects, beginner consonant-vowel-consonant words, and personally meaningful but **non-identifying** examples. Do not claim mastery from a traced line alone.

## P1 — approved-art visual system
- Audit/reuse original logo/lettering, star, approved mascot poses, badges and tagline. Keep brand lettering editable separately from mascot art when practical.
- Make an approved asset inventory for every screen: home, letter, trace, image/word match, feedback, adult gate, offline/install, and icons. Mark actual vs missing assets. No stock-style mismatch, default emoji or generic grid-only game look.
- Uniform gentle color palette, rounded dimensional controls, clean visual hierarchy and large readable type. Learning target first, mascot secondary. Color must **not** be sole indicator of meaning.
- Fixed-size mascot pose container, zero layout shift on first touch, clear safe-area handling, ≥44×44 CSS px interactive targets, readable on 320×568 and 375×812, and orientation/accessibility checks.
- Optional reduced motion, no distracting celebration blocking tracing, no time pressure, no ads or manipulative rewards.
- Missing vocabulary illustrations require a proposed free/licensed asset plan and owner-approved styling before inclusion; do not use new family photographs or unapproved personal imagery.

## P1 — performance, PWA and QA
- Document main bundle, image asset, total offline storage, memory footprint, load time, and interaction delay on the **actual iPhone**; optimize original WebP assets and avoid downloading hidden decorative art before first use. Retain no analytics.
- Target smooth **60-fps-class** gesture tracking where the device supports it; measure and fix jank rather than claiming a frame rate from a desktop test. No board movement under a finger.
- Test first-use network load, installed PWA reopen, zero-connection home and lessons, voice replay/fallback, orientation, small viewports, audio-muted/voice-unavailable behavior, interrupted gestures, and return after 14 days.
- Physically listen to every letter name, beginner phoneme and word; explicitly check `R`, `G`, `W`, `H`, `Z`, `CAT` and `KAI`. Use US English **zee**. Device speech synthesis must not be assumed identical to actual voiced quality.
- Automated touch testing and reproducible regression tests remain mandatory but **cannot substitute for parent/educator observation with a child**.

## Acceptance deliverables and release gates
1. Complete visual/brand asset map showing used and missing assets; screenshots at small iPhone, standard iPhone and landscape.
2. Skills map and content inventory: A–Z capital/lowercase, sounds vs names, beginner words, pictures, word meaning, review; no absent asset quietly replaced by a placeholder.
3. Performance evidence: captured load/storage/frame metrics, network request inventory, offline PWA verification.
4. Accessible real-iPhone session with adult observation notes and 14-day retention result.
5. Child privacy review and rights check for existing artwork; no release before explicit owner approval.
6. A single **pass/fail table** with reproducible evidence, known limitations and owners for remaining issues.
7. Preserve present preview and historical builds; rollback plan for any deployment. **Do not merge or publish this directive as product-ready evidence.**

## Reference material for learning rationale
- [WWC: preschool phonological awareness and interactive reading](https://www.readingrockets.org/topics/preschool-and-child-care/articles/preschool-language-and-literacy-practices)
- [IES: picture + familiar key word + sound-letter instruction](https://ies.ed.gov/learn/blog/enhancing-reading-instruction-children-down-syndrome)
- [DSE International: integrated reading, language, visual support, meaning and phonics](https://www.down-syndrome.org/en-us/research/projects/reading-language-intervention/design/)

**Authority:** This document is a task and acceptance brief. No public launch, billing, production merge, NEXUS enrollment, or expense is authorized by it.
