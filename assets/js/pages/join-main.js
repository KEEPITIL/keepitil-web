/* KEEPITIL join/index.html: inline script "main" moved verbatim to an external file (CSP: no executable inline script). */
    (function(){
      var q = new URLSearchParams(location.search);
      var t = (q.get('t') || q.get('token') || '').toLowerCase();
      if (!t) { var seg = location.pathname.split('/').filter(Boolean); var i = seg.indexOf('join'); if (i >= 0 && seg[i+1]) t = seg[i+1].toLowerCase(); }
      var form = document.getElementById('codeform');
      var open = document.getElementById('open');
      var notyet = document.getElementById('notyet');
      var input = document.getElementById('code');
      var err = document.getElementById('codeerr');

      // The same rules as the app's InviteLinks.resolve: dashes, spaces and case are ignored;
      // the problem is named (how many characters, which ones cannot be in a code).
      function check(raw) {
        var c = String(raw || '').toLowerCase().replace(/[\s\-\u2013\u2014_.]/g, '');
        if (!c) return { problem: 'Type the invite code you were sent.' };
        if (/^[0-9a-f]{32}$/.test(c)) return { token: c };
        var bad = c.replace(/[0-9a-f]/g, '');
        if (bad) return { problem: 'Invite codes use only the numbers 0\u20139 and the letters a\u2013f. Check \u201c' + bad.charAt(0) + '\u201d.' };
        return { problem: c.length < 32
          ? 'That code is ' + (32 - c.length) + ' characters short \u2014 invite codes have 32. Check you typed every group.'
          : 'That code has ' + (c.length - 32) + ' characters too many \u2014 invite codes have 32.' };
      }
      function grouped(tok) { return tok.match(/.{4}/g).join('-'); }

      function show(tok) {
        var get   = document.getElementById('get');
        var web   = document.getElementById('web');
        open.href = 'tupu://join?token=' + tok;
        // Straight to the web app with the invitation; no page in between.
        get.href  = 'https://keepitil.com/app/tuitea/app/?invite=' + tok;
        web.href  = get.href;
        document.getElementById('tok').textContent = grouped(tok);
        form.hidden = true;
        document.getElementById('flow').hidden = false;
      }

      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var r = check(input.value);
        if (r.problem) { err.textContent = r.problem; input.focus(); return; }
        err.textContent = '';
        document.getElementById('msg').textContent = 'Someone in your family has invited you to their household.';
        show(r.token);
      });

      // If the app is installed, iOS leaves this page (it goes hidden) as TUITEA
      // opens. If we are still visible ~1.2s after the tap, the app is not here.
      var left = false, timer = null;
      function onHide(){ if (document.visibilityState === 'hidden') left = true; }
      document.addEventListener('visibilitychange', onHide);
      window.addEventListener('pagehide', function(){ left = true; });
      window.addEventListener('blur', function(){ left = true; });

      open.addEventListener('click', function(){
        left = false;
        clearTimeout(timer);
        timer = setTimeout(function(){
          if (!left && document.visibilityState === 'visible') notyet.hidden = false;
        }, 1200);
      });
      if (!/^[0-9a-f]{32}$/.test(t)) {
        document.getElementById('msg').textContent = t
          ? 'This invitation link looks incomplete. Type the invite code from the message instead, or ask for the link again.'
          : 'Have an invite code? Type it here.';
        form.hidden = false;
        return;
      }

      show(t);

    })();
  
