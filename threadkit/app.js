// ThreadKit UI. Everything stays in the browser; the draft lives in localStorage.
(() => {
  const $ = (id) => document.getElementById(id);
  const { LIMIT, weigh, split, lint } = window.ThreadKit;
  const store = {
    get(k, d) { try { return localStorage.getItem('threadkit.' + k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('threadkit.' + k, v); } catch {} },
  };

  const SAMPLE = `I shipped 5 small tools in one night using AI as my pair programmer. Here is what actually worked and what I would do differently.

The rule that saved me: one feature per prompt, then test it before asking for the next one. Big prompts produce big bugs that take longer to find than the code took to write.

---

Second lesson. Keep everything in the browser when you can. No backend means no keys to leak, no server to pay for, and a privacy story users actually care about. All five tools are static files on GitHub Pages.

---

Third. Make the demo image before you write the post. If the screenshot does not explain the product in two seconds, the product page will not either.

---

Fourth. Write tests for the boring core. My subscription detector looked right until I fed it a German bank export with dates like 01.09.2026 and every charge turned into a daily one.

---

All five are free and open source. Links in the reply below.`;

  $('text').value = store.get('text', '');
  $('name').value = store.get('name', 'Your Name');
  $('handle').value = store.get('handle', '@you');
  $('mode').value = store.get('mode', 'total');

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const linkify = (s) => esc(s)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a>$1</a>')
    .replace(/(^|\s)([#@][\w]+)/g, '$1<a>$2</a>');

  function ring(n) {
    const r = 9, c = 2 * Math.PI * r, p = Math.min(n / LIMIT, 1);
    const color = n > LIMIT ? '#f4212e' : n > LIMIT - 20 ? '#ffd400' : '#1d9bf0';
    return `<svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="${r}" fill="none" stroke="#2f3336" stroke-width="2"/>
      <circle cx="11" cy="11" r="${r}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" stroke-linecap="round"/></svg>
      <span style="color:${n > LIMIT ? '#f4212e' : ''}">${n} / ${LIMIT}</span>`;
  }

  let tweets = [];
  function render() {
    const text = $('text').value;
    const mode = $('mode').value;
    tweets = split(text, mode);
    store.set('text', text); store.set('mode', mode);
    store.set('name', $('name').value); store.set('handle', $('handle').value);

    const name = esc($('name').value || 'Your Name');
    let handle = $('handle').value.trim() || '@you';
    if (!handle.startsWith('@')) handle = '@' + handle;
    const initial = esc((name.trim()[0] || 'Y').toUpperCase());

    $('count').textContent = `${tweets.length} tweet${tweets.length === 1 ? '' : 's'}`;
    $('total').textContent = text.trim() ? `${weigh(text.trim())} characters total` : '';
    const th = $('thread');
    th.innerHTML = '';
    if (!tweets.length) th.innerHTML = '<div class="empty">Your thread preview shows up here.</div>';
    tweets.forEach((t, i) => {
      const el = document.createElement('div');
      el.className = 'tw';
      el.innerHTML = `<div class="av">${initial}</div><div>
        <div class="hd"><b>${name}</b><span>${esc(handle)} · now</span></div>
        <div class="body">${linkify(t)}</div>
        <div class="ft"><div class="ring">${ring(weigh(t))}</div><button data-i="${i}">Copy</button></div></div>`;
      th.appendChild(el);
    });
    th.querySelectorAll('.ft button').forEach((b) => (b.onclick = () => copy(tweets[+b.dataset.i], b)));

    const issues = lint(tweets);
    const L = $('lint');
    L.innerHTML = '';
    if (tweets.length && !issues.length) L.innerHTML = '<div class="ok"><i>✓</i> Looks good. Every tweet fits and nothing is hurting reach.</div>';
    issues.forEach((w) => {
      const d = document.createElement('div');
      d.className = w.level;
      d.innerHTML = `<i>${w.level === 'error' ? '!' : w.level === 'warn' ? '△' : 'i'}</i><span>${esc(w.msg)}</span>`;
      L.appendChild(d);
    });

    const post = $('post');
    if (tweets.length) {
      post.href = 'https://x.com/intent/post?text=' + encodeURIComponent(tweets[0]);
      post.removeAttribute('aria-disabled');
    } else {
      post.removeAttribute('href');
      post.setAttribute('aria-disabled', 'true');
    }
  }

  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
    catch { btn.textContent = 'Press Ctrl+C'; }
    setTimeout(() => (btn.textContent = btn.id === 'copyAll' ? 'Copy all' : 'Copy'), 1300);
  }

  let t;
  ['text', 'name', 'handle'].forEach((id) => $(id).addEventListener('input', () => { clearTimeout(t); t = setTimeout(render, 60); }));
  $('mode').onchange = render;
  $('sample').onclick = () => { $('text').value = SAMPLE; render(); };
  $('clear').onclick = () => { $('text').value = ''; render(); $('text').focus(); };
  $('copyAll').onclick = () => copy(tweets.join('\n\n---\n\n'), $('copyAll'));
  render();
})();
