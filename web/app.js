const DATA_URL = "../data/items.json";
const IMAGES_BASE = "../data/";

let items = {};
let allNames = [];

const searchInput = document.getElementById("item-search");
const suggestionsEl = document.getElementById("suggestions");
const quantityInput = document.getElementById("quantity");
const calculateBtn = document.getElementById("calculate-btn");
const emptyState = document.getElementById("empty-state");
const resultsEl = document.getElementById("results");
const treeEl = document.getElementById("breakdown-tree");
const summaryEl = document.getElementById("summary-list");

let selectedItem = null;
let activeSuggestionIndex = -1;

init();

async function init() {
  const resp = await fetch(DATA_URL);
  items = await resp.json();
  allNames = Object.keys(items).sort((a, b) => a.localeCompare(b));

  searchInput.addEventListener("input", onSearchInput);
  searchInput.addEventListener("keydown", onSearchKeydown);
  searchInput.addEventListener("focus", onSearchInput);
  quantityInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onCalculate();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-field")) hideSuggestions();
  });
  calculateBtn.addEventListener("click", onCalculate);
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
  selectedItem = null;
  calculateBtn.disabled = true;

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
    if (e.key === "Enter") onCalculate();
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
  selectedItem = name;
  searchInput.value = name;
  hideSuggestions();
  calculateBtn.disabled = false;
  onCalculate();
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

function onCalculate() {
  const name = searchInput.value.trim();
  if (!items[name]) return;

  const quantity = Math.max(1, parseInt(quantityInput.value, 10) || 1);
  const rawTotals = {};
  const rootNode = expand(name, quantity, rawTotals, new Set());

  treeEl.innerHTML = "";
  const rootList = document.createElement("ul");
  rootList.appendChild(renderNode(rootNode));
  treeEl.appendChild(rootList);

  summaryEl.innerHTML = "";
  const sortedTotals = Object.entries(rawTotals).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [resName, total] of sortedTotals) {
    const row = document.createElement("div");
    row.className = "summary-row";
    row.appendChild(iconEl(items[resName] ? items[resName].icon : null, resName));
    const label = document.createElement("span");
    label.className = "summary-name";
    label.textContent = resName;
    const qty = document.createElement("span");
    qty.className = "summary-qty";
    qty.textContent = total.toLocaleString();
    row.appendChild(label);
    row.appendChild(qty);
    summaryEl.appendChild(row);
  }

  emptyState.classList.add("hidden");
  resultsEl.classList.remove("hidden");
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
