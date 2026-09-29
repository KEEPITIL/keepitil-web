/* THE THIRTEEN ANCHORS — static data: siblings, the 13-case schema, the prologue case. */
window.T13 = window.T13 || {};
T13.BUILD = 'Milestone C0 visual pass · build 2';

T13.SIBLINGS = [
  { id: 'mara', name: 'Mara', color: 0x9b7be0, css: '#9b7be0', domain: 'MIND', power: 'Resonance', powerHow: 'Sense the Hollow through walls and read the memory in a touched object. Near the Hollow, Influence turns it away.', cd: 14 },
  { id: 'gabriel', name: 'Gabriel', color: 0xd9534f, css: '#d9534f', domain: 'FORCE', power: 'Push', powerHow: 'A telekinetic push: shoves heavy objects and staggers the Hollow for a few seconds.', cd: 12 },
  { id: 'daniel', name: 'Daniel', color: 0x3fb6a8, css: '#3fb6a8', domain: 'REALITY', power: 'Unmask', powerHow: 'See what is really there: false walls, hidden writing, counterfeits.', cd: 10 },
];

/* Every case uses this schema. The four information categories are kept apart on purpose:
   history (documented, with sources) · reports (attributed paranormal claims) · lantern (what the characters believe) · fiction (our mythology).
   status: a real-location case cannot ship until research.verified === true. */
T13.CASE_SCHEMA = {
  id: 'string', number: 'int 1–13', title: 'string', location: 'string', anchor: 'Pride|Greed|Lust|Envy|Gluttony|Wrath|Sloth|Fear|Grief|Guilt|Betrayal|Despair|—',
  research: { verified: 'bool', history: '[{claim, source}]', reports: '[{claim, attributedTo, firstReported, source}]', ethics: 'string', rejectedReason: 'string|null' },
  lantern: 'string', fiction: 'string',
  films: { case: '{id, lines[], mandatorySeconds, clues[]}', family: '{id, lines[]}' },
  clues: '[{id, cinematic, environmental, failsafeAfterAttempts, failsafe}]',
  loop: 'ENTER → EXPLORE → INVESTIGATE → PROVOKE → SURVIVE → RESOLVE → ESCAPE (objective ids per stage)',
  eliasBreadcrumb: 'string', reward: '{xp, skill, theaterUnlocks[]}',
};

/* Candidate list from the directive — NONE approved yet. Each must pass the research checklist before production. */
T13.CANDIDATES = ['Bhuj, India', 'Baguio, Philippines', 'Penang, Malaysia', 'Changi, Singapore', 'Port Arthur, Australia', 'Tuol Sleng, Cambodia', 'Armero, Colombia', 'Aberfan, Wales', 'Saint-Pierre, Martinique', 'Galveston, Texas', 'Peshtigo, Wisconsin', 'Iroquois Theatre, Chicago', 'Halifax, Canada'];

T13.CASES = Array.from({ length: 13 }, (_, i) => ({ number: i + 1, title: `Case ${['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII'][i]}`, status: 'locked', note: 'Location under research — not yet approved.' }));

/* PROLOGUE — a FICTIONAL gray-box location used to prove the horror loop. It is not a real place and makes no historical claim. */
T13.PROLOGUE = {
  id: 'prologue', title: 'Prologue — The Ashgrove Wing', fictional: true,
  film: { mandatorySeconds: 6, lines: [
    ['', 'LANTERN TRAINING FILE · PROLOGUE\nA fictional location built for this prologue. No real tragedy is depicted.'],
    ['DANIEL', 'The Ashgrove wing was closed after the fire. On the original plan the wards were numbered four, one, three. Everything else got renumbered.'],
    ['MARA', 'Something is still in there. It doesn’t feel like a ghost. It feels like it’s… listening.'],
    ['GABRIEL', 'Then we don’t make noise. Power first, then we get out.'],
    ['DANIEL', 'One more thing. Every report says it only comes when the lights go out.'],
  ] },
  code: '413',
  objectives: {
    enter: 'Find the fuse box. The power is out.',
    fusebox: 'The fuse is missing. Search the wing.',
    blocked: 'A heavy cabinet blocks the east hall. (Gabriel can move it.)',
    fuse: 'The fuse is behind something that isn’t really a wall. (Daniel sees what’s real.)',
    hunt: 'It knows. Get the fuse back to the fuse box.',
    exit: 'Power is back. Open the exit door — it needs a code.',
    escape: 'Get out.',
  },
  breadcrumb: 'Scratched into the exit door, fresh: a lantern insignia — and three words. “DON’T FOLLOW ME.”',
};
