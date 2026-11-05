# Game Night: tournament page spec (draft)

**One paragraph.** KEEPITIL Game Night is a recurring, community game tournament night on keepitil.com. Players enter a bracket for one of our own games (KMOB, KWARS, PokaSnap) or a guest title, watch the finals live, and the winners are posted to the site. It earns money two ways: a **paid entry** per player (or per team) and **sponsor slots** (a presenting sponsor, bracket sponsors and prize sponsors, listed on the page and in the stream). A free "watch" tier keeps the night open to everyone. Nothing here is wired: the entry and sponsor buttons are placeholders until Joe decides how payments and prizes work.

## Page

`game-night/index.html` (new folder, `noindex` while draft). Sections: next event (date, time, game, format), how it works (3 steps), entry (placeholder), sponsors (placeholder grid), past winners (empty state), rules summary, and a link to Community Guidelines.

## Open decisions for Joe

- Entry price (suggest $5 to $10) and whether prizes are cash, merch or both. A cash prize pool and paid entry may count as a contest with legal rules in some states, so confirm that before any money moves.
- Payment path: Stripe is for event tickets, Shopify for merch and digital items. Entry would most likely be an event ticket.
- Age rule for entrants, and who runs the bracket and the stream.
- Sponsor price list and how many slots per night.
