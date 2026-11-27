// The event page's three scripts moved out of event.html into assets/js/event-*.js (CSP: no executable inline <script>). Many tests assert on the page's SCRIPT SOURCE through the
// page text; this puts the external files back in place (same positions) so those assertions keep checking the same code. Pages that still carry inline code are returned unchanged.
const fs = require("node:fs"), path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const TAG = /<script src="\/assets\/js\/((?:pages\/)?[\w-]+|kil-theme-init|event-preload|event-page|event-password)\.js(?:\?v=[^"]*)?"><\/script>/g;
const MOVED = (name) => /^(event-|pages\/|kil-theme-init$)/.test(name);
function assemble(html) { return String(html).replace(TAG, (m, name) => !MOVED(name) ? m : "<script>" + fs.readFileSync(path.join(ROOT, "assets/js", name + ".js"), "utf8").replace(/^\/\*[\s\S]*?\*\/\n/, "") + "</script>"); }
// copy the external page script next to a temp copy of event.html (the generator reads the public Supabase key from it)
function stage(dir) { const d = path.join(dir, "assets", "js"); fs.mkdirSync(d, { recursive: true }); fs.copyFileSync(path.join(ROOT, "assets/js/event-page.js"), path.join(d, "event-page.js")); }
module.exports = { stage, assemble, read: (rel) => assemble(fs.readFileSync(path.join(ROOT, rel), "utf8")) };
