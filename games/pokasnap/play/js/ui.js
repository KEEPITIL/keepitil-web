/* Tiny DOM helpers: h() for elements, sheet() for bottom sheets, toast(). */

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

export function sheet(...content) {
  const back = h('div', { class: 'sheet-back' });
  const s = h('div', { class: 'sheet', role: 'dialog' }, h('div', { class: 'grab' }), ...content);
  const close = () => { back.remove(); s.remove(); };
  back.addEventListener('click', close);
  document.body.append(back, s);
  return { el: s, close };
}

let tt = 0;
export function toast(msg, ms = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), ms);
}

export function coin() { return h('span', { class: 'coin', role: 'img', 'aria-label': 'coins' }); }

export function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

/* Animate a number counting up inside an element. */
export function countUp(el, to, ms = 900, onTick) {
  const t0 = performance.now(); let last = -1;
  return new Promise(res => {
    function step(now) {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3), v = Math.round(to * e);
      el.textContent = fmt(v);
      if (onTick && Math.floor(v / 250) !== last) { last = Math.floor(v / 250); onTick(); }
      if (k < 1) requestAnimationFrame(step); else res();
    }
    requestAnimationFrame(step);
  });
}
