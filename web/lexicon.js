/* Claudish lexicon.
 *
 * The dictionary itself lives in dictionary/entries.json — the curated,
 * CI-validated list that ships with the repo. This module is only the matcher:
 * it turns those entries into a regex, glosses matches with their
 * plain_english, and renders nothing on its own.
 *
 * The one thing added on top is compound handling. The dictionary names the
 * pattern ("X-gated", "hard X") but cannot enumerate every stem, so
 * source-grounded compounds are decoded from their parts.
 */
(function (global) {
  'use strict';

  /* X-gated, X-backed, X-layer … — both halves come from the input, so the
     gloss is built from the stem rather than stated in the abstract. */
  var COMPOUND = {
    gated:    'requires {x} first',
    backed:   'is supported by {x}',
    side:     'on the {x} side',
    level:    'at the {x} level',
    first:    'puts {x} first',
    safe:     'safe for {x}',
    matched:  'matched to {x}',
    layer:    'the part that handles {x}',
    surface:  'where {x} shows up',
    path:     'the route {x} takes',
    boundary: 'the limit set by {x}'
  };

  var state = { entries: [], byVariant: Object.create(null), re: null, loaded: false };

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Curly and straight apostrophes are the same character for matching. Both
     are one code unit, so offsets into the normalised string still line up
     with the original. */
  function norm(s) {
    return String(s).replace(/[‘’]/g, "'");
  }

  function reEsc(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /* Surface forms for one entry: the term (which may pack several, as in
     "land / landed"), plus every alias. Entries that are patterns rather than
     literals — "hard X", "X-gated" — are dropped here; COMPOUND covers them. */
  function variantsOf(entry) {
    var out = [];
    var seen = Object.create(null);
    function push(raw) {
      var t = norm(String(raw || '')).trim();
      if (!t || /\bX\b/.test(t)) return;
      var k = t.toLowerCase();
      if (seen[k]) return;
      seen[k] = 1;
      out.push(t);
    }
    String(entry.term || '').split('/').forEach(push);
    (entry.aliases || []).forEach(push);
    return out;
  }

  function build(doc) {
    var entries = (doc && doc.entries) || [];

    /* Honour the curated display order, then append anything not listed. */
    var order = (doc && doc.recommended_slugs) || [];
    var rank = Object.create(null);
    order.forEach(function (slug, i) { rank[slug] = i; });
    entries = entries.slice().sort(function (a, b) {
      var ra = slug_rank(rank, a), rb = slug_rank(rank, b);
      return ra - rb;
    });

    var byVariant = Object.create(null);
    var all = [];
    entries.forEach(function (e) {
      variantsOf(e).forEach(function (v) {
        var k = v.toLowerCase();
        /* Longer, more specific variants win, so never let a short alias
           overwrite an entry already claimed by a longer one. */
        if (!byVariant[k]) { byVariant[k] = e; all.push(v); }
      });
    });

    /* Longest first so "hard boundary" beats "boundary". */
    all.sort(function (a, b) { return b.length - a.length; });

    var re = null;
    if (all.length) {
      re = new RegExp(
        '\\b(?:' + all.map(reEsc).join('|') + ')\\b' +
        '|\\b(?<stem>[A-Za-z]+)-(?<suffix>' + Object.keys(COMPOUND).join('|') + ')\\b',
        'gi'
      );
    }

    state.entries = entries;
    state.byVariant = byVariant;
    state.re = re;
    state.loaded = true;
    return entries;
  }

  function slug_rank(rank, e) {
    var r = rank[e.slug];
    return r === undefined ? 1e6 : r;
  }

  /* Compound-only matcher, used when the dictionary could not be fetched. */
  function compoundOnlyRe() {
    return new RegExp(
      '\\b(?<stem>[A-Za-z]+)-(?<suffix>' + Object.keys(COMPOUND).join('|') + ')\\b',
      'gi'
    );
  }

  function lookup(surface) {
    return state.byVariant[norm(surface).toLowerCase()] || null;
  }

  /* Escape the text, wrapping any recognised term in an annotated span. */
  function annotate(text) {
    var re = state.re || compoundOnlyRe();
    var hay = norm(text);          // same length as text, so indices transfer
    var out = '';
    var last = 0;
    var m;
    re.lastIndex = 0;
    while ((m = re.exec(hay)) !== null) {
      var surface = text.slice(m.index, m.index + m[0].length);
      out += esc(text.slice(last, m.index));

      /* A real dictionary entry always beats the generic compound rule. */
      var entry = lookup(m[0]);
      var gloss, slug = '';
      if (entry) {
        gloss = entry.plain_english;
        slug = entry.slug || '';
      } else if (m.groups && m.groups.suffix) {
        gloss = COMPOUND[m.groups.suffix.toLowerCase()]
          .replace('{x}', m.groups.stem.toLowerCase());
      } else {
        out += esc(surface);
        last = m.index + m[0].length;
        continue;
      }

      out += '<span class="tm" tabindex="0" data-plain="' + esc(gloss) + '"' +
             (slug ? ' data-slug="' + esc(slug) + '"' : '') + '>' +
             esc(surface) + '</span>';
      last = m.index + m[0].length;
    }
    out += esc(text.slice(last));
    return out;
  }

  function load(url) {
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('dictionary HTTP ' + r.status);
        return r.json();
      })
      .then(function (doc) {
        build(doc);
        return { entries: state.entries, doc: doc };
      });
  }

  global.CLAUDISH = {
    load: load,
    annotate: annotate,
    lookup: lookup,
    escape: esc,
    compounds: COMPOUND,
    get entries() { return state.entries; },
    get loaded() { return state.loaded; }
  };
})(window);
