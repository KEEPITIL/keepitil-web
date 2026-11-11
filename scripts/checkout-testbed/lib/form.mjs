/* form.mjs - Stripe-style application/x-www-form-urlencoded bracket encoding (client side) and decoding (fake server side). */
export function encodeForm(obj, prefix = "", out = []) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v === undefined) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (x !== null && typeof x === "object" ? encodeForm(x, `${key}[${i}]`, out) : out.push([`${key}[${i}]`, String(x)])));
    else if (v !== null && typeof v === "object") encodeForm(v, key, out);
    else out.push([key, v === null ? "" : String(v)]);
  }
  return prefix ? out : out.map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
}
export function decodeForm(str) {
  const root = {};
  for (const [rawK, v] of new URLSearchParams(str)) {
    const path = rawK.replace(/\]/g, "").split("[");
    let cur = root;
    path.forEach((p, i) => { if (i === path.length - 1) cur[p] = v; else { cur[p] = cur[p] ?? {}; cur = cur[p]; } });
  }
  const arr = (o) => { if (o && typeof o === "object") { for (const k of Object.keys(o)) o[k] = arr(o[k]); const ks = Object.keys(o); if (ks.length && ks.every((k) => /^\d+$/.test(k))) return ks.sort((a, b) => a - b).map((k) => o[k]); } return o; };
  return arr(root);
}
