/* Claudish — decoder console. One direction: Claudish in, plain English out. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    src: $('src'), out: $('out'), run: $('run'), runText: $('runText'), runKey: $('runKey'),
    copy: $('copy'), count: $('count'), status: $('status'),
    samples: $('samples'), lex: $('lex'), terms: $('terms'), qnote: $('qnote')
  };

  /* Claudish inputs, taken from the README and the specs. */
  var SAMPLES = [
    'Merge authority is restricted to the owner role.',
    'The honest shape is asymmetric: the data is correct; the format is hard to read. Correctness landed; legibility did not.',
    'The timestamp provides verified evidence of cache staleness.',
    'Here is where I would hold the line: do not launch until the tests pass. Green is the gate, not a suggestion.'
  ];

  var busy = false;
  var lastOutput = '';

  function renderSamples() {
    SAMPLES.forEach(function (text) {
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
    els.out.innerHTML = '<p class="out__empty">The plain English lands here.</p>';
    els.copy.disabled = true;
    els.terms.hidden = true;
    els.terms.innerHTML = '';
    els.qnote.hidden = true;
    lastOutput = '';
  }

  /* ── output ────────────────────────────────────────────── */
  function renderOutput(text, quality, source) {
    lastOutput = text;
    els.out.className = 'out is-en';

    var paras = text.split(/\n{2,}/).filter(function (p) { return p.trim(); });
    if (!paras.length) paras = [text];
    els.out.innerHTML = paras.map(function (p, i) {
      return '<p><span class="line" style="animation-delay:' + (i * 90) + 'ms">' +
             window.CLAUDISH.escape(p) + '</span></p>';
    }).join('');

    els.copy.disabled = false;
    renderTerms(source);
    renderQuality(quality);
  }

  /* The glosses now hang off the Claudish that went in, since what comes out
     is plain English and has nothing left to decode. */
  function renderTerms(source) {
    var found = window.CLAUDISH.loaded ? window.CLAUDISH.findTerms(source) : [];
    if (!found.length) { els.terms.hidden = true; els.terms.innerHTML = ''; return; }

    var label = document.createElement('span');
    label.className = 'terms__label';
    label.textContent = 'Terms in this passage';
    els.terms.innerHTML = '';
    els.terms.appendChild(label);

    found.forEach(function (hit) {
      var el = document.createElement('span');
      el.className = 'tm';
      el.tabIndex = 0;
      el.dataset.plain = hit.entry.plain_english;
      el.dataset.slug = hit.entry.slug;
      el.textContent = hit.surface;
      els.terms.appendChild(el);
    });
    els.terms.hidden = false;
  }

  /* Say so when the paraphrase looks lossy rather than presenting it as clean. */
  function renderQuality(quality) {
    if (!quality || !quality.issues || !quality.issues.length) {
      els.qnote.hidden = true;
      return;
    }
    els.qnote.textContent = 'Check this one: ' + quality.issues.join('; ') + '.';
    els.qnote.hidden = false;
  }

  function renderError(msg) {
    els.out.className = 'out is-err';
    els.out.innerHTML = '<p>' + window.CLAUDISH.escape(msg) + '</p>';
    els.copy.disabled = true;
    els.terms.hidden = true;
    els.qnote.hidden = true;
    lastOutput = '';
  }

  /* ── translate ─────────────────────────────────────────── */
  function setBusy(on) {
    busy = on;
    els.run.disabled = on;
    els.out.parentElement.classList.toggle('is-busy', on);
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
      body: JSON.stringify({ text: text })
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
          return data;
        });
      })
      .then(function (data) {
        renderOutput(data.output, data.quality, text);
        var q = data.quality || {};
        setStatus('done in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's' +
                  (q.candidates > 1 ? ' · ' + q.candidates + ' candidates' : ''), false);
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

  function checkStatus() {
    fetch('/api/status')
      .then(function (r) { return r.json(); })
      .then(function (s) {
        setStatus(s.ready ? 'model cached · ready'
                          : 'first run downloads the model once · this takes a while', !s.ready);
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

  renderSamples();
  clearOutput();
  updateCount();
  checkStatus();

  window.CLAUDISH.load('/dictionary/entries.json')
    .then(function (res) {
      renderLexicon(res.entries);
      reglossStatic();
    })
    .catch(function (err) {
      /* The translator still works; only the glossing degrades. */
      console.warn('dictionary unavailable:', err);
      els.lex.innerHTML =
        '<p class="lex__err">The dictionary could not be loaded, so terms are ' +
        'not annotated. The translator is unaffected.</p>';
    });
})();
