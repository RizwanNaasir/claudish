"""Translate between English and Claudish with local PAW functions."""

from __future__ import annotations

import sys

import programasweights as paw


PROGRAMS = {
    "to-claudish": "ca9d5165b6c8e6615529",
    "to-english": "e469f61ccab2699fbd51",
}


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[1] not in PROGRAMS:
        print("Usage: python translate.py {to-claudish|to-english} TEXT")
        return 2

    translate = paw.function(PROGRAMS[sys.argv[1]])
    print(translate(sys.argv[2]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
