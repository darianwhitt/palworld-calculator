"""
Scrapes item/recipe data from palworld.wiki.gg (MediaWiki API) and writes
it to data/items.json for the calculator/GUI to use offline.

Usage: python scraper.py
"""
import json
import sys
import time
from pathlib import Path
from urllib.parse import unquote, urlparse

import mwparserfromhell
import requests

API_URL = "https://palworld.wiki.gg/api.php"
HEADERS = {"User-Agent": "PalworldCraftingCalculator/1.0 (personal hobby project)"}
REQUEST_DELAY_SECONDS = 1.0
ICON_BATCH_SIZE = 50
MAX_RETRIES = 5
OUTPUT_PATH = Path(__file__).parent / "data" / "items.json"
IMAGES_DIR = Path(__file__).parent / "data" / "images"

SESSION = requests.Session()
SESSION.headers.update(HEADERS)

# palworld.wiki.gg has no page at all for some Palworld 1.0 / Feybreak-DLC
# items (verified via allpages/search - not a scraper bug, the pages just
# don't exist yet), so their recipes can't be scraped. These are sourced
# from cross-referenced community guides (game8, nerdschalk, mobalytics,
# gamerant) as of August 2026 and applied as overrides after scraping.
MANUAL_RECIPE_OVERRIDES = {
    "AI Core": {
        "result_qty": 1,
        "station": "Advanced Workshop",
        "materials": [
            {"name": "Computer", "qty": 5},
            {"name": "Soralite Ingot", "qty": 10},
            {"name": "Thermal Core", "qty": 2},
            {"name": "Ancient Civilization Core", "qty": 1},
        ],
    },
    "Bio Battery": {
        "result_qty": 1,
        "station": "Production Assembly Line II",
        "materials": [
            {"name": "Electric Organ", "qty": 1},
            {"name": "Refined Ingot", "qty": 1},
            {"name": "Carbon Fiber", "qty": 1},
        ],
    },
    "Thermal Core": {
        "result_qty": 1,
        "station": "Production Assembly Line II",
        "materials": [
            {"name": "Flame Organ", "qty": 4},
            {"name": "Coal", "qty": 8},
            {"name": "Corrosive Solvent", "qty": 2},
            {"name": "Hexolite", "qty": 2},
        ],
    },
    "Soralite Ingot": {
        "result_qty": 1,
        "station": "Production Assembly Line",
        "materials": [
            {"name": "Soralite", "qty": 2},
            {"name": "Pure Quartz", "qty": 2},
        ],
    },
}


def apply_manual_overrides(items):
    for name, recipe in MANUAL_RECIPE_OVERRIDES.items():
        icon = items.get(name, {}).get("icon")
        items[name] = {**recipe, "icon": icon}


def _get_with_retry(params):
    """GETs the API with retry + backoff on 429s (honors Retry-After)."""
    delay = REQUEST_DELAY_SECONDS
    for attempt in range(1, MAX_RETRIES + 1):
        resp = SESSION.get(API_URL, params=params, timeout=30)
        if resp.status_code == 429:
            wait = float(resp.headers.get("Retry-After", delay * attempt))
            print(f"    rate limited, waiting {wait:.1f}s (attempt {attempt}/{MAX_RETRIES})")
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp
    resp.raise_for_status()
    return resp


def get_all_item_titles():
    titles = []
    params = {
        "action": "query",
        "list": "categorymembers",
        "cmtitle": "Category:Items",
        "cmtype": "page",  # exclude subcategory pages themselves
        "cmlimit": 500,
        "format": "json",
    }
    while True:
        resp = _get_with_retry(params)
        data = resp.json()
        titles.extend(m["title"] for m in data["query"]["categorymembers"])

        if "continue" in data:
            params["cmcontinue"] = data["continue"]["cmcontinue"]
            time.sleep(REQUEST_DELAY_SECONDS)
        else:
            break

    return titles


def get_recipe(title):
    """Returns a dict with result_qty/station/materials, or None if the
    page has no (or an empty) Crafting Recipe template."""
    params = {
        "action": "parse",
        "page": title,
        "prop": "wikitext",
        "format": "json",
    }
    resp = _get_with_retry(params)
    data = resp.json()

    if "error" in data:
        return None

    wikitext = data["parse"]["wikitext"]["*"]
    parsed = mwparserfromhell.parse(wikitext)

    for template in parsed.filter_templates():
        if template.name.strip().lower() != "crafting recipe":
            continue

        if not template.has("ingredients"):
            return None
        ingredients_raw = template.get("ingredients").value.strip()
        if not ingredients_raw:
            return None

        materials = []
        for chunk in ingredients_raw.split(";"):
            chunk = chunk.strip()
            if not chunk:
                continue
            name, _, qty = chunk.rpartition("*")
            name = name.strip()
            qty = qty.strip()
            if not name or not qty.isdigit():
                continue
            materials.append({"name": name, "qty": int(qty)})

        if not materials:
            return None

        yield_str = template.get("yield").value.strip() if template.has("yield") else "1"
        station = template.get("workbench").value.strip() if template.has("workbench") else ""

        return {
            "result_qty": int(yield_str) if yield_str.isdigit() else 1,
            "station": station,
            "materials": materials,
        }

    return None


