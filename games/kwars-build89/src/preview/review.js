/* BUILD 89 PREVIEW ONLY -- the owner/Echo review menu. Each situation starts a real battle (the real game, real controls, real time)
   and stages the armies for that situation; you can then play it normally. Not part of the production payload. */
(function(){
'use strict';
const SIT = [
  { n: '1  Standing mixed formation (ranks of 10)', p: [['spear', 14], ['sword', 20], ['archer', 17]], a1: 1050, a2: 9e3 },
  { n: '2  Spear-line contact', p: [['spear', 20], ['sword', 10], ['archer', 10]], e: [['espear', 20], ['esword', 10], ['earcher', 6]], a1: 1000, a2: 1330, ephase: 'march', at: [[1, 'attack']] },
  { n: '3  Prolonged spear vs spear', p: [['spear', 30]], e: [['espear', 30]], a1: 1050, a2: 1300, ephase: 'assault', at: [[1, 'attack']] },
  { n: '4  Swords joining the melee', p: [['spear', 8], ['sword', 24], ['archer', 8]], e: [['espear', 10], ['esword', 20]], a1: 1050, a2: 1320, ephase: 'assault', at: [[1, 'attack']] },
  { n: '5  Spear throw → shielded swordsmen', p: [['spear', 20], ['sword', 10], ['archer', 8]], e: [['esword', 20], ['espear', 6]], a1: 1000, a2: 1360, ephase: 'assault', at: [[3, 'throwspears'], [6, 'attack']] },
  { n: '6  Casualties and rank compaction', p: [['spear', 20], ['sword', 20], ['archer', 17]], a1: 1100, a2: 9e3, kill: [2, 0.35] },
  { n: '7  Attack', p: [['spear', 16], ['sword', 20], ['archer', 14]], e: [['espear', 16], ['esword', 20], ['earcher', 12]], a1: 950, a2: 1500, ephase: 'form', at: [[1, 'attack']] },
  { n: '8  Defend', p: [['spear', 16], ['sword', 20], ['archer', 14]], e: [['espear', 10], ['esword', 26], ['earcher', 8]], a1: 950, a2: 1380, ephase: 'assault' },
  { n: '9  Retreat (spears cover the withdrawal)', p: [['spear', 16], ['sword', 16], ['archer', 12]], e: [['espear', 10], ['esword', 22]], a1: 1150, a2: 1420, ephase: 'assault', at: [[4, 'retreat']] },
  { n: '10 Large battle (100 v 100)', p: [['spear', 30], ['sword', 40], ['archer', 30]], e: [['espear', 30], ['esword', 40], ['earcher', 30]], a1: 900, a2: 1650, ephase: 'march', at: [[3, 'attack']] },
];
function stage(spec){
  S.waveQueue = []; S.phase = 'inter'; S.interT = 1e9; S.over = null; S.retreatMode = false; S.wallArchers = []; S.defs = (S.defs || []).filter(d => !d.fromRetreat);
  S.gold = 2000; S.autoOn = false; S.castleHP = S.castleMax; S.gateHP = S.gateMax; S.stance = 'defend';
  KWBattle.begin(); S.W.teams[1].anchor = spec.a1; S.W.teams[-1].anchor = spec.a2; S.enemyRallyX = spec.a2; S.rallyX = spec.a1; S.startRally1 = spec.a1;
  for (const [t, n] of spec.p || []) for (let i = 0; i < n; i++) KWBattle.makeSoldier(1, t, { deploy: true });
  for (const [t, n] of spec.e || []) for (let i = 0; i < n; i++) KWBattle.makeSoldier(-1, t, { deploy: true });
  KWBattle.standFormed(1); KWBattle.standFormed(-1);
  S.enemyPhase = spec.ephase || 'form'; S.enemyFormT = spec.ephase ? 0.5 : 1e9; S.enemyFormWaitT = 0; S.W.drainEvents();
  const t0 = S.time;
  for (const [sec, cmd] of spec.at || []) setTimeout(() => { if (!S || S.over) return; cmd === 'attack' ? issueCommand('stance', { stance: 'attack' }) : issueCommand(cmd); }, sec * 1000);
  if (spec.kill) setTimeout(() => { const m = S.units.filter(u => u.team === 1 && u.alive); const k = Math.round(m.length * spec.kill[1]); for (let i = 0; i < k; i++){ const u = m[(i * 7 + 3) % m.length]; if (u.alive) S.W.kill(u, 'cut'); } showMsg('Review: ' + k + ' casualties -- watch each class compact'); }, spec.kill[0] * 1000);
  showMsg('Review: ' + spec.n.replace(/^\d+\s+/, ''), 3500);
}
function run(i){
  const spec = SIT[i]; close();
  window.KWTutorial?.skip?.();
  KWShell.enterGame();
  setTimeout(() => { const node = KW_DATA.campaignKingdoms[0]; KWExperience.startBattle({ mode: 'CAMPAIGN', missionId: node.id, civOrder: 1 });
    setTimeout(() => { const b = [...document.querySelectorAll('#shellpanel button')].find(x => /START BATTLE/.test(x.textContent)); if (b) b.click();
      setTimeout(() => { window.KWTutorial?.skip?.(); document.getElementById('kwtutorial')?.remove(); stage(spec); }, 400); }, 350); }, 350);
}
let panel = null;
function close(){ panel?.remove(); panel = null; }
function open(){
  if (panel) return close();
  panel = document.createElement('div'); panel.id = 'b89review';
  panel.innerHTML = '<div class="rbox"><h3>BUILD 89 REVIEW</h3><p>Each situation starts a real battle, already staged. Play it normally; open this menu again for another.</p>' +
    SIT.map((s, i) => '<button data-i="' + i + '">' + s.n + '</button>').join('') + '<button class="x">CLOSE</button></div>';
  document.body.appendChild(panel);
  panel.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.classList.contains('x')) return close(); run(+b.dataset.i); });
}
const css = document.createElement('style'); css.textContent = `
  #b89badge{position:fixed;right:8px;top:58px;z-index:80;background:#ffcc33;color:#3a2a00;font:800 12px system-ui;letter-spacing:.5px;padding:4px 10px;border-radius:10px;border:0;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35)}
  #b89review{position:fixed;inset:0;z-index:90;background:rgba(8,12,20,.65);display:flex;align-items:center;justify-content:center}
  #b89review .rbox{background:#18202e;color:#fff;border-radius:14px;padding:14px 16px;width:min(460px,94vw);max-height:90vh;overflow:auto;font:600 13px system-ui}
  #b89review h3{margin:0 0 4px;text-align:center;font-size:20px} #b89review p{color:#9fb3cc;margin:0 0 8px}
  #b89review button{display:block;width:100%;text-align:left;margin:5px 0;padding:10px 12px;border:0;border-radius:9px;background:#2c3a52;color:#fff;font:700 14px system-ui;cursor:pointer}
  #b89review button:hover{background:#3a4d6c} #b89review .x{text-align:center;background:#444}`;
document.head.appendChild(css);
const badge = document.createElement('button'); badge.id = 'b89badge'; badge.textContent = 'BUILD 89 PREVIEW · REVIEW SITUATIONS'; badge.onclick = open;
document.body.appendChild(badge);
window.KWReview = Object.freeze({ open, run, SIT });
})();
