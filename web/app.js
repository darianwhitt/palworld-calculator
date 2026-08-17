const DATA_URL = "../data/items.json";
const IMAGES_BASE = "../data/";
const STORAGE_KEY_LIST = "palworld-craft-list";
const STORAGE_KEY_OWNED = "palworld-owned-resources";

const RARITY_ORDER = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 };

let items = {};
let allNames = [];
let craftList = []; // [{name, qty}]
let ownedResources = new Set();

const searchInput = document.getElementById("item-search");
const suggestionsEl = document.getElementById("suggestions");
const quantityInput = document.getElementById("quantity");
const addBtn = document.getElementById("add-btn");
const emptyState = document.getElementById("empty-state");
const resultsEl = document.getElementById("results");
const treeEl = document.getElementById("breakdown-tree");
const summaryEl = document.getElementById("summary-list");
const craftListEl = document.getElementById("craft-list");
const schematicPanel = document.getElementById("schematic-panel");
const schematicTable = document.getElementById("schematic-table");

let activeSuggestionIndex = -1;

init();

async function init() {
  const resp = await fetch(DATA_URL);
  items = await resp.json();
  allNames = Object.keys(items).sort((a, b) => a.localeCompare(b));

  loadState();

  searchInput.addEventListener("input", onSearchInput);
  searchInput.addEventListener("keydown", onSearchKeydown);
  searchInput.addEventListener("focus", onSearchInput);
  quantityInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onAddToList();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-field")) hideSuggestions();
  });
  addBtn.addEventListener("click", onAddToList);

  renderAll();
}

function loadState() {
  try {
    const rawList = localStorage.getItem(STORAGE_KEY_LIST);
    if (rawList) {
      craftList = JSON.parse(rawList).filter((e) => items[e.name] && e.qty > 0);
    }
  } catch (e) {
    craftList = [];
  }
  try {
    const rawOwned = localStorage.getItem(STORAGE_KEY_OWNED);
    if (rawOwned) ownedResources = new Set(JSON.parse(rawOwned));
  } catch (e) {
    ownedResources = new Set();
  }
}

function saveList() {
  localStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(craftList));
}

function saveOwned() {
  localStorage.setItem(STORAGE_KEY_OWNED, JSON.stringify([...ownedResources]));
}

function iconEl(iconPath, altName) {
  if (!iconPath) {
    const div = document.createElement("div");
    div.className = "icon-fallback";
    return div;
  }
  const img = document.createElement("img");
  img.className = "icon";
  img.src = IMAGES_BASE + iconPath;
  img.alt = altName;
  img.loading = "lazy";
  img.onerror = () => {
    const fallback = document.createElement("div");
    fallback.className = "icon-fallback";
    img.replaceWith(fallback);
  };
  return img;
}

function onSearchInput() {
  const query = searchInput.value.trim().toLowerCase();
  addBtn.disabled = true;
  schematicPanel.classList.add("hidden");

  if (!query) {
    hideSuggestions();
    return;
  }

  const matches = allNames.filter((n) => n.toLowerCase().includes(query)).slice(0, 40);
  renderSuggestions(matches);
}

function renderSuggestions(matches) {
  suggestionsEl.innerHTML = "";
  activeSuggestionIndex = -1;

  if (matches.length === 0) {
    hideSuggestions();
    return;
  }

  matches.forEach((name) => {
    const row = document.createElement("div");
    row.className = "suggestion-item";
    row.appendChild(iconEl(items[name].icon, name));
    const label = document.createElement("span");
    label.textContent = name;
    row.appendChild(label);
    row.addEventListener("click", () => pickItem(name));
    suggestionsEl.appendChild(row);
  });

  suggestionsEl.classList.remove("hidden");
}

function hideSuggestions() {
  suggestionsEl.classList.add("hidden");
  suggestionsEl.innerHTML = "";
  activeSuggestionIndex = -1;
}

function onSearchKeydown(e) {
  const rows = Array.from(suggestionsEl.children);
  if (suggestionsEl.classList.contains("hidden") || rows.length === 0) {
    if (e.key === "Enter") tryDirectAdd();
    return;
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, rows.length - 1);
    updateActiveSuggestion(rows);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
    updateActiveSuggestion(rows);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (activeSuggestionIndex >= 0) {
      rows[activeSuggestionIndex].click();
    } else if (rows.length > 0) {
      rows[0].click();
    }
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
}

