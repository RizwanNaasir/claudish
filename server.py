"""Local web UI for the Claudish decoder.

Serves web/ and exposes the Claudish-to-English ProgramAsWeights function over
HTTP. The program is loaded lazily on the first translation and cached for the
life of the process; the first load downloads the bundle and base model.

    python server.py                # http://127.0.0.1:8787
    python server.py --port 9000

Only the decoding direction is served. The English-to-Claudish program exists
upstream but is deliberately never loaded here: one direction is what this
deployment needs, and holding the second would roughly double resident memory
for no benefit.
"""

from __future__ import annotations

import argparse
import os
import threading
import time
from collections import OrderedDict, deque
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

import programasweights as paw

import fidelity

DIRECTION = "to-english"
PROGRAM_ID = "e469f61ccab2699fbd51"

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
_program = None

n_ctx = int(os.environ.get("CLAUDISH_N_CTX", "2048"))

# A translation costs a couple of CPU-seconds, so the expensive endpoint is
# rate limited per client and the number of requests allowed to queue behind
# the inference lock is capped. Without the queue cap a burst just parks
# threads on the lock and every one of them waits for the whole backlog.
RATE_LIMIT = int(os.environ.get("CLAUDISH_RATE_LIMIT", "20"))
RATE_WINDOW = int(os.environ.get("CLAUDISH_RATE_WINDOW", "60"))
MAX_QUEUE = int(os.environ.get("CLAUDISH_MAX_QUEUE", "4"))

# Greedy decoding is deterministic, so re-running it changes nothing. Extra
# time only buys quality if it is spent on *different* candidates, which needs
# a non-zero temperature. The greedy answer is still tried first and returned
# immediately when it is clean, so the common case costs nothing. Measured over
# a 12-case set: 5/12 clean at BEST_OF=1, 8/12 at 4, and no further gain at 6.
BEST_OF = int(os.environ.get("CLAUDISH_BEST_OF", "4"))
TIME_BUDGET = float(os.environ.get("CLAUDISH_TIME_BUDGET", "7.0"))
RETRY_TEMPS = (0.35, 0.6, 0.85, 0.5, 0.7)

_rate_lock = threading.Lock()
_hits: "OrderedDict[str, deque]" = OrderedDict()
_inflight = 0


def client_id() -> str:
    """Identify the caller, trusting X-Forwarded-For only from the local proxy."""
    remote = request.remote_addr or "unknown"
    if remote in ("127.0.0.1", "::1"):
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[-1].strip()
    return remote


def over_rate_limit(who: str) -> float:
    """Return seconds to wait, or 0.0 when the caller is within its budget."""
    now = time.monotonic()
    cutoff = now - RATE_WINDOW
    with _rate_lock:
        seen = _hits.get(who)
        if seen is None:
            seen = _hits[who] = deque()
        _hits.move_to_end(who)

        while seen and seen[0] < cutoff:
            seen.popleft()

        # Forget idle clients so the table cannot grow without bound.
        while len(_hits) > 1024:
            _hits.popitem(last=False)

        if len(seen) >= RATE_LIMIT:
            return max(1.0, RATE_WINDOW - (now - seen[0]))

        seen.append(now)
        return 0.0


def get_program():
    """Return the cached callable, loading it on first use."""
    global _program
    if _program is not None:
        return _program
    with _load_lock:
        if _program is None:
            _program = paw.function(PROGRAM_ID, n_ctx=n_ctx)
        return _program


def best_of(fn, text: str):
    """Return the most faithful candidate the time budget can find.

    The greedy answer comes first and wins outright when the audit is clean,
    which keeps the usual request at roughly half a second. Only a suspect
    translation costs more, and never more than TIME_BUDGET.
    """
    started = time.monotonic()

    best = fn(text).strip()
    best_score, best_issues = fidelity.audit(text, best, DIRECTION)
    tried = 1

    if best_score < 1.0 and BEST_OF > 1:
        for temp in RETRY_TEMPS[: BEST_OF - 1]:
            if time.monotonic() - started > TIME_BUDGET:
                break
            candidate = fn(text, temperature=temp).strip()
            tried += 1
            score, issues = fidelity.audit(text, candidate, DIRECTION)
            if score > best_score:
                best, best_score, best_issues = candidate, score, issues
            if best_score >= 1.0:
                break

    return best, {
        "score": round(best_score, 3),
        "issues": best_issues,
        "candidates": tried,
        "elapsed_s": round(time.monotonic() - started, 2),
    }


@app.get("/api/status")
def status():
    """Report whether the program is on disk, so the UI can warn."""
    if _program is not None:
        state = "loaded"
    else:
        try:
            state = "cached" if paw.is_offline_ready(PROGRAM_ID) else "cold"
        except Exception:
            state = "cold"
    return jsonify(
        direction=DIRECTION,
        program=state,
        ready=state != "cold",
        rate_limit={"requests": RATE_LIMIT, "window_s": RATE_WINDOW},
        quality={"best_of": BEST_OF, "time_budget_s": TIME_BUDGET},
    )


@app.post("/api/translate")
def translate():
    payload = request.get_json(silent=True) or {}
    text = (payload.get("text") or "").strip()

    # "direction" is still accepted so an older client gets a clear answer
    # rather than a silently wrong one.
    direction = payload.get("direction", DIRECTION)
    if direction != DIRECTION:
        return jsonify(error="this deployment only translates Claudish to English"), 400
    if not text:
        return jsonify(error="nothing to translate"), 400
    if len(text) > MAX_CHARS:
        return jsonify(error=f"input is over the {MAX_CHARS}-character limit"), 413

    who = client_id()
    retry_after = over_rate_limit(who)
    if retry_after:
        app.logger.info("rate limited %s", who)
        return (
            jsonify(error=f"Too many translations. Try again in {int(retry_after)}s."),
            429,
            {"Retry-After": str(int(retry_after))},
        )

    global _inflight
    with _rate_lock:
        if _inflight >= MAX_QUEUE:
            return (
                jsonify(error="The translator is busy. Try again in a moment."),
                503,
                {"Retry-After": "5"},
            )
        _inflight += 1

    try:
        fn = get_program()
        with _infer_lock:
            output, quality = best_of(fn, text)
    except Exception as exc:  # surface the real reason rather than a blank 500
        return jsonify(error=f"{type(exc).__name__}: {exc}"), 500
    finally:
        with _rate_lock:
            _inflight -= 1

    return jsonify(direction=DIRECTION, output=output, quality=quality)


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
    global n_ctx

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument(
        "--n-ctx",
        type=int,
        default=n_ctx,
        help="llama.cpp context size; lower trims the KV cache",
    )
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    n_ctx = args.n_ctx

    print(f"Claudish decoder -> http://{args.host}:{args.port}")
    print(f"  n-ctx={n_ctx}  best-of={BEST_OF}  budget={TIME_BUDGET}s")
    app.run(host=args.host, port=args.port, debug=args.debug, threaded=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
