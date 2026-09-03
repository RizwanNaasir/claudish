/* Claudish — translator console. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    src: $('src'), out: $('out'), run: $('run'), runText: $('runText'), runKey: $('runKey'),
    copy: $('copy'), swap: $('swap'), count: $('count'), status: $('status'),
    srcLabel: $('srcLabel'), outLabel: $('outLabel'),
    paneIn: $('paneIn'), paneOut: $('paneOut'), samples: $('samples'), lex: $('lex')
  };

  /* Sample inputs, all taken from the README and the two specs. */
  var SAMPLES = {
    'to-claudish': [
      'Only owners can merge.',
      'Do not launch until the tests pass.',
      'The release can go out after Alice approves the final report.',
      'The data is correct, but it is hard to read.'
    ],
    'to-english': [
      'Merge authority is restricted to the owner role.',
      'The honest shape is asymmetric: the data is correct; the format is hard to read. Correctness landed; legibility did not.',
      'The timestamp provides verified evidence of cache staleness.',
      'Here is where I would hold the line: do not launch until the tests pass. Green is the gate, not a suggestion.'
    ]
  };

  var LABELS = {
    'to-claudish': { from: 'Plain English', to: 'Claudish' },
    'to-english':  { from: 'Claudish',      to: 'Plain English' }
  };

  var dir = 'to-english';   // landing on the decoder is the friendlier default
  var busy = false;
  var lastOutput = '';

  /* ── direction ─────────────────────────────────────────── */
  function applyDirection() {
    var l = LABELS[dir];
    els.srcLabel.textContent = l.from;
    els.outLabel.textContent = l.to;

    var inIsClaudish = dir === 'to-english';
    els.srcLabel.className = 'tag ' + (inIsClaudish ? 'tag--cl' : 'tag--en');
    els.outLabel.className = 'tag ' + (inIsClaudish ? 'tag--en' : 'tag--cl');
    els.paneIn.classList.toggle('is-cl', inIsClaudish);

    els.src.placeholder = inIsClaudish
      ? 'Paste something suspiciously well-structured…'
      : 'Type or paste a sentence…';

    document.querySelectorAll('.switch__opt').forEach(function (b) {
      var on = b.dataset.dir === dir;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    });

    renderSamples();
    clearOutput();
  }

  function renderSamples() {
    els.samples.innerHTML = '';
    SAMPLES[dir].forEach(function (text) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = text;
      b.title = text;
      b.addEventListener('click', function () {
        els.src.value = text;
        updateCount();
        els.src.focus();
      });
      els.samples.appendChild(b);
    });
  }

  function clearOutput() {
    els.out.className = 'out';
    els.out.innerHTML = '<p class="out__empty">The translation lands here.</p>';
    els.copy.disabled = true;
    lastOutput = '';
  }

  /* ── output rendering ──────────────────────────────────── */
  function renderOutput(text) {
    lastOutput = text;
    var claudish = dir === 'to-claudish';
    els.out.className = 'out ' + (claudish ? 'is-cl' : 'is-en');

    var paras = text.split(/\n{2,}/).filter(function (p) { return p.trim(); });
    if (!paras.length) paras = [text];

    els.out.innerHTML = paras.map(function (p, i) {
      var body = claudish
        ? window.CLAUDISH.annotate(p)
        : window.CLAUDISH.escape(p);
      return '<p><span class="line" style="animation-delay:' + (i * 90) + 'ms">' +
             body + '</span></p>';
    }).join('');

    els.copy.disabled = false;
  }

  function renderError(msg) {
    els.out.className = 'out is-err';
    els.out.innerHTML = '<p>' + window.CLAUDISH.escape(msg) + '</p>';
    els.copy.disabled = true;
    lastOutput = '';
  }

  /* ── translate ─────────────────────────────────────────── */
  function setBusy(on) {
    busy = on;
    els.run.disabled = on;
    els.paneOut.classList.toggle('is-busy', on);
    els.runText.textContent = on ? 'Translating' : 'Translate';
  }

  function translate() {
    var text = els.src.value.trim();
    if (!text || busy) return;

    setBusy(true);
    var t0 = Date.now();
    var tick = setInterval(function () {
      setStatus('working · ' + Math.round((Date.now() - t0) / 1000) + 's', false);
    }, 1000);
    setStatus('working · 0s', false);

    fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction: dir, text: text })
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
          return data;
        });
      })
      .then(function (data) {
        renderOutput(data.output);
        setStatus('done in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's', false);
      })
      .catch(function (err) {
        renderError(err.message || String(err));
        setStatus('failed', true);
      })
      .finally(function () {
        clearInterval(tick);
        setBusy(false);
      });
  }

  function setStatus(msg, warn) {
    els.status.textContent = msg;
    els.status.classList.toggle('is-warn', !!warn);
  }

  /* ── model readiness ───────────────────────────────────── */
  function checkStatus() {
    fetch('/api/status')
      .then(function (r) { return r.json(); })
      .then(function (s) {
        if (!s.ready) {
          setStatus('first run downloads the model once · this takes a while', true);
        } else {
          setStatus('model cached · ready', false);
        }
      })
      .catch(function () { setStatus('backend unreachable', true); });
  }

  /* ── lexicon section ───────────────────────────────────── */
  function renderLexicon(entries) {
    var frag = document.createDocumentFragment();
    entries.forEach(function (e) {
      var row = document.createElement('div');
      row.className = 'lex__row';

      var dt = document.createElement('dt');
      dt.textContent = e.term;

      var dd = document.createElement('dd');
      dd.textContent = e.plain_english;
      if (e.example && e.example.claudish) {
        var ex = document.createElement('span');
        ex.className = 'lex__eg';
        ex.textContent = e.example.claudish;
        dd.appendChild(ex);
      }

      row.appendChild(dt);
      row.appendChild(dd);
      frag.appendChild(row);
    });
    els.lex.innerHTML = '';
    els.lex.appendChild(frag);
  }

  /* The specimen and the tells are written by hand in the markup. Re-gloss
     them from the dictionary so nothing on the page contradicts it. */
  function reglossStatic() {
    document.querySelectorAll('.tm[data-plain]').forEach(function (el) {
      var entry = window.CLAUDISH.lookup(el.textContent);
      if (entry) {
        el.dataset.plain = entry.plain_english;
        el.dataset.slug = entry.slug;
      }
    });
  }

  /* ── misc wiring ───────────────────────────────────────── */
  function updateCount() { els.count.textContent = els.src.value.length; }

  function flash(btn, word) {
    var was = btn.textContent;
    btn.textContent = word;
    setTimeout(function () { btn.textContent = was; }, 1200);
  }

  function copyText(text, btn) {
    navigator.clipboard.writeText(text)
      .then(function () { flash(btn, 'Copied'); })
      .catch(function () { flash(btn, 'Failed'); });
  }

  document.querySelectorAll('.switch__opt').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.dir === dir) return;
      dir = b.dataset.dir;
      applyDirection();
    });
  });

  els.swap.addEventListener('click', function () {
    var carry = lastOutput;
    dir = dir === 'to-claudish' ? 'to-english' : 'to-claudish';
    applyDirection();
    if (carry) { els.src.value = carry; updateCount(); }
  });

  els.run.addEventListener('click', translate);
  els.copy.addEventListener('click', function () { copyText(lastOutput, els.copy); });
  els.src.addEventListener('input', updateCount);
  els.src.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); translate(); }
  });

  document.querySelectorAll('.code__copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      copyText(btn.closest('.code').querySelector('code').textContent, btn);
    });
  });

  if (!/Mac|iPhone|iPad/.test(navigator.platform || '')) els.runKey.textContent = 'Ctrl↵';

  applyDirection();
  updateCount();
  checkStatus();

  window.CLAUDISH.load('/dictionary/entries.json')
    .then(function (res) {
      renderLexicon(res.entries);
      reglossStatic();
    })
    .catch(function (err) {
      /* The translator still works; only the glossing degrades to compounds. */
      console.warn('dictionary unavailable:', err);
      els.lex.innerHTML =
        '<p class="lex__err">The dictionary could not be loaded, so terms are ' +
        'not annotated. The translator is unaffected.</p>';
    });
})();
