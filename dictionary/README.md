# The Claudish–English Dictionary

This directory is the canonical source for the dictionary at
[programasweights.com/claudish/dictionary](https://programasweights.com/claudish/dictionary).

Claudish is not a collection of invented words. It is a recognizable dialect
made from ordinary English and technical terms used with unusual frequency,
in recurring combinations, metaphors, reassurances, and sentence structures.

## Suggest or edit an entry

- [Suggest a term](https://github.com/programasweights/claudish/issues/new?template=suggest-term.yml)
- To edit an existing entry, change [`entries.json`](./entries.json) and open a
  pull request.

Each entry needs:

- a stable, URL-safe `slug`;
- a short plain-English translation;
- one sentence explaining the usage;
- an illustrative Claudish example and faithful English translation; and
- optional aliases that make search useful.

Keep examples short. Do not present invented text as a Claude quotation.
Sourced specimens belong in `specimens` and must point to a public source that
explicitly identifies the text as model output.

## Validate

```bash
python dictionary/validate.py
```

The website vendors a commit-pinned copy of `entries.json`, so accepted changes
are published deliberately rather than fetched from GitHub in a visitor's
browser.
