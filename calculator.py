"""
Recursive crafting-resource calculator. Loads data/items.json and, given a
target item + quantity, works out the full breakdown of sub-components and
the flat total of raw (leaf) resources needed.
"""
import json
from pathlib import Path

DATA_PATH = Path(__file__).parent / "data" / "items.json"


def load_items(path=DATA_PATH):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


class Node:
    """One node in the crafting breakdown tree."""

    def __init__(self, name, qty, is_leaf):
        self.name = name
        self.qty = qty
        self.is_leaf = is_leaf
        self.children = []


def expand(items, item_name, quantity, raw_totals=None, _seen=None):
    """Recursively expands item_name x quantity into a breakdown tree,
    accumulating raw (leaf) resource totals into raw_totals.

    Returns (Node, raw_totals).
    """
    if raw_totals is None:
        raw_totals = {}
    if _seen is None:
        _seen = set()

    recipe = items.get(item_name)
    is_leaf = recipe is None or not recipe.get("materials")

    if is_leaf or item_name in _seen:
        # Treat unknown items and cycles as leaves rather than crashing.
        raw_totals[item_name] = raw_totals.get(item_name, 0) + quantity
        return Node(item_name, quantity, is_leaf=True), raw_totals

    node = Node(item_name, quantity, is_leaf=False)
    result_qty = recipe.get("result_qty") or 1
    crafts_needed = -(-quantity // result_qty)  # ceil division

    for material in recipe["materials"]:
        needed_qty = material["qty"] * crafts_needed
        child, _ = expand(
            items, material["name"], needed_qty, raw_totals, _seen | {item_name}
        )
        node.children.append(child)

    return node, raw_totals
