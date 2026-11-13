# Pinch-zoom (draft PR #29): real-device checks

#29 only edits the viewport meta in 63 site pages (removes `maximum-scale=1`, `user-scalable=no`,
`user-scalable=no.0`). It is separate from the chat work in #28. Games and `app/tuitea/app/**` are untouched.
None of this has been checked on a real phone. Devices: one iPhone (Safari), one Android (Chrome).

## Forms (iOS zooms into inputs under 16px on focus, and may not zoom back)
apply.html, signup.html, reset-password.html, settings.html, profile.html, dashboard.html,
create-event.html, submit-event.html, event.html, venue.html, connect/, culture/, earn/, index.html.
Check: tap each field, type, submit; page returns to normal scale; buttons stay on screen.

## Dialogs, sheets and fixed bars
Fixed-position UI appears on the homepage, event, venue, profile, dashboard, signup, apply, connect,
create, culture, earn and every article/artist page (shell nav, floating chat button).
Check: pinch in, then open nav menu, ticket/claim dialogs, and the CHO chat panel; each is reachable,
closable, and not cut off; pinch out returns to 1x.

## Mobile layouts
Homepage, games hub, culture, tickets, event, venue, one artist article, wifi-remote article.
Check: no sideways scroll at 1x; double-tap does not jump the layout.

## Game controls (should be unchanged)
Games keep `user-scalable=no`. Spot-check KMOB, KBeats, KWARS, Traffic Pop: two-finger touches
still go to the game, and the hub page (now zoomable) still opens them.

## Chat panel (#28) with zoom on
Open CHO, focus composer: the keyboard does not leave the page zoomed; send button reachable.
