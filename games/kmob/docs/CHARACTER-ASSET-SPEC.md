# KMOB production character spec (for the 3D artist)

**Goal:** hand-modelled characters that look like the approved KMOB concept image, with chunky stylized miniature warriors:
- oversized helmets and rounded bodies;
- mitten hands and big readable weapons;
- a blue friendly army and a red enemy army;
- horned red brutes and a crowned warlord.

The game already runs on code-built placeholder parts. Your files replace them piece by piece, and anything you haven't delivered keeps working with the placeholder.

## Start here

1. Open **`assets/template/kmob-parts-template.glb`** in Blender (File › Import › glTF 2.0). Every current part is a named object placed on its correct pivot.
2. Model over each part, keeping its **object name, origin and orientation**. Replace the mesh, not the object.
3. Export everything as **one GLB**: `assets/characters.glb`. Set the export to glTF Binary, +Y up, apply modifiers, and include custom properties off.
4. In `assets/manifest.json`, set `"characters": "characters.glb"`. Reload the game. The loader prints a report (`KM.assetReport` in the browser console) listing each part as replaced, rejected (with the reason) or still placeholder.
5. Use `dev/lineup.html` to review every unit kind cycling through every animation clip.

## Rig: segmented, rigid bones (no skinning)

Hundreds to thousands of soldiers are drawn at once with GPU instancing, so each body part is a **separate rigid mesh** moved by the shared skeleton. Don't deliver a skinned or deformed mesh. Model the joints so the pieces overlap cleanly when they rotate: a sleeve over the shoulder, a boot cuff over the leg, a collar under the helmet.

Units are metres. The character faces **+Z**, with **+Y** up. A standard soldier is about 1.15 tall to the helmet top.

| Bone / part key | Origin (pivot) | What it contains | Max triangles |
|---|---|---|---|
| `lStd`, `lBrute` | hip joint; sole at y = -0.33 | thigh, shin, boot | 900 |
| `tLight`, `tHeavy`, `tBrute`, `tRobe` | hips; neck at y = +0.40 (brute +0.44) | torso, belt, skirt, shoulders/pauldrons | 1200 |
| `hBlue`, `hKnight`, `hHood`, `hHorn`, `hBucket`, `hBandana`, `hImp`, `hBrute`, `hWarlord`, `hShaman`, `hGoggles` | neck; face centre about y = +0.17 | head, face, helmet/hood/horns/crown | 1200 |
| `aStd`, `aHeavy`, `aBrute` | shoulder; fist centre at y = -0.27 (brute -0.31) | upper arm, forearm, glove, **mitten hand** | 900 |
| `sword`, `swordGold`, `dagger`, `axe`, `bow`, `staff`, `bomb`, `claws` | grip point (in the fist) | weapon pointing **+Z** from the grip (bow spans ±Z, bulging −Y) | 900 |
| `shield` | handle on the forearm | round shield facing **+Z** | 900 |
| `cannon` | ground centre | siege cannon + carriage | 900 |
| `pads`, `plume`, `padsIron`, `hornsAdd`, `eyesGlow` | same as torso / head | upgrade and escalation add-ons | 900 |

Where each part goes on each unit (`KM.RECIPE` in `js/kit.js`):

| Unit | Torso | Head | Arms | Legs | Weapon | Shield |
|---|---|---|---|---|---|---|
| soldier (blue) | tLight | hBlue | aStd | lStd | sword | |
| archerF (blue) | tLight | hHood | aStd | lStd | bow | |
| knightF (blue) | tHeavy | hKnight | aHeavy | lStd | sword | ✔ |
| grunt | tLight | hHorn | aStd | lStd | sword | |
| imp | tLight | hImp | aStd | lStd | claws | |
| shield | tHeavy | hBucket | aStd | lStd | sword | ✔ |
| runner | tLight | hBandana | aStd | lStd | dagger | |
| archer | tLight | hHood | aStd | lStd | bow | |
| knight | tHeavy | hBucket | aHeavy | lStd | axe | ✔ |
| bomber | tLight | hGoggles | aStd | lStd | bomb | |
| shaman | tRobe | hShaman | aStd | lStd | staff | |
| brute | tBrute | hBrute | aBrute | lBrute | axe | |
| warlord | tBrute | hWarlord | aBrute | lBrute | axe | |

Body parts are shared between blue and red, and the faction colour comes from the material (next section). Make shared pieces work in both colours.

## Materials and colour

- Any material whose name starts with **`tint`** (for example `tint_cloth` or `tint_armor`) is recoloured per unit to the faction colour: blue, red, or the variant tints. Author tinted areas in **light grey or white**. Their base colour is multiplied by the faction colour, so a mid grey gives darker trim.
- Every other material keeps its own **base colour**: skin, steel, gold, leather, horn, wood, eyes. Vertex colours are multiplied in, so you can paint AO or highlights into vertex colour.
- Version 1 doesn't use textures. Separate metal, painted armour, leather, cloth, gold and bone through colour and geometry: bevels, rims, rivets, panel lines. The game's cel shader adds a 3-band ramp and a rim light. If you want texture atlases, say so and I'll add atlas support.
- Faces: give friendly units appealing dot eyes and brows, and give enemies angrier brows or masks. Make the warlord and brutes unmistakable.

## Validation (automatic)

The loader rejects a part, and keeps the placeholder for it, when:
- it has no geometry;
- it has invalid vertices;
- it exceeds the triangle budget above.

Nodes with names that aren't part keys are reported and ignored. A missing or broken file falls back to the placeholders completely, and the game keeps running. All of this is covered by `tests/browser.test.js`.

## Performance contract

- Only the closest ~120 units use your full parts. The next ~450 use lean animated parts, and the rest use statues, both code-built. A typical soldier built from your parts should stay **at or under ~1,500 triangles** in total.
- Keep pivots exactly where the template has them. The animation clips (`js/anim.js`) are tuned to those joints.
