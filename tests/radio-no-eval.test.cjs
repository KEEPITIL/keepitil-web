// CSP: the radio script must not use eval-class APIs (an enforcing script-src without 'unsafe-eval' blocks them). The dead PJAX block used new Function().
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "..", "assets/js/keepitil-radio.js"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const found = (s) => code(s).match(/\bnew\s+Function\s*\(|\beval\s*\(|setTimeout\s*\(\s*["'`]|setInterval\s*\(\s*["'`]/g) || [];
test("keepitil-radio.js has no new Function / eval / string timers", () => assert.deepEqual(found(src), []));
test("control: the detector sees them", () => { assert.equal(found("var f=new Function(code);").length, 1); assert.equal(found("eval('x')").length, 1); assert.equal(found("setTimeout('x',1)").length, 1); });
