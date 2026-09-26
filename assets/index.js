// Home page: handles links from I/O Fit emails (sign-up confirmation and
// password reset). Without auth tokens in the URL the marketing page shows.
//
// Supabase sends people to https://iofit.app?action=reset#access_token=…
// (implicit flow) — older emails may carry ?code=… (PKCE).
// - Phones: hand the tokens to the app via io.iofit://login-callback.
// - Desktop: let them set the new password right here.

(function () {
  // The anon key is public by design (row-level security protects data).
  const SUPABASE_URL = 'https://cuxjfjxitxpvazarmgvm.supabase.co';
  const SUPABASE_ANON =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1eGpmanhpdHhwdmF6YXJtZ3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwODM4OTcsImV4cCI6MjA4NTY1OTg5N30.pWJ4fh2aOApDM9P77tNGk964dQ64dVl8BFGT1dKyo4M';
  const SUPABASE_JS =
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  const warningIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>';
  const checkIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  for (const el of document.querySelectorAll('.year')) {
    el.textContent = new Date().getFullYear();
  }

  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const hashParts = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  const action = params.get('action');
  const code = params.get('code'); // PKCE (old links)
  const accessToken = hashParts.get('access_token'); // implicit flow
  const refreshToken = hashParts.get('refresh_token');
  const type = hashParts.get('type') || params.get('type');
  const authError =
    hashParts.get('error_description') || params.get('error_description');

  const isReset = action === 'reset' || type === 'recovery';
  const hasAuth = code || accessToken || authError;
  if (!hasAuth) return; // Normal visit: show the site.

  $('site').hidden = true;
  $('auth').hidden = false;
  document.title = 'I/O Fit';

  if (authError) {
    // Expired or already-used link.
    showExpired($('confirmed'), 'confirmed');
    return;
  }

  if (!isReset) {
    $('confirmed').hidden = false;
    return;
  }

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  if (isMobile) {
    // Forward everything to the app as-is.
    const deepLink = accessToken
      ? 'io.iofit://login-callback' + window.location.hash
      : 'io.iofit://login-callback?' + window.location.search.slice(1);

    $('confirmed').hidden = false;
    $('confirmed-title').textContent = 'Reset your password';
    $('confirmed-body').textContent =
      'Tap below to open I/O Fit and choose a new password.';
    $('step2-text').textContent = 'Follow the prompts to set a new password';

    const btn = $('open-btn');
    btn.href = deepLink;
    btn.hidden = false;
    setTimeout(function () {
      window.location.href = deepLink;
    }, 700);
    return;
  }

  // Desktop: reset in the browser.
  $('reset-web').hidden = false;
  resetInBrowser();

  async function resetInBrowser() {
    try {
      await loadScript(SUPABASE_JS);
    } catch (_) {
      showError('Couldn’t load the password reset. Check your connection and refresh.');
      $('reset-btn').disabled = true;
      return;
    }
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { flowType: 'implicit' },
    });

    let sessionError = null;
    if (accessToken) {
      // Implicit flow: restore the session from the tokens in the link.
      const { error } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      sessionError = error;
    } else if (code) {
      // Old PKCE link: try the exchange (can fail across devices).
      const { error } = await client.auth.exchangeCodeForSession(code);
      sessionError = error;
    }

    if (sessionError) {
      showExpired($('reset-web'), 'reset');
      return;
    }

    $('reset-form').addEventListener('submit', async function (event) {
      event.preventDefault();
      const pw1 = $('pw1').value;
      const pw2 = $('pw2').value;

      if (pw1.length < 8) return showError('Password must be at least 8 characters.');
      if (pw1 !== pw2) return showError('Passwords don’t match.');

      const btn = $('reset-btn');
      btn.disabled = true;
      btn.textContent = 'Saving…';
      clearStatus();

      const { error } = await client.auth.updateUser({ password: pw1 });
      if (error) {
        showError(error.message);
        btn.disabled = false;
        btn.textContent = 'Set new password';
        return;
      }
      $('reset-icon').innerHTML = checkIcon;
      $('reset-title').textContent = 'Password updated';
      $('reset-body').textContent =
        'You can now sign in to I/O Fit with your new password.';
      $('reset-form').hidden = true;
      // Don't leave a session in this browser; 'local' keeps the phone app
      // signed in.
      client.auth.signOut({ scope: 'local' }).catch(function () {});
    });
  }

  function showExpired(panel, kind) {
    panel.hidden = false;
    panel.querySelector('.big-icon').innerHTML = warningIcon;
    const title = kind === 'reset' ? $('reset-title') : $('confirmed-title');
    const body = kind === 'reset' ? $('reset-body') : $('confirmed-body');
    title.textContent = 'Link expired';
    body.textContent =
      'This link has already been used or has expired. Request a new one in the I/O Fit app.';
    if (kind === 'reset') $('reset-form').hidden = true;
    const steps = panel.querySelector('.steps');
    if (steps) steps.hidden = true;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function showError(msg) {
    const el = $('status-msg');
    el.textContent = msg;
    el.className = 'status-msg error';
  }

  function clearStatus() {
    const el = $('status-msg');
    el.textContent = '';
    el.className = 'status-msg';
  }
})();