function updateActiveSuggestion(rows) {
  rows.forEach((row, i) => row.classList.toggle("active", i === activeSuggestionIndex));
  if (activeSuggestionIndex >= 0) {
    rows[activeSuggestionIndex].scrollIntoView({ block: "nearest" });
  }
}

function pickItem(name) {
  searchInput.value = name;
  hideSuggestions();
  addBtn.disabled = false;
  renderSchematicPanel(name);
}

function tryDirectAdd() {
  const name = searchInput.value.trim();
  if (!items[name]) return;
  addBtn.disabled = false;
  onAddToList();
}

function onAddToList() {
  const name = searchInput.value.trim();
  if (!items[name]) return;

  const qty = Math.max(1, parseInt(quantityInput.value, 10) || 1);
  const existing = craftList.find((e) => e.name === name);
  if (existing) {
    existing.qty += qty;
  } else {
    craftList.push({ name, qty });
  }
  saveList();

  searchInput.value = "";
  quantityInput.value = 1;
  addBtn.disabled = true;
  schematicPanel.classList.add("hidden");
  hideSuggestions();

  renderAll();
}

function removeFromList(index) {
  craftList.splice(index, 1);
  saveList();
  renderAll();
}

function updateQty(index, rawValue) {
  const qty = Math.max(1, parseInt(rawValue, 10) || 1);
  craftList[index].qty = qty;
  saveList();
  renderAll();
}

function expand(itemName, quantity, rawTotals, seen) {
  const recipe = items[itemName];
  const isLeaf = !recipe || !recipe.materials || recipe.materials.length === 0;

  if (isLeaf || seen.has(itemName)) {
    rawTotals[itemName] = (rawTotals[itemName] || 0) + quantity;
    return { name: itemName, qty: quantity, isLeaf: true, icon: recipe ? recipe.icon : null, children: [] };
  }

  const node = { name: itemName, qty: quantity, isLeaf: false, icon: recipe.icon, children: [] };
  const resultQty = recipe.result_qty || 1;
  const craftsNeeded = Math.ceil(quantity / resultQty);
  const nextSeen = new Set(seen);
  nextSeen.add(itemName);

  for (const material of recipe.materials) {
    const neededQty = material.qty * craftsNeeded;
    node.children.push(expand(material.name, neededQty, rawTotals, nextSeen));
  }

  return node;
}

