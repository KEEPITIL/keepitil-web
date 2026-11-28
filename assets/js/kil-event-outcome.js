/* Maps a publish/edit RPC result to the success screen.
   Old responses have no status (or always say published). New ones include the stored
   status, review_reason, and for a series in_review. Only status published is "live". */
(function (root) {
  function kilEventSaveOutcome(res) {
    var r = res && typeof res === 'object' ? res : {};
    var status = typeof r.status === 'string' && r.status ? r.status : 'published';
    var reason = typeof r.review_reason === 'string' ? r.review_reason.trim() : '';
    var n = typeof r.in_review === 'number' && isFinite(r.in_review) ? r.in_review : null;
    var waiting = status === 'review' || (n !== null && n > 0);
    if (waiting) {
      var parts = [];
      if (n !== null && n > 0) parts.push(n === 1 ? '1 date is waiting for review.' : (n + ' dates are waiting for review.'));
      if (reason) parts.push(reason);
      parts.push("Email info@keepitil.com for changes. You can't edit an event while it is in review.");
      return { live: false, title: 'Saved, waiting for review', text: parts.join(' ') };
    }
    if (status === 'published') {
      return {
        live: true,
        title: "You're live",
        text: 'Your event is published. It shows on your page and in the Scene. You can edit it from the dashboard. Report and takedown still apply if something breaks or is abused.'
      };
    }
    return { live: false, title: 'Saved', text: 'Saved with status ' + status + '.' };
  }
  root.kilEventSaveOutcome = kilEventSaveOutcome;
})(typeof window !== 'undefined' ? window : globalThis);
