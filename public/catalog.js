const $ = (id) => document.getElementById(id);

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().split("T")[0];
}

function formatCoverage(coverage) {
  const expected = coverage?.expectedDays || 0;
  const present = coverage?.daysPresent || 0;
  if (expected === 0) return "0 / 0";
  const pct = Math.round((present / expected) * 1000) / 10;
  return `${present} / ${expected} (${pct}%)`;
}

function renderTags(values) {
  if (!values || values.length === 0) {
    const empty = document.createElement("span");
    empty.className = "text-sm";
    empty.textContent = "--";
    return empty;
  }

  const container = document.createElement("div");
  values.forEach((value) => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = value;
    container.appendChild(tag);
  });
  return container;
}

function renderResource(resource) {
  const card = document.createElement("div");
  card.className = "card catalog-card";

  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = resource.resourceName;
  card.appendChild(title);

  const endpoint = document.createElement("code");
  endpoint.className = "catalog-endpoint";
  endpoint.textContent = resource.endpointUrl;
  card.appendChild(endpoint);

  const coverageRow = document.createElement("div");
  coverageRow.className = "catalog-row";
  const coverageLabel = document.createElement("div");
  coverageLabel.className = "catalog-label";
  coverageLabel.textContent = "Coverage";
  const coverageValue = document.createElement("div");
  coverageValue.className = "catalog-value";
  coverageValue.textContent = formatCoverage(resource.coverage);
  coverageRow.appendChild(coverageLabel);
  coverageRow.appendChild(coverageValue);
  card.appendChild(coverageRow);

  const updatedRow = document.createElement("div");
  updatedRow.className = "catalog-row";
  const updatedLabel = document.createElement("div");
  updatedLabel.className = "catalog-label";
  updatedLabel.textContent = "Last Updated";
  const updatedValue = document.createElement("div");
  updatedValue.className = "catalog-value";
  updatedValue.textContent = formatDate(resource.lastUpdated);
  updatedRow.appendChild(updatedLabel);
  updatedRow.appendChild(updatedValue);
  card.appendChild(updatedRow);

  const fieldsBlock = document.createElement("div");
  const fieldsLabel = document.createElement("div");
  fieldsLabel.className = "catalog-label";
  fieldsLabel.textContent = "Sample Fields";
  fieldsBlock.appendChild(fieldsLabel);
  fieldsBlock.appendChild(renderTags(resource.sampleFields));
  card.appendChild(fieldsBlock);

  const metricsBlock = document.createElement("div");
  const metricsLabel = document.createElement("div");
  metricsLabel.className = "catalog-label";
  metricsLabel.textContent = "Numeric Metrics";
  metricsBlock.appendChild(metricsLabel);
  metricsBlock.appendChild(renderTags(resource.numericMetrics));
  card.appendChild(metricsBlock);

  return card;
}

function renderCatalog(data) {
  const list = $("catalogList");
  list.innerHTML = "";

  const resources = data.resources || [];
  if (resources.length === 0) {
    const empty = document.createElement("div");
    empty.className = "card";
    empty.textContent = "No catalog data available yet.";
    list.appendChild(empty);
    return;
  }

  resources.forEach((resource) => {
    list.appendChild(renderResource(resource));
  });
}

function updateSummary(data) {
  const range = data.range || {};
  const start = range.start ? range.start : "--";
  const end = range.end ? range.end : "--";
  setText("summaryRange", `${start} to ${end}`);
  setText("summaryDays", `${range.expectedDays || 0} expected days`);
  setText("summaryResources", String((data.resources || []).length));

  const lastUpdated = (data.resources || [])
    .map((r) => r.lastUpdated)
    .filter(Boolean)
    .sort()
    .slice(-1)[0];
  setText("summaryUpdated", formatDate(lastUpdated));
}

function showError(message) {
  const errorCard = $("catalogError");
  const errorText = $("catalogErrorText");
  if (errorCard) errorCard.classList.remove("hidden");
  if (errorText) errorText.textContent = message;
}

function initTheme() {
  const savedTheme = localStorage.getItem("fitbit_theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeIcon(savedTheme);

  const toggle = $("themeToggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme");
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", nextTheme);
      localStorage.setItem("fitbit_theme", nextTheme);
      updateThemeIcon(nextTheme);
    });
  }
}

function updateThemeIcon(theme) {
  const icon = document.querySelector("#themeToggle .theme-icon");
  if (icon) icon.textContent = theme === "dark" ? "L" : "D";
}

async function loadCatalog() {
  try {
    const res = await fetch("/api/catalog");
    if (!res.ok) {
      throw new Error(`Failed to load catalog (${res.status})`);
    }
    const data = await res.json();
    updateSummary(data);
    renderCatalog(data);
  } catch (err) {
    console.error(err);
    showError(err.message || "Failed to load catalog.");
  }
}

initTheme();
loadCatalog();
