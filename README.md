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

A local single-page UI for both directions, with the Claudish jargon annotated
in place so you can hover any term for its plain-English decoding.

```bash
pip install flask
python server.py
```

Then open <http://127.0.0.1:8787>. The first translation downloads the base
model once (~600 MB); after that everything runs locally and nothing leaves the
machine. `--port` and `--host` are available if 8787 is taken.

### Requirements

| | |
|---|---|
| Disk | ~710 MB of model cache (594 MB base model + 22 MB per adapter) |
| Memory | ~850 MB resident per direction; ~1.6 GB if both stay loaded |
| CPU | any x86-64 or arm64; no GPU needed |
| Python | 3.8+ |

The base model is not shared between the two directions, so holding both costs
roughly twice one. On anything under ~2 GB free, run with `--max-loaded 1` and
the idle direction is dropped and reloaded on demand:

```bash
python server.py --max-loaded 1
```

`llama-cpp-python` publishes no wheels, so on arm64 (a Raspberry Pi, say) pip
compiles it from source — install `cmake` and a C++ toolchain first, and expect
the build to take a while.

## Docker

```bash
docker compose up -d --build
```

Then open <http://127.0.0.1:8787>. The first build compiles `llama-cpp-python`
from source (there are no published wheels), so expect it to take a while; the
compiler is left behind in the build stage and does not ship in the final image.
The ~710 MB model cache lives on the `claudish-models` volume and survives
rebuilds.

The compose file pins the container to **2 CPUs and 2 GB**. That cap is not
cosmetic: llama.cpp saturates every core it can see and ignores
`OMP_NUM_THREADS`, so on a shared box the limit has to come from the container
runtime. Two cores puts a translation at roughly 2-3 s while leaving the rest of
the machine alone; remove the cap and it will use every core for about half a
second instead.

The port is bound to `127.0.0.1` so the service is not published on the LAN —
put it behind Tailscale or a reverse proxy, or change the mapping to
`"8787:8787"` if you want it reachable directly.

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
