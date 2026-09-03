"""Local web UI for the Claudish translator.

Serves web/ and exposes the two ProgramAsWeights functions over HTTP. The
programs are loaded lazily on the first translation and cached for the life of
the process; the first load downloads the bundle and base model.

    python server.py                    # http://127.0.0.1:8787
    python server.py --port 9000
    python server.py --max-loaded 1     # low-memory boxes: hold one direction

Each direction costs roughly 800 MB resident, and the base model is not shared
between them, so holding both peaks near 1.6 GB. On a machine with less than
about 2 GB free, run with --max-loaded 1: the idle direction is dropped and
reloaded from the local cache on demand, which costs about a second.
"""

from __future__ import annotations

import argparse
import gc
import os
import threading
from collections import OrderedDict
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

import programasweights as paw

PROGRAMS = {
    "to-claudish": "ca9d5165b6c8e6615529",
    "to-english": "e469f61ccab2699fbd51",
}

MAX_CHARS = 4000

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
SPECS = ROOT / "specs"
DICTIONARY = ROOT / "dictionary"

app = Flask(__name__, static_folder=None)

# One lock guards loading; a second serialises inference, since the underlying
# llama.cpp context is not safe to call from several threads at once.
_load_lock = threading.Lock()
_infer_lock = threading.Lock()

# Least-recently-used first, so eviction drops the idle direction.
_loaded: "OrderedDict[str, object]" = OrderedDict()

# Defaults come from the environment so the container can be configured without
# argv; the CLI flags below still win when the module is run directly.
max_loaded = int(os.environ.get("CLAUDISH_MAX_LOADED", "2"))
n_ctx = int(os.environ.get("CLAUDISH_N_CTX", "2048"))


def get_program(direction: str):
    """Return the cached callable for a direction, loading it if needed."""
    fn = _loaded.get(direction)
    if fn is not None:
        _loaded.move_to_end(direction)
        return fn

    with _load_lock:
        fn = _loaded.get(direction)
        if fn is not None:
            _loaded.move_to_end(direction)
            return fn

        while len(_loaded) >= max_loaded:
            evicted, victim = _loaded.popitem(last=False)
            del victim
            gc.collect()
            app.logger.info("evicted %s to stay under --max-loaded", evicted)

        fn = paw.function(PROGRAMS[direction], n_ctx=n_ctx)
        _loaded[direction] = fn
        return fn


@app.get("/api/status")
def status():
    """Report whether each program is already on disk, so the UI can warn."""
    per_direction = {}
    for direction, program_id in PROGRAMS.items():
        if direction in _loaded:
            per_direction[direction] = "loaded"
            continue
        try:
            cached = bool(paw.is_offline_ready(program_id))
        except Exception:
            cached = False
        per_direction[direction] = "cached" if cached else "cold"
    return jsonify(
        programs=per_direction,
        ready=all(v != "cold" for v in per_direction.values()),
        max_loaded=max_loaded,
    )


@app.post("/api/translate")
def translate():
    payload = request.get_json(silent=True) or {}
    direction = payload.get("direction")
    text = (payload.get("text") or "").strip()

    if direction not in PROGRAMS:
        return jsonify(error=f"unknown direction: {direction!r}"), 400
    if not text:
        return jsonify(error="nothing to translate"), 400
    if len(text) > MAX_CHARS:
        return jsonify(error=f"input is over the {MAX_CHARS}-character limit"), 413

    try:
        fn = get_program(direction)
        with _infer_lock:
            output = fn(text)
    except Exception as exc:  # surface the real reason rather than a blank 500
        return jsonify(error=f"{type(exc).__name__}: {exc}"), 500

    return jsonify(direction=direction, output=str(output).strip())


@app.get("/")
def index():
    return send_from_directory(WEB, "index.html")


@app.get("/specs/<path:name>")
def spec(name: str):
    return send_from_directory(SPECS, name, mimetype="text/plain; charset=utf-8")


@app.get("/dictionary/<path:name>")
def dictionary(name: str):
    """The curated term list the UI annotates and renders from."""
    return send_from_directory(DICTIONARY, name)


@app.get("/<path:name>")
def asset(name: str):
    return send_from_directory(WEB, name)


def main() -> int:
    global max_loaded, n_ctx

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument(
        "--max-loaded",
        type=int,
        default=max_loaded,
        choices=(1, 2),
        help="how many directions to keep in memory (1 halves peak RSS)",
    )
    parser.add_argument(
        "--n-ctx",
        type=int,
        default=n_ctx,
        help="llama.cpp context size; lower trims the KV cache",
    )
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    max_loaded = args.max_loaded
    n_ctx = args.n_ctx

    print(f"Claudish UI -> http://{args.host}:{args.port}")
    print(f"  max-loaded={max_loaded}  n-ctx={n_ctx}")
    app.run(host=args.host, port=args.port, debug=args.debug, threaded=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
