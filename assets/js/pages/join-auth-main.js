/* KEEPITIL join/auth/index.html: inline script "main" moved verbatim to an external file (CSP: no executable inline script). */
    // Only wording changes here, never the session.
    (function () {
      try {
        var q = new URLSearchParams(location.search);
        var h = new URLSearchParams(location.hash.replace(/^#/, ''));
        var type = (q.get('type') || h.get('type') || '').toLowerCase();
        var err = h.get('error_description') || q.get('error_description') || h.get('error') || q.get('error');
        var code = q.get('code');
        var title = document.getElementById('title'), msg = document.getElementById('msg'),
            next = document.getElementById('next');
        var confirmation = type === 'signup' || type === 'email' || type === 'email_change' || type === 'invite';
        var recovery = type === 'recovery' || type === 'magiclink';

        if (err) {
          var expired = /expired|invalid|already/i.test(decodeURIComponent(String(err).replace(/\+/g, ' ')));
          title.textContent = 'That link could not be used';
          if (recovery) {
            msg.textContent = (expired ? 'That link has expired or was already used. ' : '') +
              'Nothing on your account has changed. Open TUITEA and tap Forgot Password to get a new one.';
          } else {
            msg.textContent = (expired ? 'That link has expired or was already used. ' : '') +
              'If you already confirmed your email, just sign in. If not, sign in to TUITEA and tap ' +
              '“Resend confirmation email” for a new link.';
          }
          return;
        }
        if (confirmation || (code && !recovery)) {
          // Supabase confirmed the address before sending the browser here.
          title.textContent = 'Your email is confirmed';
          msg.textContent = 'Thank you. You can sign in to TUITEA now with your email and password.';
          return;
        }
        if (recovery) {
          title.textContent = 'Open this link in TUITEA';
          msg.textContent = 'This link signs you in or resets your password, and it works in the TUITEA app. ' +
            'On iPhone, open the same link from the Mail app. Nothing on your account has changed.';
        }
      } catch (e) {}
    })();
  
