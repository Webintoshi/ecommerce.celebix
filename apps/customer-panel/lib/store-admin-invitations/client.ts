/** First-party fragment client, embedded only under a per-response CSP nonce. */
export const invitationFragmentClient = `(() => {
  let fragment = window.location.hash;
  window.history.replaceState(null, '', '/invitations/accept');
  let match = /^#token=([A-Za-z0-9_-]{42}[AEIMQUYcgkosw048])$/.exec(fragment);
  let token = match ? match[1] : null;
  fragment = null; match = null;
  const form = document.getElementById('invitation-start');
  const button = document.getElementById('continue');
  const status = document.getElementById('status');
  if (!token) { status.textContent = 'Davet bağlantısını e-postanızdan yeniden açın.'; return; }
  button.disabled = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); if (!token || button.disabled) return;
    button.disabled = true; status.textContent = 'Güvenli giriş hazırlanıyor…';
    try {
      const pending = fetch('/invitations/start', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, csrfToken: form.elements.csrfToken.value }) });
      token = null;
      const response = await pending;
      if (!response.ok) throw new Error('unavailable');
      const result = await response.json();
      window.location.assign(result.redirectTo);
    } catch { token = null; status.textContent = 'Giriş başlatılamadı. Davet bağlantısını e-postanızdan yeniden açın.'; status.focus(); }
  });
})();`;
