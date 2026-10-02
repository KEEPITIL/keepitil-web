# shared faction atlas

One texture atlas shared by every character (max 2048x2048; bigger images are downscaled on load):

- `kmob_atlas_basecolor.png`: cloth, armour, leather, gold, weapon metal, skin/face, horn, shield. Paint faction-tinted areas light grey or white.
- `kmob_atlas_normal.png` (optional): tangent-space normal map.
- `kmob_atlas_emissive.png` (optional): glowing eyes, crystals, runes.
- Metalness/roughness: set them on the material (the cel shader turns metal into a bright highlight band). No texture is needed.

Embed the atlas in each GLB (Blender: Format = glTF Binary). Reusing the same image keeps GPU memory to a single copy.
