/* door-contract-check.mjs - PROPOSAL ONLY. Pure static cross-check between the hardened SQL (#137: src/*.sql) and the door UI adapter (#141/#142: adapter/door-scan-adapter.mjs,
   byte-identical copy shipped as assets/js/kil-door-scan-adapter.mjs). It PARSES the SQL function sources and the adapter source; nothing is run against a database.
   crossCheck() returns a list of problems; [] means: every result code the SQL can return is mapped by the adapter and every code the adapter maps is returned by the SQL.
   The test file (door-contract-crosscheck.test.mjs) runs it on the real sources AND on deliberately broken copies (negative controls) that must each produce a problem. */

const strip = (sql) => sql.replace(/--[^\n]*/g, "");

/* split "a, b, c" at top-level commas (respecting parentheses and single-quoted strings) */
function splitArgs(s) {
  const out = []; let depth = 0, q = false, cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { cur += ch; if (ch === "'") { if (s[i + 1] === "'") { cur += "'"; i++; } else q = false; } continue; }
    if (ch === "'") { q = true; cur += ch; continue; }
    if (ch === "(") depth++; if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim()); return out;
}
const lit = (a) => { const m = /^'((?:[^']|'')*)'$/.exec(a); return m ? m[1].replace(/''/g, "'") : null; };

