/* Procedural cover art for tracks without supplied artwork (all dev tracks). Original, generated. */
const cache = new Map();
export function coverArt(track, size = 256) {
  const key = track.id + size; if (cache.has(key)) return cache.get(key);
  if (track.artwork) { cache.set(key, track.artwork); return track.artwork; }
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const h = track.hue ?? 260;
  const bg = g.createLinearGradient(0, 0, size, size); bg.addColorStop(0, `hsl(${h},80%,22%)`); bg.addColorStop(1, `hsl(${(h + 60) % 360},85%,10%)`);
  g.fillStyle = bg; g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const x = size * (0.1 + 0.8 * ((i * 37 + h) % 100) / 100), r = size * (0.15 + ((i * 53) % 30) / 100);
    const rg = g.createRadialGradient(x, size * 0.35, 0, x, size * 0.35, r); rg.addColorStop(0, `hsla(${(h + i * 40) % 360},100%,60%,.45)`); rg.addColorStop(1, 'transparent');
    g.fillStyle = rg; g.fillRect(0, 0, size, size);
  }
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = size * 0.012;
  for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(size * 0.5, size * 0.42); g.lineTo(size * (0.08 + k * 0.28), size); g.stroke(); }
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, size * 0.72, size, size * 0.28);
  g.fillStyle = '#fff'; g.font = `900 ${size * 0.13}px "Space Grotesk",system-ui`; g.textAlign = 'center';
  g.fillText(String(track.bpm || ''), size / 2, size * 0.88);
  const url = c.toDataURL('image/jpeg', 0.82); cache.set(key, url); return url;
}
