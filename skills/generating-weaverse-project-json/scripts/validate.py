#!/usr/bin/env python3
"""
Weaverse Project Export JSON Validator

Validates a Weaverse project export JSON file against the import contract.
Checks structural integrity, reference integrity, and common errors.

Usage:
    python validate.py <path-to-export.json>

Exit codes:
    0 - All checks passed
    1 - Validation errors found
    2 - File not found or invalid JSON
"""

# Keeps `dict | None`-style hints from being evaluated, so the validator runs on
# the system Python of older macOS installs (3.8/3.9), not only 3.10+.
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

# CUID: 25-char lowercase alphanumeric (e.g., b98mnnqmv3tmce7wmw3l7vw4)
CUID_PATTERN = re.compile(r"^[a-z0-9]{20,30}$")

# UUID: hyphenated format (e.g., 019b917a-f48f-72d4-aee7-3b1eae6b7dca)
UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)


def load_json(path: str) -> dict | None:
    """Load and parse JSON file."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"ERROR: File not found: {path}")
        return None
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON: {e}")
        return None


def validate(data: dict) -> tuple[list[str], list[str]]:
    """Validate export data and return (errors, warnings)."""
    errors = []
    warnings = []

    # --- Top-level fields ---
    for field in ("version", "exportedAt", "project"):
        if field not in data:
            errors.append(f"Missing required top-level field: '{field}'")

    if "project" in data:
        project = data["project"]
        if not isinstance(project, dict):
            errors.append("'project' must be an object")
        else:
            if "name" not in project:
                errors.append("Missing required field: 'project.name'")
            if "config" not in project:
                errors.append("Missing required field: 'project.config'")
            elif not isinstance(project["config"], dict):
                errors.append("'project.config' must be an object")

    # --- Pages ---
    pages = data.get("pages", [])
    if not isinstance(pages, list):
        errors.append("'pages' must be an array")
        return errors, warnings


    all_page_ids = []
    all_item_ids = []

    for i, page in enumerate(pages):
        prefix = f"pages[{i}]"

        if not isinstance(page, dict):
            errors.append(f"{prefix}: page must be an object")
            continue

        # Required page fields
        for field in ("id", "name", "rootId", "items"):
            if field not in page:
                errors.append(f"{prefix}: missing required field '{field}'")

        page_id = page.get("id", f"<missing-id-{i}>")
        page_name = page.get("name", f"<unnamed-{i}>")
        root_id = page.get("rootId")
        items = page.get("items", [])

        all_page_ids.append(page_id)

        # Check page ID format (should be CUID)
        if page_id and not page_id.startswith("<") and not CUID_PATTERN.match(page_id):
            warnings.append(
                f"{prefix} ({page_name}): page id '{page_id}' does not look like a CUID (expected 20-30 char lowercase alphanumeric)"
            )

        if not isinstance(items, list):
            errors.append(f"{prefix} ({page_name}): 'items' must be an array")
            continue

        # Build item index for this page
        page_item_ids = []
        item_map = {}

        for j, item in enumerate(items):
            item_prefix = f"{prefix}.items[{j}]"

            if not isinstance(item, dict):
                errors.append(f"{item_prefix}: item must be an object")
                continue

            if "id" not in item:
                errors.append(f"{item_prefix}: missing required field 'id'")
                continue

            if "type" not in item:
                errors.append(f"{item_prefix}: missing required field 'type'")

            # data and children are required on every item
            if "data" not in item:
                errors.append(
                    f"{item_prefix} (type={item.get('type', '?')}): missing required field 'data' — use {'{}'} for items with no settings"
                )
            if "children" not in item:
                errors.append(
                    f"{item_prefix} (type={item.get('type', '?')}): missing required field 'children' — use [] for leaf items"
                )

            item_id = item["id"]
            page_item_ids.append(item_id)
            all_item_ids.append(item_id)
            item_map[item_id] = item

            # Check item ID format (should be UUID)
            if not UUID_PATTERN.match(item_id):
                warnings.append(
                    f"{prefix} ({page_name}): item id '{item_id}' does not look like a UUID (expected format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)"
                )

        # rootId must resolve to an item in this page
        if root_id and root_id not in item_map:
            errors.append(
                f"{prefix} ({page_name}): rootId '{root_id}' does not match any item id in this page"
            )
        elif root_id and root_id in item_map:
            root_item = item_map[root_id]
            if root_item.get("type") != "main":
                errors.append(
                    f"{prefix} ({page_name}): root item '{root_id}' has type '{root_item.get('type')}', expected 'main'"
                )

        # Check children references
        for item_id, item in item_map.items():
            children = item.get("children", [])
            if children is None:
                continue
            if not isinstance(children, list):
                errors.append(
                    f"{prefix} ({page_name}): item '{item_id}' children must be an array"
                )
                continue

            for k, child in enumerate(children):
                if not isinstance(child, dict):
                    errors.append(
                        f"{prefix} ({page_name}): item '{item_id}' children[{k}] must be an object with 'id', got {type(child).__name__}"
                    )
                    continue

                if "id" not in child:
                    errors.append(
                        f"{prefix} ({page_name}): item '{item_id}' children[{k}] missing 'id'"
                    )
                    continue

                child_id = child["id"]

                # Check for nested full objects (common mistake)
                if "type" in child:
                    errors.append(
                        f"{prefix} ({page_name}): item '{item_id}' children[{k}] contains 'type' - children should be id-references only, not nested items"
                    )

                # Check child resolves within same page
                if child_id not in item_map:
                    errors.append(
                        f"{prefix} ({page_name}): item '{item_id}' references child '{child_id}' which does not exist in this page's items"
                    )

    # --- Duplicate page IDs ---
    page_id_counts = Counter(all_page_ids)
    for pid, count in page_id_counts.items():
        if count > 1:
            errors.append(f"Duplicate page id: '{pid}' appears {count} times")

    # --- Duplicate item IDs (across entire export) ---
    item_id_counts = Counter(all_item_ids)
    for iid, count in item_id_counts.items():
        if count > 1:
            errors.append(f"Duplicate item id: '{iid}' appears {count} times")

    # --- Page assignments ---
    assignments = data.get("pageAssignments", [])
    if not isinstance(assignments, list):
        errors.append("'pageAssignments' must be an array")
    else:
        page_id_set = set(all_page_ids)
        for i, assignment in enumerate(assignments):
            a_prefix = f"pageAssignments[{i}]"

            if not isinstance(assignment, dict):
                errors.append(f"{a_prefix}: assignment must be an object")
                continue

            for field in ("pageId", "type", "handle", "locale"):
                if field not in assignment:
                    errors.append(f"{a_prefix}: missing required field '{field}'")

            a_page_id = assignment.get("pageId")
            if a_page_id and a_page_id not in page_id_set:
                errors.append(
                    f"{a_prefix}: pageId '{a_page_id}' does not match any page id"
                )

    return errors, warnings


def main():
    if len(sys.argv) < 2:
        print("Usage: python validate.py <path-to-export.json>")
        sys.exit(2)

    path = sys.argv[1]
    data = load_json(path)
    if data is None:
        sys.exit(2)

    errors, warnings = validate(data)

    if warnings:
        print(f"\nWarnings ({len(warnings)}):\n")
        for i, warn in enumerate(warnings, 1):
            print(f"  {i}. {warn}")

    if errors:
        print(f"\nValidation FAILED with {len(errors)} error(s):\n")
        for i, err in enumerate(errors, 1):
            print(f"  {i}. {err}")
        print()
        sys.exit(1)
    else:
        print("\nValidation PASSED - all checks clean.\n")

        # Print summary
        pages = data.get("pages", [])
        total_items = sum(len(p.get("items", [])) for p in pages)
        assignments = data.get("pageAssignments", [])
        print(f"  Pages: {len(pages)}")
        print(f"  Total items: {total_items}")
        print(f"  Page assignments: {len(assignments)}")
        print()
        sys.exit(0)


if __name__ == "__main__":
    main()