/* every jsonb_build_object(...) call in a function source -> array of Map(key -> raw value expression) */
export function objectsOf(sql) {
  const s = strip(sql), res = []; const re = /jsonb_build_object\s*\(/g; let m;
  while ((m = re.exec(s))) {
    let i = re.lastIndex, depth = 1, q = false;
    for (; i < s.length && depth > 0; i++) { const ch = s[i]; if (q) { if (ch === "'") { if (s[i + 1] === "'") i++; else q = false; } continue; } if (ch === "'") q = true; else if (ch === "(") depth++; else if (ch === ")") depth--; }
    const args = splitArgs(s.slice(re.lastIndex, i - 1)), o = new Map();
    for (let k = 0; k + 1 < args.length; k += 2) { const key = lit(args[k]); if (key !== null) o.set(key, args[k + 1]); }
    res.push(o);
  }
  return res;
}

/* core: the set of 'code' values */
export function coreCodes(coreSql) { return new Set(objectsOf(coreSql).map((o) => lit(o.get("code") || "")).filter(Boolean)); }

/* wrapper: branches "if|elsif c = 'x' [or c = 'y'] then return <jsonb_build_object ...>" and the final fallthrough object. key = the response discriminator ('result' or 'status') */
export function wrapperBranches(sql, discKey) {
  const s = strip(sql), branches = []; const re = /(?:if|elsif)\s+c\s*=\s*'(\w+)'((?:\s+or\s+c\s*=\s*'\w+')*)\s+then\s+return\s+pg_catalog\.jsonb_build_object\s*\(/g; let m;
  while ((m = re.exec(s))) {
    const from = m.index + m[0].length; let i = from, depth = 1, q = false;
    for (; i < s.length && depth > 0; i++) { const ch = s[i]; if (q) { if (ch === "'") { if (s[i + 1] === "'") i++; else q = false; } continue; } if (ch === "'") q = true; else if (ch === "(") depth++; else if (ch === ")") depth--; }
    const args = splitArgs(s.slice(from, i - 1)), o = new Map(); for (let k = 0; k + 1 < args.length; k += 2) { const key = lit(args[k]); if (key !== null) o.set(key, args[k + 1]); }
    const codes = [m[1], ...[...m[2].matchAll(/c\s*=\s*'(\w+)'/g)].map((x) => x[1])];
    branches.push({ codes, out: lit(o.get(discKey) || ""), keys: [...o.keys()] });
  }
  /* the fall-through return after the last branch ("return pg_catalog.jsonb_build_object(... );" outside any if) */
  const tail = s.slice(s.lastIndexOf("end if;")); const fm = /return\s+pg_catalog\.jsonb_build_object\s*\(([\s\S]*?)\)\s*;\s*end/.exec(tail);
  let fall = null; if (fm) { const args = splitArgs(fm[1]); const o = new Map(); for (let k = 0; k + 1 < args.length; k += 2) { const key = lit(args[k]); if (key !== null) o.set(key, args[k + 1]); } fall = { out: lit(o.get(discKey) || ""), keys: [...o.keys()] }; }
  return { branches, fall };
}

/* adapter source: CODES list, TICKET_STATUS map, SCAN_KEYS / TICKET_KEYS (parsed from text so nothing has to be exported) */
export function adapterFacts(src) {
  const arr = (name) => { const m = new RegExp("const\\s+" + name + "\\s*=\\s*\\[([^\\]]*)\\]").exec(src); return m ? [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]) : null; };
  const tm = /const\s+TICKET_STATUS\s*=\s*\{([^}]*)\}/.exec(src); const ticket = {}; if (tm) for (const x of tm[1].matchAll(/(\w+)\s*:\s*"(\w+)"/g)) ticket[x[1]] = x[2];
  const um = /export\s+const\s+UI\s*=\s*\{([\s\S]*?)\n\};/.exec(src); const ui = um ? [...um[1].matchAll(/^\s{2}(\w+)\s*:\s*\{/gm)].map((x) => x[1]) : [];
  return { codes: arr("CODES"), ticket, scanKeys: arr("SCAN_KEYS"), ticketKeys: arr("TICKET_KEYS"), ui };
}

export function crossCheck({ core, scan, ticket, adapter }) {
  const p = [], A = adapterFacts(adapter), C = coreCodes(core), S = wrapperBranches(scan, "result"), T = wrapperBranches(ticket, "status");
  if (!A.codes || !A.scanKeys || !A.ticketKeys || !Object.keys(A.ticket).length) return ["adapter source could not be parsed (CODES / SCAN_KEYS / TICKET_KEYS / TICKET_STATUS)"];
  if (C.size === 0) return ["core: no 'code' values found"];
  const CLIENT_ONLY = new Set(["error"]);                       // transport failure; never produced by SQL
  const wrapperDeals = (W) => new Set(W.branches.flatMap((b) => b.codes));
  for (const [name, W] of [["event_checkin_scan", S], ["check_in_ticket", T]]) {
    if (!W.fall) p.push(name + ": fall-through return not found");
    for (const c of C) if (c !== "unauth" && !wrapperDeals(W).has(c)) p.push(`${name}: core code '${c}' has no branch (it would fall through to 'unauth')`);
    for (const c of wrapperDeals(W)) if (!C.has(c)) p.push(`${name}: branch for '${c}' but the core never returns it`);
  }
  /* scan: SQL result codes == adapter CODES (minus client-only), and the adapter reads exactly the keys the SQL can emit */
  const sqlScan = new Set([...S.branches.map((b) => b.out), S.fall && S.fall.out].filter(Boolean)), adCodes = new Set(A.codes.filter((c) => !CLIENT_ONLY.has(c)));
  for (const c of sqlScan) if (!adCodes.has(c)) p.push(`UNMAPPED scan result '${c}': event_checkin_scan can return it but the adapter CODES does not list it (it would show as a generic error)`);
  for (const c of adCodes) if (!sqlScan.has(c)) p.push(`DEAD adapter code '${c}': listed in adapter CODES but event_checkin_scan never returns it`);
  for (const b of S.branches) if (b.out !== b.codes[0]) p.push(`event_checkin_scan: core '${b.codes[0]}' is returned as result '${b.out}' (the adapter treats result codes as identical to core codes)`);
  /* ticket: SQL status values == keys of TICKET_STATUS, and each status maps to the canonical code of the core code that produced it */
  const sqlTicket = new Set([...T.branches.map((b) => b.out), T.fall && T.fall.out].filter(Boolean));
  for (const s of sqlTicket) if (!(s in A.ticket)) p.push(`UNMAPPED ticket status '${s}': check_in_ticket can return it but adapter TICKET_STATUS has no entry`);
  for (const s of Object.keys(A.ticket)) if (!sqlTicket.has(s)) p.push(`DEAD adapter ticket status '${s}': in TICKET_STATUS but check_in_ticket never returns it`);
  const canon = (c) => (c === "empty" ? "invalid" : c);          // the ticket RPC folds 'empty' into 'notfound' -> canonical 'invalid'
  for (const b of T.branches) for (const c of b.codes) if (b.out in A.ticket && A.ticket[b.out] !== canon(c)) p.push(`check_in_ticket: core '${c}' -> status '${b.out}' -> adapter canonical '${A.ticket[b.out]}' but expected '${canon(c)}'`);
  for (const v of Object.values(A.ticket)) if (!adCodes.has(v)) p.push(`adapter TICKET_STATUS maps to '${v}', which is not in adapter CODES`);
  if (T.fall && T.fall.out !== "unauth") p.push("check_in_ticket fall-through is not 'unauth' (fail-closed expected)"); if (S.fall && S.fall.out !== "unauth") p.push("event_checkin_scan fall-through is not 'unauth' (fail-closed expected)");
  /* UI wording exists for every code */
  for (const c of A.codes) if (!A.ui.includes(c)) p.push(`adapter UI has no wording for code '${c}'`);
  /* keys: what the SQL can emit vs what the adapter reads. Extra SQL keys must be intentional ones the adapter ignores; the adapter must not read a key SQL never emits. */
  const IGNORED = { scan: new Set(["message"]), ticket: new Set(["order_status"]) };
  const emit = (W) => new Set([...W.branches.flatMap((b) => b.keys), ...(W.fall ? W.fall.keys : [])]);
  const es = emit(S), et = emit(T);
  for (const k of es) if (!A.scanKeys.includes(k) && !IGNORED.scan.has(k)) p.push(`event_checkin_scan emits key '${k}' that the adapter neither reads nor lists as intentionally ignored`);
  for (const k of A.scanKeys) if (!es.has(k)) p.push(`adapter SCAN_KEYS reads '${k}' but event_checkin_scan never emits it`);
  for (const k of et) if (!A.ticketKeys.includes(k) && !IGNORED.ticket.has(k)) p.push(`check_in_ticket emits key '${k}' that the adapter neither reads nor lists as intentionally ignored`);
  for (const k of A.ticketKeys) if (!et.has(k)) p.push(`adapter TICKET_KEYS reads '${k}' but check_in_ticket never emits it`);
  const CONTACT = /buyer|email|phone|handle|token|slug|name\b/i; for (const k of [...es, ...et]) if (CONTACT.test(k)) p.push(`response key '${k}' looks like attendee contact / token data`);
  return p;
}
