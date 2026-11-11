/* shims/supabase.mjs - LOCAL STAND-IN for @supabase/supabase-js over node-postgres (Unix socket, local isolated database).
   NOT the real client. Subset used by the deployed functions:
     createClient(url, key, {global:{headers:{Authorization}}})
       .auth.getUser()                      -> verifies the local HS256 JWT, then checks the user exists in auth.users (what GoTrue does server-side)
       .from(t).select(cols).eq().in().maybeSingle()/single()/await ; .insert(row|rows) ; .update(obj).eq()/.in() ; .delete().eq()
       .rpc(name, args)                     -> select public.<name>(arg => $n, ...) (PostgREST named-argument call)
   Each statement runs the PostgREST way: BEGIN; SET LOCAL ROLE <anon|authenticated|service_role>; set_config('request.jwt.claim.*'); <stmt>; COMMIT.
   The role comes from the apikey (service-role key -> service_role) or, otherwise, from the bearer JWT's role claim. Row-level security therefore applies exactly as the replica defines it.
   Results are round-tripped through JSON so timestamptz arrive as ISO strings like PostgREST's. UNVERIFIED: PostgREST error-code/message wording, embedded selects, .order/.limit (not provided). */
import { verifyJwt } from "../lib/jwt.mjs";
import { assertLocalUrl } from "../lib/guards.mjs";

const ID = /^[a-z_][a-z0-9_]*$/i;
const q = (s) => { if (!ID.test(s)) throw new Error("bad identifier " + s); return '"' + s + '"'; };
const T = () => { const t = globalThis.__KIL_TESTBED; if (!t) throw new Error("testbed context missing"); return t; };

function context(key, authHeader) {
  const t = T();
  const k = verifyJwt(key, t.jwtSecret);
  if (k?.role === "service_role") return { role: "service_role", sub: null, claims: k };
  const bearer = authHeader && /^Bearer /.test(authHeader) ? authHeader.slice(7) : key;
  const c = verifyJwt(bearer, t.jwtSecret);
  if (!c) return { role: "anon", sub: null, claims: null, invalid: true };
  if (c.role === "service_role") return { role: "service_role", sub: null, claims: c };
  return { role: c.role === "authenticated" ? "authenticated" : "anon", sub: c.sub || null, claims: c };
}

let queue = Promise.resolve();                       // one statement at a time on the shim's connection
function run(ctx, sql, params) {
  const job = queue.then(async () => {
    const c = T().client;
    try {
      await c.query("BEGIN");
      await c.query(`SET LOCAL ROLE ${ctx.role}`);
      await c.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.email',$2,true), set_config('request.jwt.claim.role',$3,true)", [ctx.sub || "", ctx.claims?.email || "", ctx.role]);
      const r = await c.query(sql, params);
      await c.query("COMMIT");
      return { rows: JSON.parse(JSON.stringify(r.rows)), rowCount: r.rowCount };
    } catch (e) { try { await c.query("ROLLBACK"); } catch {} return { error: { code: e.code, message: e.message } }; }
  });
  queue = job.catch(() => {});
  return job;
}

class Builder {
  constructor(ctx, table) { this.ctx = ctx; this.table = table; this.op = "select"; this.cols = "*"; this.filters = []; this.payload = null; this.one = null; }
  select(cols = "*") { this.cols = cols; return this; }
  insert(p) { this.op = "insert"; this.payload = p; return this; }
  update(p) { this.op = "update"; this.payload = p; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c, v) { this.filters.push(["eq", c, v]); return this; }
  in(c, vs) { this.filters.push(["in", c, vs]); return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  single() { this.one = "single"; return this; }
  then(res, rej) { return this._exec().then(res, rej); }
  async _exec() {
    const params = []; const P = (v) => { params.push(v); return "$" + params.length; };
    let where = "";
    if (this.filters.length) where = " where " + this.filters.map(([k, c, v]) => k === "eq" ? `${q(c)}::text = ${P(String(v))}` : `${q(c)}::text = any(${P(v.map(String))}::text[])`).join(" and ");
    let sql;
    if (this.op === "select") sql = `select ${this.cols === "*" ? "*" : this.cols.split(",").map((c) => q(c.trim())).join(",")} from public.${q(this.table)}${where}`;
    else if (this.op === "insert") { const rows = Array.isArray(this.payload) ? this.payload : [this.payload]; const cols = Object.keys(rows[0]); sql = `insert into public.${q(this.table)} (${cols.map(q).join(",")}) values ${rows.map((r) => "(" + cols.map((c) => P(r[c])).join(",") + ")").join(",")}`; }
    else if (this.op === "update") sql = `update public.${q(this.table)} set ${Object.entries(this.payload).map(([c, v]) => `${q(c)} = ${P(v)}`).join(",")}${where}`;
    else sql = `delete from public.${q(this.table)}${where}`;
    const r = await run(this.ctx, sql, params);
    if (r.error) return { data: null, error: r.error, status: 400 };
    if (this.op !== "select") return { data: null, error: null, status: 201 };
    if (this.one) {
      const bad = { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }, status: 406 };
      if (r.rows.length > 1) return bad;
      if (!r.rows.length) return this.one === "single" ? bad : { data: null, error: null, status: 200 };
      return { data: r.rows[0], error: null, status: 200 };
    }
    return { data: r.rows, error: null, status: 200 };
  }
}

export function createClient(url, key, opts = {}) {
  assertLocalUrl(url);
  const hdr = opts?.global?.headers || {};
  const authHeader = hdr.Authorization || hdr.authorization || null;
  const ctx = context(key, authHeader);
  return {
    auth: {
      async getUser() {
        const token = authHeader && /^Bearer /.test(authHeader) ? authHeader.slice(7) : null;
        const c = token ? verifyJwt(token, T().jwtSecret) : null;
        if (!c) return { data: { user: null }, error: { message: "invalid JWT", status: 401 } };
        if (!c.sub) return { data: { user: null }, error: { message: "invalid claim: missing sub claim", status: 403 } };   // e.g. the ANON key used as a bearer
        const r = await run({ role: "service_role" }, "select id, email from auth.users where id = $1", [c.sub]);
        if (r.error || !r.rows.length) return { data: { user: null }, error: { message: "User from sub claim in JWT does not exist", status: 403 } };
        return { data: { user: { id: r.rows[0].id, email: r.rows[0].email } }, error: null };
      },
    },
    from: (t) => new Builder(ctx, t),
    async rpc(name, args = {}) {
      const params = []; const names = Object.keys(args);
      const sql = `select public.${q(name)}(${names.map((n) => { const v = args[n]; params.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v); return `${q(n)} => $${params.length}`; }).join(",")}) as r`;
      const r = await run(ctx, sql, params);
      if (r.error) return { data: null, error: r.error, status: 400 };
      return { data: r.rows[0]?.r ?? null, error: null, status: 200 };
    },
  };
}