function renderAll() {
  renderCraftList();

  if (craftList.length === 0) {
    emptyState.classList.remove("hidden");
    resultsEl.classList.add("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  resultsEl.classList.remove("hidden");

  const combinedRaw = {};
  const rootNodes = [];
  for (const entry of craftList) {
    const rawTotals = {};
    const node = expand(entry.name, entry.qty, rawTotals, new Set());
    rootNodes.push(node);
    for (const [name, total] of Object.entries(rawTotals)) {
      combinedRaw[name] = (combinedRaw[name] || 0) + total;
    }
  }

  renderBreakdown(rootNodes);
  renderSummary(combinedRaw);
}

function renderCraftList() {
  craftListEl.innerHTML = "";

  if (craftList.length === 0) {
    const p = document.createElement("div");
    p.className = "craft-list-empty";
    p.textContent = "No items added yet.";
    craftListEl.appendChild(p);
    return;
  }

  craftList.forEach((entry, i) => {
    const row = document.createElement("div");
    row.className = "craft-list-row";
    row.appendChild(iconEl(items[entry.name] ? items[entry.name].icon : null, entry.name));

    const name = document.createElement("span");
    name.className = "craft-list-name";
    name.textContent = entry.name;
    row.appendChild(name);

    const qtyInput = document.createElement("input");
    qtyInput.type = "number";
    qtyInput.min = "1";
    qtyInput.className = "craft-list-qty";
    qtyInput.value = entry.qty;
    qtyInput.addEventListener("change", () => updateQty(i, qtyInput.value));
    row.appendChild(qtyInput);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "craft-list-remove";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove from list";
    removeBtn.addEventListener("click", () => removeFromList(i));
    row.appendChild(removeBtn);

    craftListEl.appendChild(row);
  });
}

function renderBreakdown(rootNodes) {
  treeEl.innerHTML = "";
  const autoExpand = rootNodes.length <= 3;

  rootNodes.forEach((node) => {
    const details = document.createElement("details");
    details.open = autoExpand;

    const summary = document.createElement("summary");
    summary.appendChild(iconEl(node.icon, node.name));
    const label = document.createElement("span");
    label.textContent = node.name;
    summary.appendChild(label);
    const qty = document.createElement("span");
    qty.className = "node-qty";
    qty.textContent = "x" + node.qty.toLocaleString();
    summary.appendChild(qty);
    details.appendChild(summary);

    if (node.children.length > 0) {
      const ul = document.createElement("ul");
      for (const child of node.children) {
        ul.appendChild(renderNode(child));
      }
      details.appendChild(ul);
    }

    treeEl.appendChild(details);
  });
}

function renderNode(node) {
  const li = document.createElement("li");
  const row = document.createElement("div");
  row.className = "node-row";
  row.appendChild(iconEl(node.icon, node.name));

  const name = document.createElement("span");
  name.className = "node-name" + (node.isLeaf ? " raw" : "");
  name.textContent = node.name;
  row.appendChild(name);

  const qty = document.createElement("span");
  qty.className = "node-qty";
  qty.textContent = "x" + node.qty.toLocaleString();
  row.appendChild(qty);

  li.appendChild(row);

  if (node.children.length > 0) {
    const ul = document.createElement("ul");
    for (const child of node.children) {
      ul.appendChild(renderNode(child));
    }
    li.appendChild(ul);
  }

  return li;
}

function renderSummary(rawTotals) {
  summaryEl.innerHTML = "";
  const sortedTotals = Object.entries(rawTotals).sort((a, b) => a[0].localeCompare(b[0]));

  for (const [resName, total] of sortedTotals) {
    const isOwned = ownedResources.has(resName);
    const row = document.createElement("div");
    row.className = "summary-row" + (isOwned ? " owned" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isOwned;
    checkbox.title = "Mark as already have this";
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) ownedResources.add(resName);
      else ownedResources.delete(resName);
      saveOwned();
      row.classList.toggle("owned", checkbox.checked);
    });
    row.appendChild(checkbox);

    row.appendChild(iconEl(items[resName] ? items[resName].icon : null, resName));

    const label = document.createElement("span");
    label.className = "summary-name";
    label.textContent = resName;
    row.appendChild(label);

    const qty = document.createElement("span");
    qty.className = "summary-qty";
    qty.textContent = total.toLocaleString();
    row.appendChild(qty);

    summaryEl.appendChild(row);
  }
}

function renderSchematicPanel(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped} Schematic(?: (\\d+))?$`);
  const matches = allNames.filter((n) => pattern.test(n));

  if (matches.length === 0) {
    schematicPanel.classList.add("hidden");
    schematicTable.innerHTML = "";
    return;
  }

  const tiers = matches
    .map((n) => ({ name: n, rarity: items[n].rarity || "Unknown" }))
    .sort((a, b) => (RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99));

  schematicTable.innerHTML = "";

  for (const tier of tiers) {
    const rawTotals = {};
    expand(tier.name, 1, rawTotals, new Set());

    const row = document.createElement("div");
    row.className = "schematic-row";

    const swatch = document.createElement("span");
    swatch.className = "rarity-swatch";
    swatch.style.background = `var(--rarity-${tier.rarity.toLowerCase()}, var(--text-dim))`;
    row.appendChild(swatch);

    const rarityLabel = document.createElement("span");
    rarityLabel.className = "rarity-name";
    rarityLabel.textContent = tier.rarity;
    row.appendChild(rarityLabel);

    const cost = document.createElement("div");
    cost.className = "schematic-cost";
    const entries = Object.entries(rawTotals).sort((a, b) => a[0].localeCompare(b[0]));

    if (entries.length === 1 && entries[0][0] === tier.name) {
      cost.textContent = "Obtained directly (drop/loot) — not craftable from other items";
    } else {
      for (const [resName, total] of entries) {
        const span = document.createElement("span");
        span.textContent = `${resName} x${total.toLocaleString()}`;
        cost.appendChild(span);
      }
    }
    row.appendChild(cost);

    schematicTable.appendChild(row);
  }

  schematicPanel.classList.remove("hidden");
}
