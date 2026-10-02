# blue/elite (knightF)

Drop **elite.glb** here, then add `"characters/blue/elite/elite.glb"` to `assets/manifest.json`.

Objects this unit is built from (names must match exactly; see docs/CHARACTER-ASSET-SPEC.md):

- `lStd`
- `tHeavy`
- `hKnight`
- `aHeavy`
- `sword`
- `shield`

Parts are shared between units (for example `lStd` legs are used by every standard soldier). A file may contain only the parts you want to override. Missing parts keep the procedural version.

Elite blue variant: uses the knight recipe (`tHeavy` + `hKnight` + `aHeavy`). Put the elite look (gold trims, plume) in those parts, or ask for a separate elite recipe.
