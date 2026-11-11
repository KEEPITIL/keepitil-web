/* edge-host.mjs - serves the two DEPLOYED Edge Function sources, byte-for-byte unmodified, from a local 127.0.0.1 HTTP server.
   What is real: the function code (create-checkout v58, stripe-webhook v52, md5-pinned and re-verified at every start), run by Node 22 type-stripping instead of Deno.
   What is substituted: Deno.env/Deno.serve (shims/deno.mjs), `stripe` (shims/stripe.mjs), `@supabase/supabase-js` (shims/supabase.mjs), the Supabase gateway's verify_jwt (emulated below).
   verify_jwt: create-checkout (true in prod) answers 401 {code:401,message:"Invalid JWT"} unless the bearer is a JWT signed with the project secret (the ANON key passes, exactly as at the real gateway);
               stripe-webhook (false in prod) is open (its own Stripe signature check is the gate). */
import http from "node:http";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { installDeno } from "../shims/deno.mjs";
import { verifyJwt } from "./jwt.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEPLOYED = {
  "create-checkout": { file: join(HERE, "..", "deployed", "create-checkout.index.ts"), md5: "aad74a1bf95522b914578d2ebc78c6d6", version: 58, ezbr: "79dbf80a4bf2101e86fcf3f3c3912d769168a76f772778618fcfcf493d39166a", verifyJwt: true },
  "stripe-webhook": { file: join(HERE, "..", "deployed", "stripe-webhook.index.ts"), md5: "33840e79eebb15fbb5d8a2a02787e002", version: 52, ezbr: "5d27f786bc80cc8cf9a0faabe75874999cec7f295a4181b74a3ebe38ddc5d345", verifyJwt: false },
};
export const md5File = (f) => createHash("md5").update(readFileSync(f)).digest("hex");
export function verifyDeployedSources() {
  return Object.entries(DEPLOYED).map(([slug, d]) => { const got = md5File(d.file); if (got !== d.md5) throw new Error(`deployed source ${slug} is not the pinned v${d.version} copy (md5 ${got} != ${d.md5}). Refusing to run.`); return { slug, version: d.version, md5: got }; });
}

/* opts.overrides = { "stripe-webhook": "<absolute path of a PATCHED copy>" }: serve that file instead of the pinned deployed copy for that slug (the pinned deployed sources are STILL md5-verified at every start; the patched copy is a separate file made from them). */
export async function startEdgeHost(opts = {}) {
  verifyDeployedSources();
  const served = installDeno();
  const handlers = {};
  for (const [slug, d] of Object.entries(DEPLOYED)) { served.last = null; await import(pathToFileURL(opts.overrides?.[slug] ?? d.file).href + "?fn=" + slug + "&host=" + (opts.overrides?.[slug] ? "patched" : "deployed") + "&n=" + Math.random().toString(36).slice(2)); if (!served.last) throw new Error(slug + " did not call Deno.serve"); handlers[slug] = served.last; }
  const server = http.createServer(async (req, res) => {
    try {
      const m = new URL(req.url, "http://127.0.0.1").pathname.match(/^\/functions\/v1\/([\w-]+)$/); const slug = m?.[1];
      if (!slug || !handlers[slug]) { res.writeHead(404); return res.end("no such function"); }
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      if (DEPLOYED[slug].verifyJwt && req.method !== "OPTIONS") {
        const a = req.headers.authorization || "";
        if (!(a.startsWith("Bearer ") && verifyJwt(a.slice(7), globalThis.__KIL_TESTBED.jwtSecret))) { res.writeHead(401, { "content-type": "application/json" }); return res.end(JSON.stringify({ code: 401, message: "Invalid JWT" })); }
      }
      const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
      const request = new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
      const r = await handlers[slug](request);
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) { res.writeHead(500, { "content-type": "text/plain" }); res.end("edge host error: " + e); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, url: (slug) => `${base}/functions/v1/${slug}`, stop: () => new Promise((r) => server.close(r)) };
}
