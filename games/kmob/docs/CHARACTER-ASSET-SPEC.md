# KMOB production character package (artist spec)

**Goal:** hand-modelled characters that look like the approved KMOB concept image, with chunky stylized miniature warriors:
- oversized helmets, rounded forms and small bodies;
- mitten hands and big readable weapons;
- blue heroes and red enemies;
- expressive elites, horned brutes and a crowned warlord.

The style is a colourful premium mobile game. Don't make them realistic, stick-figure, generic low-poly or dark and gritty.

The game already runs on code-built placeholder parts. Your files replace them **part by part and file by file**, with no code changes. Anything missing, broken or over budget keeps the placeholder, and the game never breaks.

## 1. Start here

1. Open **`assets/template/kmob-parts-template.glb`** in Blender (File › Import › glTF 2.0). It contains:
   - every body part as a named object sitting on its pivot (the reference);
   - a `rig` empty with child bones `hips` › `torso` › `head`, `armL`, `armR`, plus `legL` and `legR`;
   - every current animation as an action on that rig, named per §8.
2. Model over each part, keeping its **object name, origin (pivot) and orientation**. Replace the mesh, not the object.
3. Export each unit to its folder, for example `assets/characters/blue/basic/basic.glb`. Each folder's `README.md` lists the part names that unit uses.
4. Add the file to `assets/manifest.json` → `"characters": ["characters/blue/basic/basic.glb", …]`, in load order. Later files override earlier parts.
5. Open **`https://keepitil.com/games/kmob/?assets=1`** (or drop the .glb straight onto that page, nothing to deploy). For every unit it shows: production GLB or procedural fallback, triangles vs budget, draws/materials, texture size, skeleton status, scale/orientation/pivot checks, clips found and missing, and a budget **PASS / WARN / FAIL**. Preview idle, run, attack, hit and death with the procedural reference beside your model. **COPY REPORT** gives the JSON.
6. In a game run, `KM.assetReport` in the console lists every part as replaced, refused (technically invalid only) or missing, plus flags, warnings, clips and texture memory. `dev/lineup.html` cycles every unit through every clip.

## 2. Folders

```
assets/characters/
  shared/atlas/     shared faction atlas (see §6)
  shared/weapons/   optional weapons.glb (sword, swordGold, dagger, axe, bow, staff, bomb, claws, shield)
  blue/basic  blue/archer  blue/knight  blue/elite
  red/grunt   red/shield   red/runner   red/archer  red/knight  red/bomber  red/shaman  red/brute  red/warlord  red/imp
  special/siege
```

## 3. Rig: segmented, rigid bones (no skinning)

Hundreds to thousands of soldiers are drawn with GPU instancing, so each body part is a **separate rigid mesh** driven by the shared skeleton. Don't deliver skinned or deforming meshes. Design the joints so the pieces overlap cleanly when they rotate: sleeve over shoulder, boot cuff over leg, collar under helmet.

| Rule | Value |
|---|---|
| Units | metres. A standard soldier is about 1.15 m to the helmet top; brute ×1.9; warlord ×2.7 (scaled in game, so model at the template size) |
| Orientation | character faces **+Z**, **+Y** up (Blender: export with "+Y Up") |
| Scale check | each part's bounding box should be within 0.35–2.8× the template part on every axis (WARN otherwise) |
| Pivot check | part centre within max(0.25 m, 60% of the part size) of the template part's centre (WARN otherwise) |
| Orientation check | WARN if the long axis differs from the template's |

Policy: the game **warns, it does not refuse**. Only technically invalid data (no geometry, NaN/Infinity vertices, unreadable file) is refused and keeps the procedural part. Scale, pivot, orientation and budget problems load with a flag so you can see them in game and on `?assets=1`.

