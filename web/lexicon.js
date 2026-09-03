/* Claudish lexicon.
   Every entry is taken from specs/claudish-to-english.md — the decode list,
   the over-formal research register, and the hyphenated-compound patterns.
   Used twice: to render the Lexicon section, and to annotate live output. */
(function (global) {
  'use strict';

  /* Ordered longest-first so multi-word entries win over their parts. */
  var TERMS = [
    // structural + process metaphors
    ['approval-gated',    'approval is required'],
    ['owner-gated',       'only owners may do it'],
    ['quality-gated',     'it has to pass a quality check first'],
    ['hard constraint',   'a strict rule'],
    ['hard boundary',     'a strict limit'],
    ['hard gate',         'a strict requirement'],
    ['hard stop',         'a firm cut-off'],
    ['context router',    'whatever decides what goes where'],
    ['routing layer',     'the part that decides where things go'],
    ['claim gate',        'the bar a claim has to clear'],
    ['exchange rate',     'the trade-off'],
    ['lower bound',       'the minimum'],
    ['load-bearing',      'essential'],
    ['gated on',          'requires first'],
    ['load bearing',      'essential'],
    ['provenance',        'where it came from'],
    ['confirmatory',      'confirming something already expected'],
    ['calibration',       'adjustment'],
    ['trajectory',        'the direction it is heading'],
    ['implicates',        'involves'],
    ['canonical',         'authoritative or official'],
    ['handoff',           'a transfer'],
    ['blocker',           'something preventing progress'],
    ['surfaced',          'appeared, was found, or was reported'],
    ['audited',           'checked'],
    ['verified',          'tested or confirmed'],
    ['headline',          'the main result'],
    ['frontier',          'the leading edge'],
    ['protocol',          'the procedure'],
    ['survives',          'holds up'],
    ['lineage',           'its history'],
    ['landed',            'merged, finished, or arrived'],
    ['matched',           'comparable'],
    ['routing',           'where things go'],
    ['horizon',           'how far ahead this looks'],
    ['gating',            'requiring'],
    ['triage',            'sorting by priority'],
    ['parity',            'sameness'],
    ['regime',            'the setup'],
    ['verdict',           'the conclusion'],
    ['frozen',            'fixed and not changing'],
    ['cleanly',           'without complications'],
    ['surface',           'the actual thing being discussed'],
    ['clears',            'passes'],
    ['stale',             'outdated'],
    ['drift',             'change or divergence over time'],
    ['spine',             'the main structure'],
    ['probe',             'a check'],
    ['slice',             'a subset'],
    ['grain',             'the natural structure of it'],
    ['shape',             'the form of it'],
    ['layer',             'the component or part'],
    ['floor',             'the minimum'],
    ['gate',              'a requirement that must be met first'],
    ['path',              'the action or option'],
    ['cell',              'one entry in the breakdown']
  ];

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

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var lookup = Object.create(null);
  TERMS.forEach(function (t) { lookup[t[0].toLowerCase()] = t[1]; });

  var alternation = TERMS
    .map(function (t) { return t[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); })
    .join('|');

  var compoundAlt = Object.keys(COMPOUND).join('|');

  /* Compounds first, then the fixed list. \b on both ends keeps "gate" out of
     "gateway" and "path" out of "pathological". */
  var RE = new RegExp(
    '\\b([A-Za-z]+)-(' + compoundAlt + ')\\b|\\b(' + alternation + ')\\b',
    'gi'
  );

  /* Escape text, then wrap any recognised term in an annotated <span>. */
  function annotate(text) {
    var out = '';
    var last = 0;
    var m;
    RE.lastIndex = 0;
    while ((m = RE.exec(text)) !== null) {
      out += esc(text.slice(last, m.index));
      /* An exact lexicon entry always beats the generic compound rule, so
         "owner-gated" glosses as itself rather than as "requires owner". */
      var gloss = lookup[m[0].toLowerCase()];
      if (!gloss && m[2]) {
        gloss = COMPOUND[m[2].toLowerCase()].replace('{x}', m[1].toLowerCase());
      }
      if (!gloss) gloss = lookup[m[3].toLowerCase()];
      out += '<span class="tm" tabindex="0" data-plain="' + esc(gloss) + '">' +
             esc(m[0]) + '</span>';
      last = m.index + m[0].length;
    }
    out += esc(text.slice(last));
    return out;
  }

  global.CLAUDISH = { terms: TERMS, compounds: COMPOUND, annotate: annotate, escape: esc };
})(window);
