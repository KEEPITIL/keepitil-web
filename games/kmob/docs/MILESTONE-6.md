# KMOB · Mobile warfare rework (milestone 6)

Rule: everything that fights travels with the army. The ground towers and the moving walls and barricades are gone.

- **Command tank:**
  - The main cannon fires on its own at the toughest threat within 24 m; there is no fire button.
  - Upgrade lines: cannon damage, fire rate (2 → 3 barrels), targeting range (mast), HE splash, missile pod (2 → 8 missiles at the toughest targets) and armour.
  - Every line changes the model.
- **Force field:** capacity grows from 60 to 240 over five levels, and recharge and radius have their own upgrades.
  - At 0 it collapses with a burst, stays down for about 7 s, then rebuilds and recharges.
  - The dome shows its own state (bright, flickering, burst, rebuild).
  - A wider radius covers the support vehicles; at level 5 it also absorbs 40% of the damage taken by soldiers inside it.
- **Mobile support vehicles:** gun carrier (the old arrow and sniper roles, crit and precision targeting from L3), artillery, cryo projector and troop carrier.
  - They hold formation slots beside and just ahead of the tank, and never race ahead.
  - Enemies that break through can knock a vehicle out; it auto-repairs after 30 s, or the REBUILD card restores it.
  - Five visible levels. Static parts are batched, and on phones they use blob shadows.
- **ATTACK / DEFEND:** one button, or space on desktop. It appears after 25 s.
  - ATTACK: the push as before, but with a soft 27 m cohesion radius, so troops stop chasing farther targets and drift back. Ranged troops march behind the melee.
  - DEFEND: per-unit formation slots from a hash (no solver), with heavy units in front, melee, and ranged at the rear. Units engage only what comes within 13 m of the tank. The formation moves with the tank.
- **Collectors** (0 → 5, upgrades for speed and carrying capacity):
  - They fetch coins outside the tank's magnet radius, up to 17 m away, and skip coins near enemies.
  - They retreat under pressure and deposit at the tank. Currency counts only once deposited.
  - A collector killed while carrying drops half its load and the other half is lost.
- **Ranged weapon eras:** rock throwers → javelins → archers → crossbows → muskets → rifles → pulse rifles.
  - One step per card, gated by minute (0/2/4/7/11/15/20).
  - Each era changes range, damage, cadence, projectile speed and arc, the projectile model and the weapon carried.
- **Deck audit:** 33 cards in six categories (army, ranged, tank, defense, support, collect). Follow-up cards only appear once their system exists. There are no wall, barricade or tower cards.
- **Bot:** switches to DEFEND when tank HP is below 40%, enemies are close, the field is down under pressure or vehicles are hit, and back to ATTACK once stable.
- **Debug and evidence:** `dev/lineup.html?eras=1` shows the ranged eras. `showcase(vehicleLv, tankStage)` drives the vehicle and tank stages. Captures are in docs/shots/m6.
