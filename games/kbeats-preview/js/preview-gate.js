/* Private preview: asks for the invite code (checked by the preview server, never here) and stores it on
   this device. Shown on first visit and whenever the server answers "invite required". */
import { PREVIEW_BACKEND, previewInvite, setPreviewInvite } from './api.js';

function ask(msg) {
  if (document.getElementById('pvgate')) return;
  const d = document.createElement('div'); d.id = 'pvgate';
  d.style.cssText = 'position:fixed;inset:0;z-index:999;display:grid;place-items:center;background:rgba(5,3,16,.94);font-family:system-ui;color:#fff;padding:16px';
  d.innerHTML = `<form style="width:min(420px,100%);padding:22px;border-radius:20px;background:#130b30;border:1px solid #7c5cff;box-shadow:0 0 40px rgba(124,92,255,.4)">
    <b style="font-size:20px">KBEATS · Private preview</b><p style="color:#c4c1e6;font-size:14px">${msg}</p>
    <input name="c" autocomplete="off" autocapitalize="characters" placeholder="Invite code" aria-label="Invite code" style="width:100%;box-sizing:border-box;min-height:48px;border-radius:12px;border:1px solid #7c5cff;background:#0b0620;color:#fff;font-size:18px;padding:0 12px">
    <button style="margin-top:12px;width:100%;min-height:48px;border:0;border-radius:12px;background:linear-gradient(90deg,#7c5cff,#ff4fd8);color:#fff;font-weight:800;font-size:16px">Enter</button></form>`;
  d.querySelector('form').onsubmit = e => { e.preventDefault(); const v = d.querySelector('input').value.trim(); if (v) { setPreviewInvite(v); location.reload(); } };
  document.body.appendChild(d); d.querySelector('input').focus();
}
if (PREVIEW_BACKEND) {
  if (!previewInvite()) ask('Enter the invite code you were given to play.');
  addEventListener('kb-invite-required', () => { setPreviewInvite(''); ask('That invite code was not accepted. Please enter it again.'); });
}
