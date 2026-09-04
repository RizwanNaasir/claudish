"""Fidelity checks for a translation.

Both specs promise a paraphrase: the wording moves, the meaning does not. The
model mostly honours that, but it does drift — dropping the subject ("You can
deploy after I sign off" losing who deploys), flipping first person to second,
or quietly discarding a clause that carried a real contrast.

Nothing here understands language. These are cheap surface invariants that a
faithful paraphrase should satisfy, used to *rank* candidates rather than to
reject them, so a false positive costs a little ordering rather than a good
translation. Every check also returns a human-readable note, which is worth
surfacing even when no candidate is clean.
"""

from __future__ import annotations

import re

PERSON = {
    "first-person singular": r"\b(I|me|my|mine|myself)\b|\bI['’](m|d|ll|ve)\b",
    "second person": r"\b(you|your|yours|yourself|yourselves)\b|\byou['’](re|d|ll|ve)\b",
    "first-person plural": r"\b(we|us|our|ours|ourselves)\b|\bwe['’](re|d|ll|ve)\b",
    "third-person plural": r"\b(they|them|their|theirs|themselves)\b",
}

NEGATION = (
    r"\b(not|never|cannot|none|neither|nor|without|no)\b"
    r"|n['’]t\b"
)

# Capitalised words that are ordinary sentence starters rather than names.
_COMMON_CAPS = {
    "The", "A", "An", "This", "That", "These", "Those", "It", "There", "Here",
    "I", "We", "You", "They", "He", "She", "If", "When", "While", "After",
    "Before", "Until", "Once", "Every", "Any", "All", "No", "Not", "Do",
    "Does", "Did", "Is", "Are", "Was", "Were", "Be", "Been", "Only", "Merge",
    "Deploy", "Deployment", "Shipping", "Release", "Green", "Correctness",
}


def _has(pattern: str, text: str) -> bool:
    return bool(re.search(pattern, text, re.I))


def _numbers(text: str) -> set[str]:
    return set(re.findall(r"\b\d+(?:[.,]\d+)?\b", text))


def _names(text: str) -> set[str]:
    """Capitalised tokens that look like proper nouns, not sentence starters."""
    out = set()
    for sentence in re.split(r"(?<=[.!?;:])\s+", text):
        tokens = re.findall(r"\b[A-Z][a-zA-Z]+\b", sentence)
        for i, tok in enumerate(tokens):
            # Skip the first token of a sentence: capitalisation is uninformative.
            if i == 0 and sentence.strip().startswith(tok):
                continue
            if tok not in _COMMON_CAPS:
                out.add(tok)
    return out


def audit(src: str, out: str, direction: str) -> tuple[float, list[str]]:
    """Score a candidate in [0, 1] and describe what looks wrong with it."""
    issues: list[str] = []
    penalty = 0.0

    src_person = {k: _has(p, src) for k, p in PERSON.items()}
    out_person = {k: _has(p, out) for k, p in PERSON.items()}

    # A flip is the worst outcome: the sentence now describes someone else.
    # "I sign off" becoming "you sign off" changes who is responsible.
    first = "first-person singular"
    second = "second person"
    if src_person[first] and not src_person[second] and out_person[second] and not out_person[first]:
        issues.append("first person became second person")
        penalty += 0.6
    elif src_person[second] and not src_person[first] and out_person[first] and not out_person[second]:
        issues.append("second person became first person")
        penalty += 0.6

    # A dropped person usually means a dropped actor. Going into Claudish the
    # spec demands every idea stay recoverable, so this is a real fault. Coming
    # out of it, the spec explicitly strips rhetorical framing like "here is
    # where I would hold the line", so losing an "I" is often correct.
    drop_weight = 0.35 if direction == "to-claudish" else 0.12
    for label, present in src_person.items():
        if present and not out_person[label]:
            issues.append(f"{label} dropped")
            penalty += drop_weight

    # Inventing a person that was never in the input is always wrong.
    for label, present in out_person.items():
        if present and not src_person[label]:
            issues.append(f"{label} introduced")
            penalty += 0.3

    # Negation carries the whole meaning; losing or adding it inverts the claim.
    if _has(NEGATION, src) != _has(NEGATION, out):
        issues.append("negation changed")
        penalty += 0.4

    missing_numbers = _numbers(src) - _numbers(out)
    if missing_numbers:
        issues.append("numbers dropped: " + ", ".join(sorted(missing_numbers)))
        penalty += 0.3

    missing_names = _names(src) - _names(out)
    if missing_names:
        issues.append("names dropped: " + ", ".join(sorted(missing_names)))
        penalty += 0.3

    if direction == "to-claudish":
        # "Keep the output roughly comparable in length to the input", and
        # perform a visible rewrite rather than echoing the input back.
        if len(out) < 0.5 * len(src):
            issues.append("much shorter than the input")
            penalty += 0.25
        if out.strip().lower() == src.strip().lower():
            issues.append("unchanged from the input")
            penalty += 0.5

    return max(0.0, 1.0 - penalty), issues
