// csp-report: collector for Content-Security-Policy(-Report-Only) violation reports from keepitil.com.
// POST application/csp-report (report-uri) or application/reports+json (Reporting-Endpoints / report-to). Answers 204 and writes ONE compact JSON log
// line per violation (Edge Function logs; no table, no migration). Query strings, fragments and userinfo are stripped from every URL, script samples
// and the policy text are dropped, the client address only appears as an HMAC with a random per-isolate salt. Bodies over 8 KB are refused (413),
// at most 30 requests per minute per hashed address per isolate (429). No JWT, no cookies, no CORS (browsers send reports without preflight).
// Deploy:  supabase functions deploy csp-report --no-verify-jwt --project-ref <keepitil-prod>   (needs a GO; see docs/cloudflare/csp-report-only.md)
import { createLimiter, handleReport, hashIp } from './report.mjs';

const salt = crypto.randomUUID() + crypto.randomUUID();   // per isolate: hashes are only comparable inside one running instance, like the limiter
const limiter = createLimiter();

Deno.serve((req: Request) => handleReport(req, { limiter, hash: (ip: string) => hashIp(salt, ip), log: (line: string) => console.log(line) }));