def _chunked(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


def fetch_icons(items):
    """Looks up each item's 'File:<name> icon.png' page via the API (batched
    50 at a time), downloads any not already cached locally, and sets an
    'icon' field (relative path under data/) on each item, or None."""
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    names = list(items.keys())
    downloaded = set(p.name for p in IMAGES_DIR.glob("*"))

    for batch_num, batch in enumerate(_chunked(names, ICON_BATCH_SIZE), start=1):
        titles_param = "|".join(f"File:{n} icon.png" for n in batch)
        params = {
            "action": "query",
            "titles": titles_param,
            "prop": "imageinfo",
            "iiprop": "url",
            "format": "json",
        }
        resp = _get_with_retry(params)
        data = resp.json()
        pages = data.get("query", {}).get("pages", {})

        for page in pages.values():
            page_title = page["title"]
            if not page_title.startswith("File:") or not page_title.endswith(" icon.png"):
                continue
            item_name = page_title[len("File:"):-len(" icon.png")]
            if item_name not in items:
                continue

            if "missing" in page or "imageinfo" not in page:
                items[item_name]["icon"] = None
                continue

            url = page["imageinfo"][0]["url"]
            local_name = unquote(Path(urlparse(url).path).name)
            items[item_name]["icon"] = f"images/{local_name}"

            if local_name in downloaded:
                continue
            try:
                img_resp = SESSION.get(url, timeout=30)
                img_resp.raise_for_status()
                (IMAGES_DIR / local_name).write_bytes(img_resp.content)
                downloaded.add(local_name)
            except requests.RequestException as e:
                print(f"    failed to download {url}: {e}")
                items[item_name]["icon"] = None

        done = min(batch_num * ICON_BATCH_SIZE, len(names))
        print(f"  icons: {done}/{len(names)}")
        time.sleep(REQUEST_DELAY_SECONDS)


def reconcile_materials(items):
    """Some recipe ingredient lists reference materials that were never
    scraped as their own item: either a wiki case typo (e.g. "stone"
    instead of "Stone"), or a material with no dedicated Category:Items
    page (e.g. newer DLC ingredients). Fixes typos in place by renaming to
    the existing item's canonical casing, and adds genuinely missing
    materials as raw/leaf entries so they get their own icon and are
    searchable. Returns the list of newly added item names."""
    name_lookup = {name.lower(): name for name in items}

    for recipe in items.values():
        for material in recipe.get("materials", []):
            if material["name"] in items:
                continue
            canonical = name_lookup.get(material["name"].lower())
            if canonical:
                material["name"] = canonical

    referenced = set()
    for recipe in items.values():
        for material in recipe.get("materials", []):
            referenced.add(material["name"])

    added = sorted(referenced - set(items.keys()))
    for name in added:
        items[name] = {"result_qty": 1, "station": None, "materials": []}

    return added


def main():
    icons_only = "--icons-only" in sys.argv
    fix_missing = "--fix-missing" in sys.argv

    if icons_only or fix_missing:
        with open(OUTPUT_PATH, "r", encoding="utf-8") as f:
            items = json.load(f)
        print(f"Loaded {len(items)} existing items.")
        if fix_missing:
            added = reconcile_materials(items)
            print(f"Added {len(added)} missing referenced materials: {', '.join(added)}")
        print("Fetching icons...")
    else:
        print("Fetching item list from Category:Items ...")
        titles = get_all_item_titles()
        print(f"Found {len(titles)} pages. Fetching recipes...")

        items = {}
        for i, title in enumerate(titles, start=1):
            try:
                recipe = get_recipe(title)
            except requests.RequestException as e:
                print(f"  [{i}/{len(titles)}] {title}: request failed ({e}), skipping")
                continue

            if recipe is not None:
                items[title] = recipe
                print(f"  [{i}/{len(titles)}] {title}: {len(recipe['materials'])} ingredients")
            else:
                items[title] = {"result_qty": 1, "station": None, "materials": []}
                print(f"  [{i}/{len(titles)}] {title}: raw resource / no recipe")

            time.sleep(REQUEST_DELAY_SECONDS)

        print("Fetching icons...")

    apply_manual_overrides(items)
    fetch_icons(items)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(items, f, indent=2, ensure_ascii=False)

    craftable = sum(1 for v in items.values() if v["materials"])
    with_icons = sum(1 for v in items.values() if v.get("icon"))
    print(f"\nWrote {len(items)} items ({craftable} craftable, {with_icons} with icons) to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
