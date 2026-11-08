// ThreadKit core: X style weighted character counting and thread splitting.
// Rules follow twitter-text v3: most Latin text counts 1, other scripts and emoji count 2,
// every URL counts 23, the limit is 280.
(function (root) {
  const LIMIT = 280, URL_LEN = 23;
  const ONE = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
  const URL_RE = /\b(?:https?:\/\/[^\s<>"]+|(?:[a-z0-9-]+\.)+(?:com|io|dev|ai|app|co|org|net|xyz|so|me|gg|sh|tech|page|link|ly)(?:\/[^\s<>"]*)?)/gi;
  const PICT = /\p{Extended_Pictographic}/u;
  const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;

  function graphemes(s) {
    return seg ? Array.from(seg.segment(s), (x) => x.segment) : Array.from(s);
  }
  function cpWeight(cp) {
    for (const [a, b] of ONE) if (cp >= a && cp <= b) return 1;
    return 2;
  }
  function textWeight(s) {
    let n = 0;
    for (const g of graphemes(s)) {
      if (PICT.test(g)) { n += 2; continue; }
      for (const ch of g) n += cpWeight(ch.codePointAt(0));
    }
    return n;
  }
  function trimUrl(u) { return u.replace(/[.,!?;:)\]]+$/, ''); }
  // weighted length of a tweet
  function weigh(s) {
    let n = 0, last = 0;
    URL_RE.lastIndex = 0;
    let m;
    while ((m = URL_RE.exec(s))) {
      const u = trimUrl(m[0]);
      n += textWeight(s.slice(last, m.index)) + URL_LEN;
      last = m.index + u.length;
      URL_RE.lastIndex = last;
    }
    return n + textWeight(s.slice(last));
  }
  function urls(s) {
    URL_RE.lastIndex = 0;
    return (s.match(URL_RE) || []).map(trimUrl);
  }

  // Break text into sentence like units that never cut a URL or a word.
  function units(text) {
    const out = [];
    const re = /[^.!?\n]+(?:[.!?]+["')\]]*|\n|$)\s*/g;
    let m;
    while ((m = re.exec(text))) { if (m[0]) out.push(m[0]); if (m[0] === '') re.lastIndex++; }
    // merge pieces that split inside a URL like "example.com/path"
    const merged = [];
    for (const u of out) {
      const prev = merged[merged.length - 1];
      if (prev && /[a-z0-9]\.$/i.test(prev.trimEnd()) && /^[a-z]/i.test(u) && !/\s$/.test(prev)) merged[merged.length - 1] = prev + u;
      else merged.push(u);
    }
    return merged;
  }
  function splitWords(s, max) {
    const words = s.split(/(\s+)/);
    const parts = [];
    let cur = '';
    for (const w of words) {
      if (weigh(cur + w) > max && cur.trim()) { parts.push(cur.trim()); cur = w.trimStart(); }
      else cur += w;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  }

  // numbering: 'none' | 'slash' (1/) | 'total' (1/7)
  function suffixFor(i, total, mode) {
    if (mode === 'slash') return `\n\n${i + 1}/`;
    if (mode === 'total') return `\n\n${i + 1}/${total}`;
    return '';
  }

  // Manual breaks: a line with only --- (or ===). Otherwise auto split long blocks.
  function split(text, mode = 'total') {
    text = (text || '').replace(/\r/g, '').trim();
    if (!text) return [];
    const blocks = text.split(/\n\s*(?:-{3,}|={3,})\s*\n/).map((b) => b.trim()).filter(Boolean);
    let reserve = mode === 'none' ? 0 : mode === 'slash' ? 6 : 8; // room for "\n\n12/34"
    let tweets = [];
    for (let pass = 0; pass < 3; pass++) {
      tweets = [];
      const max = LIMIT - reserve;
      for (const block of blocks) {
        if (weigh(block) <= max) { tweets.push(block); continue; }
        // prefer paragraph boundaries, fall back to sentences inside long paragraphs
        const paras = block.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
        let packed = '';
        const pieces = [];
        for (const para of paras) {
          const joined = packed ? packed + '\n\n' + para : para;
          if (weigh(joined) <= max) { packed = joined; continue; }
          if (packed) pieces.push(packed);
          packed = para;
        }
        if (packed) pieces.push(packed);
        const small = pieces.filter((p) => weigh(p) <= max);
        if (small.length === pieces.length) { tweets.push(...pieces); continue; }
        let cur = '';
        for (const piece of pieces) {
          if (weigh(piece) <= max) { if (cur.trim()) { tweets.push(cur.trim()); cur = ''; } tweets.push(piece); continue; }
        for (const u of units(piece)) {
          if (weigh(u.trim()) > max) {
            if (cur.trim()) { tweets.push(cur.trim()); cur = ''; }
            const parts = splitWords(u, max);
            parts.slice(0, -1).forEach((p) => tweets.push(p));
            cur = parts[parts.length - 1] + ' ';
            continue;
          }
          if (weigh((cur + u).trim()) > max) { tweets.push(cur.trim()); cur = u; }
          else cur += u;
        }
        if (cur.trim()) { tweets.push(cur.trim()); cur = ''; }
        }
      }
      const needed = mode === 'none' ? 0 : Math.max(...tweets.map((_, i) => weigh(suffixFor(i, tweets.length, mode))));
      if (needed <= reserve) break;
      reserve = needed;
    }
    return tweets.map((t, i) => t + suffixFor(i, tweets.length, mode));
  }

  // Practical checks that affect how a thread performs.
  function lint(tweets) {
    const w = [];
    if (!tweets.length) return w;
    tweets.forEach((t, i) => {
      const n = weigh(t);
      if (n > LIMIT) w.push({ i, level: 'error', msg: `Tweet ${i + 1} is ${n - LIMIT} over the limit.` });
      const tags = (t.match(/(^|\s)#\w+/g) || []).length;
      if (tags > 2) w.push({ i, level: 'warn', msg: `Tweet ${i + 1} has ${tags} hashtags. One or two reads better.` });
    });
    if (urls(tweets[0]).length) w.push({ i: 0, level: 'warn', msg: 'The first tweet has a link. X tends to show link posts to fewer people. Put the link in the last tweet or a reply.' });
    const first = tweets[0].replace(/\n\n\d+\/\d*$/, '');
    if (weigh(first) < 60) w.push({ i: 0, level: 'tip', msg: 'The first tweet is very short. It is your hook: say what the reader gets.' });
    if (tweets.length > 12) w.push({ i: -1, level: 'tip', msg: `${tweets.length} tweets is long. Most readers drop off after 6 to 8.` });
    const dashes = tweets.join(' ').match(/[–—]/g);
    if (dashes) w.push({ i: -1, level: 'tip', msg: `${dashes.length} long dash${dashes.length > 1 ? 'es' : ''} found. Many readers see them as a sign of AI writing.` });
    return w;
  }

  const api = { LIMIT, weigh, split, lint, urls };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ThreadKit = api;
})(this);