| Part key | Pivot | Contents |
|---|---|---|
| `lStd`, `lBrute` | hip joint; sole at y = −0.33 | thigh, shin, boot |
| `tLight`, `tHeavy`, `tBrute`, `tRobe` | hips; neck at y = +0.40 (brute +0.44) | torso, belt, skirt, shoulders/pauldrons |
| `hBlue`, `hKnight`, `hHood`, `hHorn`, `hBucket`, `hBandana`, `hImp`, `hBrute`, `hWarlord`, `hShaman`, `hGoggles` | neck; face centre about y = +0.17 | head, face, helmet/hood/horns/crown |
| `aStd`, `aHeavy`, `aBrute` | shoulder; fist at y = −0.27 (brute −0.31) | upper arm, forearm, glove, mitten hand |
| `sword`, `swordGold`, `dagger`, `axe`, `bow`, `staff`, `bomb`, `claws` | grip (in the fist) | weapon pointing **+Z** (bow spans ±Z, bulging −Y) |
| `shield` | forearm handle | round shield facing **+Z** |
| `cannon` | ground centre | siege cannon + carriage (the hero-budget prop) |
| `pads`, `plume`, `padsIron`, `hornsAdd`, `eyesGlow` | torso / head | upgrade and escalation add-ons |

## 4. Triangle budgets (enforced on load)

| Tier | Budget per unit | Who supplies it |
|---|---|---|
| Hero / very near (cannon, set pieces) | 3,000–6,000 | you (`cannon` part limit 6,000) |
| **Standard near unit** (closest ~120 units) | **1,500–3,000 total** | you. Per-part limits: leg 450, torso 900, head 1,100, arm 400, weapon 500, shield 400, add-ons 600 |
| Mid LOD (next ~450 units) | 300–500 (target band 500–1,000) | procedural lean parts, kept on purpose |
| Far LOD (the rest) | 230–500 statues (target band 200–350) | procedural statues, kept on purpose |

A part over its limit still loads, flagged **FAIL** on `?assets=1` and in `KM.assetReport.flags`. The 1,600-unit scene must stay near **~800k triangles and ~110 draw calls**.

## 5. Materials

- A material whose name starts with **`tint`** (`tint_cloth`, `tint_armor`, …) takes the faction colour per unit (blue/red and the variant tints). Author it light grey or white, because the colour multiplies.
- Every other material keeps its own **base colour or texture**: skin, steel, gold, leather, horn, wood, eyes.
- **Metalness/roughness** on the material become a cel-shaded metal highlight. Use high metalness and low roughness for steel and gold, and 0 for cloth, leather and skin.
- **Emissive** (emissive colour or map) is used for eyes, crystals and runes. Emissive accents are boosted on the MEDIUM quality tier and bloomed on HIGH.
- Normal maps are supported, but keep them subtle so the cel look holds.

## 6. Texture atlas rules

- One **shared faction atlas**: base colour, plus optional normal and emissive maps, with one image per map type, **max 2048×2048**. Bigger images are downscaled on load and reported. Lay out regions for cloth, armour, leather, gold, weapon metal, skin/face, horn and shield, and reuse UVs heavily.
- Every part of every unit samples the **same** atlas images. A part with two different base-colour images gets a warning and only the first is kept.
- Faction tint still works on textured parts: paint tint areas light grey and name the material `tint…`.
- Budget: the atlas set should stay **under 24 MB of GPU memory** (`KM.assetReport.texMB`).

## 7. Faces

Friendly units get appealing eyes and brows. Enemies get angry brows, masks or visors. Make the warlord and brutes unmistakable: crown, tusks, big horns.

## 8. Animation (optional; the procedural motion is the fallback)

Animate the `rig` bones (`hips`, `torso`, `head`, `armL`, `armR`, `legL`, `legR`) with Blender actions using these names. Each imported clip replaces the matching procedural clip, and clips you don't deliver keep the procedural motion.

| Clip | Replaces | Notes |
|---|---|---|
| `idle` | idle | loop |
| `walk` / `run` | run | loop: **one full stride cycle**, starting on the left foot contact |
| `sprint` | sprint | loop |
| `attack_01`, `attack_02` | light attacks | strike frame about 50% through the clip (damage lands there) |
| `heavy_attack` | heavy slam | strike about 55% |
| `ranged_aim`, `ranged_fire` | archer aim / release | release about 20% |
| `cast` | shaman cast | |
| `shield_block` | shield brace | loop |
| `cheer` | celebration | loop |
| `hit_01`, `hit_02`, `hit_03` | hit front / left / right (additive) | the pose 35% through the clip is used as the reaction offset |
| `stagger`, `knockback` | stagger (additive) | |
| `death_01`, `death_02`, `death_heavy` | deaths | end lying on the ground |

