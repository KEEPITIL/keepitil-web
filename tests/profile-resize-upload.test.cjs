const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const __A = require("./helpers/event-assembled.cjs").assemble;
const html = __A(fs.readFileSync(path.join(__dirname, '..', 'profile.html'), 'utf8'));
const a = html.indexOf('function resizeForUpload(file){'), b = html.indexOf('function uploadImage(file0,cb){');
assert.ok(a > 0 && b > a);
const src = html.slice(a, b);
function run(file, o) {
  o = o || {};
  const calls = { blobTypes: [] };
  const win = {
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    Image: function () { const i = this; setImmediate(() => { i.naturalWidth = o.w; i.naturalHeight = o.h; i.onload && i.onload(); }); Object.defineProperty(i, 'src', { set() {} }); },
    File: function (parts, name, opt) { this.size = parts[0].size; this.name = name; this.type = opt.type; },
    document: { createElement: () => ({ getContext: () => ({ drawImage() {} }), toBlob(cb, type) { calls.blobTypes.push(type); const t = (type === 'image/webp' && o.noWebp) ? 'image/png' : type; cb({ size: o.outSize == null ? 100000 : o.outSize, type: t }); } }) },
  };
  const f = new Function('URL', 'Image', 'File', 'document', src + '; return resizeForUpload;')(win.URL, win.Image, win.File, win.document);
  return f(file).then((r) => ({ r, calls }));
}
const png = (size) => ({ type: 'image/png', name: 'GROW.png', size });
test('large png (1672x941, 2 MB) becomes a 1600px-edge webp named .webp, smaller than the original', async () => {
  const { r, calls } = await run(png(2e6), { w: 1672, h: 941 });
  assert.equal(r.type, 'image/webp'); assert.equal(r.name, 'GROW.webp'); assert.ok(r.size < 2e6); assert.deepEqual(calls.blobTypes, ['image/webp']);
});
test('kept as the ORIGINAL: gif, already small, no WebP encoder + png (transparency), result not smaller', async () => {
  const gif = { type: 'image/gif', name: 'a.gif', size: 9e6 }; assert.strictEqual((await run(gif, { w: 4000, h: 4000 })).r, gif);
  const small = png(100 * 1024); assert.strictEqual((await run(small, { w: 800, h: 600 })).r, small);
  const big = png(2e6); assert.strictEqual((await run(big, { w: 3000, h: 2000, noWebp: true })).r, big);
  const tiny = png(150000); assert.strictEqual((await run(tiny, { w: 1700, h: 900, outSize: 150000 })).r, tiny);
});
test('NEGATIVE CONTROL: a jpeg with no WebP encoder falls back to a jpeg re-encode', async () => {
  const j = { type: 'image/jpeg', name: 'p.jpeg', size: 3e6 };
  const { r, calls } = await run(j, { w: 4000, h: 3000, noWebp: true });
  assert.equal(r.type, 'image/jpeg'); assert.equal(r.name, 'p.jpg'); assert.deepEqual(calls.blobTypes, ['image/webp', 'image/jpeg']);
});
test('uploadImage: resize first, the NSFW check and the upload both use the RESIZED file', () => {
  const u = html.slice(html.indexOf('function uploadImage(file0,cb){'), html.indexOf('function resolveImg('));
  assert.match(u, /resizeForUpload\(file0\)\.then\(function\(file\)\{/);
  assert.match(u, /isImageSafe\(file\)/); assert.match(u, /\.upload\(path,file\)/);
  assert.match(u, /setTimeout\(function\(\)\{ res\(true\); \},4000\)/, 'the 4s fail-open race is unchanged');
  assert.match(src, /setTimeout\(function\(\)\{ done\(file\); \},6000\)/, 'resize can never hang the upload');
});
