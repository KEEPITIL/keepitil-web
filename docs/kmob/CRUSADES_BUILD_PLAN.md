# KMOB Crusades — owner-approved build kickoff (2026-10-24)

**Status:** Implementation authorized on a feature branch and KMOB staging. **Public activation, paid changes, and Apple binary changes are not authorized by this brief.**

**Objective:** Build engaging, strategy-led earned progression without any new recurring subscription or net-new hosted service. Reuse the existing KEEPITIL game engine, its current art and Web infrastructure. The owner wants development to proceed quickly while Apple reviews the existing submitted iOS build.

## Product boundaries

- Three campaigns, six Crusades, 30 missions: ten missions/campaign, two five-mission Crusades/campaign.
- Campaign 1 (Fallen Kingdom) completion opens Campaign 2 (Nightfall Invasion); Campaign 2 completion opens Campaign 3 (Chaos Wars). Crusades within campaigns unlock in sequence.
- Starting **Crusades-only** loadout: Looter, Archer, basic tank. Teach these while playing Mission 1; do not present a detached tutorial.
- Subsequent earned **Crusades-mode** class unlocks: Melee after Mission 2, Mizard after Mission 4, first tank power-up after Mission 6, Elite after Mission 7, Giant after Mission 9; stage this pacing for QA and revise only after gameplay evidence.
- Never restrict existing Endless War / Daily Defense soldiers, tank upgrades, purchases, previously earned currencies, or account entitlements. A campaign-only unlock is **not** a change to the core roster.
- Mission/Crusade/campaign achievements may unlock permanent earned-only cosmetics; these cannot be purchased, and cosmetic rewards cannot affect ranked combat balance.
- Missions should test resource management, defensive placement, combat timing and composition. Mission-specific loadout twists may be used **after** relevant skills are introduced, but do not turn the campaign into arbitrary repetitive bans.
- Completing a mission (1-star) unlocks the next; 2-/3-star mastery is optional, replayable and does not gate the story.
- Mission victory/unlock/reward state must persist and remain idempotent across restart, offline/reconnect and account sign-in. Security review required before syncing rare earned rewards to a public account.

## Proposed mission catalog (design inputs, not shipped content)

| # | Campaign · Crusade | Mission · tactical learning goal | Completion reward |
|---:|---|---|---|
| 1 | Fallen Kingdom · Border Reclamation | **First Command:** deploy Looters/Archers, control basic tank, learn ATTACK/DEFEND while defending. Short contextual tutorials during actual battle. | First-command banner |
| 2 | Fallen Kingdom · Border Reclamation | **Frontline Gap:** archers need protection; manage economy and timing with starter roster. | **Unlock Melee** |
| 3 | Fallen Kingdom · Border Reclamation | **Gold Rush:** prioritize Looter income and repairs versus deployment. | Progress / mastery cosmetics |
| 4 | Fallen Kingdom · Border Reclamation | **Wounded Line:** handle attrition and understand missing healing support. | **Unlock Mizard** |
| 5 | Fallen Kingdom · Border Reclamation | **Border Captain:** boss victory requiring Looter economy, Archer damage, Melee interception and Mizard healing. | Crusade 1 exclusive skin, unlock Crusade 2 |
| 6 | Fallen Kingdom · Citadel Siege | **Cannon Lesson:** aim and defend the tank at the right time. | **Unlock first tank power-up** |
| 7 | Fallen Kingdom · Citadel Siege | **Heavy Shield:** enemy pressure demands sturdier front line. | **Unlock Elite** |
| 8 | Fallen Kingdom · Citadel Siege | **Siege Supplies:** balance expensive elite troops, looters and upgrades. | Mission-earned cosmetic |
| 9 | Fallen Kingdom · Citadel Siege | **The Breach:** gain access to a powerful frontline class after handling armored threats. | **Unlock Giant** |
| 10 | Fallen Kingdom · Citadel Siege | **Citadel General:** complete-army boss battle across defensive and offensive phases. | Fallen Kingdom exclusive skin, **unlock Campaign 2** |
| 11 | Nightfall Invasion · Zombie Outbreak | **First Infection:** prioritize weak fast swarms and economy. | Campaign 2 progress |
| 12 | Nightfall Invasion · Zombie Outbreak | **Broken Supply:** limited starting resources, Looter recovery. | Mastery cosmetic |
| 13 | Nightfall Invasion · Zombie Outbreak | **Archer Screen:** protected ranged damage against waves. | Mission progress |
| 14 | Nightfall Invasion · Zombie Outbreak | **Last Reinforcement:** manage soldier replacement under pressure. | Mission progress |
| 15 | Nightfall Invasion · Zombie Outbreak | **Outbreak Source:** mixed-threat boss battle. | Crusade 3 earned cosmetic, unlock Crusade 4 |
| 16 | Nightfall Invasion · Haunted Legion | **Haunted Gate:** layered defensive formation. | Mission progress |
| 17 | Nightfall Invasion · Haunted Legion | **Silenced Healers:** protect Mizard under enemy priority targeting. | Mission progress |
| 18 | Nightfall Invasion · Haunted Legion | **Night Watch:** respond to threats with tank and formation commands. | Mastery cosmetic |
| 19 | Nightfall Invasion · Haunted Legion | **Long Retreat:** time DEFEND/ATTACK and recovery. | Mission progress |
| 20 | Nightfall Invasion · Haunted Legion | **Phantom Commander:** endurance boss and coordinated counterattack. | Nightfall exclusive skin, **unlock Campaign 3** |
| 21 | Chaos Wars · Killer Carnival | **Chaos Parade:** adapt to changing enemy archetypes. | Campaign 3 progress |
| 22 | Chaos Wars · Killer Carnival | **False Opening:** punish mistimed attacks, reward discipline. | Mission progress |
| 23 | Chaos Wars · Killer Carnival | **Crossfire:** retarget tank versus mixed threats. | Mastery cosmetic |
| 24 | Chaos Wars · Killer Carnival | **The Grand Act:** budget and formation pressure. | Mission progress |
| 25 | Chaos Wars · Killer Carnival | **Ringmaster:** boss with different attack phases. | Crusade 5 exclusive cosmetic, unlock Crusade 6 |
| 26 | Chaos Wars · Iron Uprising | **Iron Wall:** layered Melee + Elite defense. | Mission progress |
| 27 | Chaos Wars · Iron Uprising | **Hammerfall:** Giant timing, weak rear support protection. | Mission progress |
| 28 | Chaos Wars · Iron Uprising | **Last Gold:** difficult resource allocation. | Mastery cosmetic |
| 29 | Chaos Wars · Iron Uprising | **Final Formation:** all-class tactical mastery against mixed enemy waves. | Mission progress |
| 30 | Chaos Wars · Iron Uprising | **Iron King:** final multiphase boss. | Earned-only campaign/mastery appearance and title |

