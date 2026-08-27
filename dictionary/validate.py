#!/usr/bin/env python3
"""Validate the canonical Claudish dictionary dataset."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


DATA_PATH = Path(__file__).with_name("entries.json")
SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
REQUIRED_ENTRY_FIELDS = {
    "slug",
    "term",
    "plain_english",
    "explanation",
    "category",
    "aliases",
    "example",
}
REQUIRED_SPECIMEN_FIELDS = {
    "id",
    "quote",
    "translation",
    "note",
    "source_id",
}
REQUIRED_SOURCE_FIELDS = {"id", "title", "url", "kind", "note"}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def require_nonempty_string(value: Any, field: str) -> None:
    require(isinstance(value, str) and bool(value.strip()), f"{field} must be a non-empty string")


def validate() -> dict[str, int]:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))

    require(data.get("schema_version") == 1, "schema_version must be 1")
    for field in ("title", "description", "editorial_note"):
        require_nonempty_string(data.get(field), field)

    categories = data.get("categories")
    require(isinstance(categories, list) and categories, "categories must be a non-empty list")
    category_ids: list[str] = []
    for index, category in enumerate(categories):
        require(isinstance(category, dict), f"categories[{index}] must be an object")
        require(set(category) == {"id", "label", "description"}, f"categories[{index}] has unexpected fields")
        for field in ("id", "label", "description"):
            require_nonempty_string(category.get(field), f"categories[{index}].{field}")
        category_ids.append(category["id"])
    require(len(category_ids) == len(set(category_ids)), "category ids must be unique")

    entries = data.get("entries")
    require(isinstance(entries, list), "entries must be a list")
    require(25 <= len(entries) <= 60, "dictionary must contain between 25 and 60 entries")
    slugs: list[str] = []
    normalized_terms: list[str] = []
    last_category_index: int | None = None
    category_order = {category_id: index for index, category_id in enumerate(category_ids)}

    for index, entry in enumerate(entries):
        prefix = f"entries[{index}]"
        require(isinstance(entry, dict), f"{prefix} must be an object")
        require(set(entry) == REQUIRED_ENTRY_FIELDS, f"{prefix} has missing or unexpected fields")
        for field in ("slug", "term", "plain_english", "explanation", "category"):
            require_nonempty_string(entry.get(field), f"{prefix}.{field}")

        slug = entry["slug"]
        require(bool(SLUG_PATTERN.fullmatch(slug)), f"{prefix}.slug is invalid: {slug!r}")
        require(entry["category"] in category_order, f"{prefix}.category is unknown")
        require(
            isinstance(entry["aliases"], list)
            and all(isinstance(alias, str) and alias.strip() for alias in entry["aliases"]),
            f"{prefix}.aliases must contain only non-empty strings",
        )

        example = entry["example"]
        require(
            isinstance(example, dict) and set(example) == {"claudish", "english"},
            f"{prefix}.example must contain exactly claudish and english",
        )
        require_nonempty_string(example["claudish"], f"{prefix}.example.claudish")
        require_nonempty_string(example["english"], f"{prefix}.example.english")
        require(example["claudish"] != example["english"], f"{prefix} example must provide a real translation")

        category_index = category_order[entry["category"]]
        require(
            last_category_index is None or category_index >= last_category_index,
            f"{prefix} is outside its category group",
        )
        last_category_index = category_index
        slugs.append(slug)
        normalized_terms.append(entry["term"].casefold())

    require(len(slugs) == len(set(slugs)), "entry slugs must be unique")
    require(len(normalized_terms) == len(set(normalized_terms)), "entry terms must be unique")

    sources = data.get("sources")
    require(isinstance(sources, list) and sources, "sources must be a non-empty list")
    source_ids: list[str] = []
    for index, source in enumerate(sources):
        prefix = f"sources[{index}]"
        require(isinstance(source, dict), f"{prefix} must be an object")
        require(set(source) == REQUIRED_SOURCE_FIELDS, f"{prefix} has missing or unexpected fields")
        for field in REQUIRED_SOURCE_FIELDS:
            require_nonempty_string(source.get(field), f"{prefix}.{field}")
        require(source["url"].startswith("https://"), f"{prefix}.url must use HTTPS")
        source_ids.append(source["id"])
    require(len(source_ids) == len(set(source_ids)), "source ids must be unique")

    specimens = data.get("specimens")
    require(isinstance(specimens, list) and specimens, "specimens must be a non-empty list")
    specimen_ids: list[str] = []
    for index, specimen in enumerate(specimens):
        prefix = f"specimens[{index}]"
        require(isinstance(specimen, dict), f"{prefix} must be an object")
        require(set(specimen) == REQUIRED_SPECIMEN_FIELDS, f"{prefix} has missing or unexpected fields")
        for field in REQUIRED_SPECIMEN_FIELDS:
            require_nonempty_string(specimen.get(field), f"{prefix}.{field}")
        require(specimen["source_id"] in source_ids, f"{prefix}.source_id does not exist")
        require(specimen["quote"] != specimen["translation"], f"{prefix} must provide a real translation")
        specimen_ids.append(specimen["id"])
    require(len(specimen_ids) == len(set(specimen_ids)), "specimen ids must be unique")

    return {
        "categories": len(categories),
        "entries": len(entries),
        "sources": len(sources),
        "specimens": len(specimens),
    }


def main() -> int:
    try:
        counts = validate()
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"Dictionary validation failed: {exc}", file=sys.stderr)
        return 1

    print(
        "Dictionary valid: "
        f"{counts['entries']} entries, "
        f"{counts['specimens']} sourced specimens, "
        f"{counts['sources']} sources, "
        f"{counts['categories']} categories."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
