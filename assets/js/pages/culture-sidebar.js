/* KEEPITIL culture/index.html: inline script "sidebar" moved verbatim to an external file (CSP: no executable inline script). */
/* Vertical sidebar: subpages (top) + the selected subpage's subfilters below (Founder 2026-08-04) */
/* ⚠ vr* BLOCK REMOVED 2026-08-27 — it was the ONLY source of two 404s.
   VR_SUBS / vrRenderFilters / vrToggleSub / vrGoSub / vrSF drove #vrFilters and the
   #vrSubDD dropdown. That markup was deleted on 2026-08-18 (see the CONTENT-TYPE FILTERS
   note above), so every one of these functions had been unreachable since — nothing in the
   page called vrGoSub, and no element with those ids existed to bind to.
   It still mattered because vrGoSub carried a SECOND, stale router:
       radio -> '/culture/radio'   (404 on production, verified)
       vs    -> '/culture/vs'      (404 on production, verified)
   while the live router, culSection(), sends radio -> '/earn/' (200). Two routers disagreeing
   about the same destination is exactly the drift the closeout is meant to remove, and those
   two paths were the only references to those URLs anywhere in the site.
   Deleted rather than hidden: dead code that still names a dead route is how the wrong one
   gets revived later. culSection() is the one router. */