Boss, encounter and reward specifications need feasibility and balance validation with existing combat engine before implementing them. This catalog is planning data, not evidence of developed missions.

## Speed-and-cost implementation sequence

**A. Inspect + vertical slice (now)**
1. Audit current `games/kmob/`, `games/kmob-staging/` and tests to identify the true game entrypoints, save version, account/reward and purchase paths. Latest observed web repo commit at kickoff: `3ae3ff9` on 2026-10-24; always read fresh HEAD.
2. Use a **data-driven mission schema** (`id`, `campaign`, `crusade`, `objectives`, `roster`, `intro`, `enemyWavePlan`, `reward`, `unlockDependencies`) and share the existing deterministic battle engine; do **not** fork core physics/simulation for missions.
3. Implement Mission 1 with real objective, context prompts, clean win/lose path, replay, tested state. Include a locked preview of subsequent missions.
4. Build tests for gating, unlock grants, replay, persistence, no duplicate awards, old saves, no regression to original modes. Deploy staging only, behind a separate flag.

**B. First Crusade**
5. Implement Missions 2–5 and account-safe earned progress (flag any backend dependencies explicitly). Make Crusade 1 useful and playable before starting the other 25.
6. Measure time per mission, tutorial completion, failure points, asset weight/frame rate on smaller iPhones, and save/resume.

**C. Expansion**
7. Reuse the schema for Missions 6–10; later campaigns follow demonstrated player interest and QA. Do not make 30 bespoke simulators or commission new paid assets.

## Non-negotiable guardrails / Definition of done for each checkpoint

- **Target $0 additional monthly subscription cost**: use existing KEEPITIL Cloudflare plan and database, no extra accounts/Workers Paid upgrades, paid APIs, artwork subscriptions, or services without prior owner approval. Existing usage can still become metered; measure CPU/network/write costs and implement limits/alerts.
- KEEPITIL assets stay on KEEPITIL accounts; NEXUS remains separate.
- Keep production ranked Daily Defense verifier, leaderboard engine parity, War Chants, Endless War, account creation/purchases, War Tokens, Goals, save/resume untouched. **Do not reapply D1.** D6 remains deferred unless separately authorized.
- Do not alter Apple's pending review binary, submit an updated binary, or release in App Store until owner decision after Apple acceptance.
- Regression: current browser suite, logic suite, mobile/desktop layout, save migration/offline, monetization and balance checks, engine determinism and controlled replay/security tests, and low-end device performance.
- Public web release needs owner review of staging demo, confirmed passing acceptance checks and safe rollback. A draft PR is not a deployed feature.
- Deliver: PR and commits, preview URL, tests run/results, battery/frame/CPU metrics as available, true incremental monthly expense exposure, rollback plan and unresolved blockers.

**Implementation assignment:** Kode's active KMOB development session (not a NEXUS account deployment). Owners should not be asked to run commands or manually manage secrets. Keep progress concise and evidence-backed.