Only bone rotations (and `hips` height) are read. Root motion is ignored, because the simulation moves units. The template GLB contains every current clip, so you can retime them or replace them.

## 9. Export settings (Blender 3.x/4.x glTF 2.0)

- **Format:** glTF Binary (`.glb`).
- **Include:** Selected Objects (the unit's parts, plus `rig` if animating).
- **Transform:** +Y Up.
- **Geometry:** Apply Modifiers ✔, UVs ✔, Normals ✔, Vertex Colors ✔ if used, Materials: Export.
- **Compression:** off (Draco isn't loaded yet).
- **Animation:** ✔ if delivering clips, with actions named per §8 and "Group by NLA Track" off.
- **Images:** Automatic/PNG, embedded.

## 10. What the loader checks (automatic, covered by `tests/browser.test.js`)

- the file loads, or a 404 or corrupt file falls back to placeholders;
- part names are known (unknown nodes are reported and ignored);
- geometry is present, vertices are finite (no NaN/Infinity), and the part is within the triangle budget;
- scale, pivot and orientation match the template;
- materials: tint flag, textures, metal and emissive;
- clips: mapped name, rig bones present, finite values;
- missing parts are listed, and LOD tiers keep the procedural mid and far models;
- swapping parts doesn't leak renderer geometry.

## 10. Mobile-war additions (milestone 6)

The army now travels as one group: command tank + melee + ranged + collectors + support vehicles + force field. Deliver these with the same GLB pipeline (validate on `?assets=1`).

**Ranged weapon eras.** Ranged soldiers swap the item in the right-hand weapon socket (the same pivot as `sword`: grip at the origin, pointing +Z). Part names, in order of the eras: `rock`, `spear`, `bow` (off hand), `xbow`, `musket`, `rifle`, `pulse`. Weapon limit is 500 triangles each. Eras must read as a gradual progression, so keep one family look and don't jump to sci-fi early.

**Collector.** Recipe `collector`: light torso, bandana head, standard arms and legs, plus a `sack` item in the weapon socket. The game scales the sack with the carried amount from 0.55× to 1.45×, so model it at 1× with its pivot at the hand. The faction tint is gold (`tint_*` materials take the instance colour).

**Command tank (launcher).** It is modular, and each upgrade line turns on hardware:

| Hardpoint / group | Shown when |
|---|---|
| barrels 1–3 (turret, pointing −Z, muzzle at z ≈ −1.5) | fire-rate upgrades (1 → 2 → 3) |
| longer cannon (barrel Z scale 0.85 → 1.4) | cannon damage upgrades |
| missile pod (two boxes on the turret sides) | MISSILE POD |
| targeting mast (turret rear-left) | TARGETING SYSTEM |
| four field emitters on the hull corners + crystal core | FORCE FIELD |
| armour skirts / ram, then the heavy crown set | TANK ARMOR levels / heavy weapon build |

Model each group as a separate node named as above, on the template pivots. Budget is 6,000 triangles for the full late-game tank, with at most 6 materials and at most 1 texture atlas.

**Support vehicles** (`gun`, `artillery`, `frost`, `carrier`). There are 5 visual levels:
- L1: 4 wheels.
- L2: side armour.
- L3: 6 wheels and a bigger turret.
- L4: tracks and extra barrels.
- L5: gold trim and emitters.

Each level costs at most 2,500 triangles, and the turret is a separate node `aim` that rotates around Y. Static parts are batched at runtime, so keep the material count at 4 or fewer per vehicle.

**Shield.** The force field is a runtime effect (a transparent dome scaled to the shield radius). Artists only supply the emitter nodes.

**Art pilot (after the gameplay rework):** blue melee soldier, red grunt, red brute, one friendly ranged soldier (all 7 weapon items), the command tank and one support vehicle. Don't build the rest of the roster until these six are approved in a 500+ unit battle on the phone.
