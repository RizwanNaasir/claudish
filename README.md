# Claudish

Translate between plain English and deliberately over-engineered “Claudish”
with two tiny [ProgramAsWeights](https://programasweights.com) functions.

**[Try the live demo](https://programasweights.com/claudish)**

## Python

```bash
pip install programasweights --extra-index-url https://pypi.programasweights.com/simple/
```

```python
import programasweights as paw

to_claudish = paw.function("ca9d5165b6c8e6615529")
to_english = paw.function("e469f61ccab2699fbd51")

print(to_claudish("Only owners can merge."))
print(to_english("The honest shape is asymmetric: the data is correct; the format is hard to read. Correctness landed; legibility did not."))
```

The programs download once and then run locally. Pass no `max_tokens`; PAW
stops naturally at EOS.

For a small command-line wrapper:

```bash
python translate.py to-claudish "The release can go out after Alice approves the final report."
python translate.py to-english "Here’s where I’d hold the line: do not launch until the tests pass. Green is the gate, not a suggestion."
```

## Web UI

A local single-page decoder: paste Claudish, get back what it actually says.
Every dictionary term found in the passage is listed underneath with its
plain-English meaning.

```bash
pip install flask
python server.py
```

Then open <http://127.0.0.1:8787>. The first translation downloads the base
model once (~600 MB); after that everything runs locally and nothing leaves the
machine.

Only the Claudish-to-English direction is served. The reverse program still
exists upstream, but this deployment never loads it: one direction is what it
needs, and the base model is not shared between the two, so holding both would
roughly double resident memory.

### Fidelity

The specs promise a paraphrase, and the model mostly delivers one — but it does
drift, dropping a subject or flipping first person to second. Greedy decoding is
deterministic, so simply allowing more time changes nothing; it only helps when
spent on *different* candidates.

So the greedy answer is audited against cheap surface invariants (person,
negation, numbers, names) and returned immediately when it is clean. Only a
suspect translation is retried at a non-zero temperature, and the most faithful
candidate wins. Anything still wrong is reported next to the output rather than
hidden. Measured over a 12-case set:

| `CLAUDISH_BEST_OF` | clean | mean score | mean time |
|---|---|---|---|
| 1 (greedy only) | 5/12 | 0.812 | 0.42 s |
| **4 (default)** | **8/12** | **0.888** | **1.19 s** |
| 6 | 7/12 | 0.888 | 1.70 s |

Six buys nothing over four. `CLAUDISH_TIME_BUDGET` (default 7 s) caps the search.

### Limits

`/api/translate` is rate limited per client — `CLAUDISH_RATE_LIMIT` requests
(default 20) per `CLAUDISH_RATE_WINDOW` seconds (default 60), answered with 429
and a `Retry-After`. `CLAUDISH_MAX_QUEUE` (default 4) bounds how many requests
may queue behind the inference lock, since inference is serialised and a burst
would otherwise park threads waiting out the whole backlog.

### Requirements

| | |
|---|---|
| Disk | ~616 MB of model cache (594 MB base + 22 MB adapter) |
| Memory | ~400 MB resident |
| CPU | any x86-64 or arm64; no GPU needed |
| Python | 3.8+ (3.12 in the container) |

## Specs

- [`specs/english-to-claudish.md`](specs/english-to-claudish.md)
- [`specs/claudish-to-english.md`](specs/claudish-to-english.md)

Copy either spec into your own PAW program or adapt it for another model or
workflow.

## Public programs

- [English → Claudish](https://programasweights.com/hub/ca9d5165b6c8e6615529)
- [Claudish → English](https://programasweights.com/hub/e469f61ccab2699fbd51)

Inspired by
[gvzdv/claudish-to-english](https://github.com/gvzdv/claudish-to-english).
This is an unofficial parody project and is not affiliated with Anthropic.
