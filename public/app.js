const state = {
  rows: [],
  devices: [],
  selectedType: "all",
  loginEnabled: false,
  authenticated: false,
  map: null,
  layer: null,
};

const palette = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#9333ea",
  "#f97316",
  "#0891b2",
  "#be123c",
  "#4d7c0f",
];

const els = {
  filters: document.getElementById("filters"),
  dateFilter: document.getElementById("dateFilter"),
  deviceFilter: document.getElementById("deviceFilter"),
  logoutButton: document.getElementById("logoutButton"),
  statusPill: document.getElementById("statusPill"),
  totalCount: document.getElementById("totalCount"),
  uploadCount: document.getElementById("uploadCount"),
  downloadCount: document.getElementById("downloadCount"),
  harvestCount: document.getElementById("harvestCount"),
  map: document.getElementById("map"),
  fallbackMap: document.getElementById("fallbackMap"),
  legend: document.getElementById("legend"),
  recordsBody: document.getElementById("recordsBody"),
  lastUpdated: document.getElementById("lastUpdated"),
};

function malaysiaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function formatTime(epoch) {
  if (!epoch) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(epoch * 1000));
}

function setStatus(text, isError = false) {
  els.statusPill.textContent = text;
  els.statusPill.classList.toggle("error", isError);
}

function colorForDevice(deviceId) {
  const deviceIds = [...new Set(state.rows.map((row) => row.deviceId))].sort();
  const index = Math.max(0, deviceIds.indexOf(deviceId));
  return palette[index % palette.length];
}

function typeLabel(type) {
  if (type === "upload") return "Upload";
  if (type === "download") return "Download";
  if (type === "harvest_upload") return "Harvest";
  return type;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function filteredRows() {
  if (state.selectedType === "all") {
    return state.rows;
  }
  return state.rows.filter((row) => row.type === state.selectedType);
}

function updateStats(summary) {
  els.totalCount.textContent = summary.total ?? 0;
  els.uploadCount.textContent = summary.uploads ?? 0;
  els.downloadCount.textContent = summary.downloads ?? 0;
  els.harvestCount.textContent = summary.harvestUploads ?? 0;
}

function updateDeviceFilter(devices) {
  const selected = els.deviceFilter.value;
  const options = ['<option value="all">All devices</option>'];
  for (const device of devices) {
    options.push(
      `<option value="${escapeHtml(device.deviceId)}">${escapeHtml(device.deviceId)} (${escapeHtml(device.role)})</option>`
    );
  }
  els.deviceFilter.innerHTML = options.join("");
  els.deviceFilter.value = [...devices.map((device) => device.deviceId), "all"].includes(selected)
    ? selected
    : "all";
}

function renderLegend(rows) {
  const deviceIds = [...new Set(rows.map((row) => row.deviceId))].sort();
  if (!deviceIds.length) {
    els.legend.innerHTML = '<span class="legend-item">No map points</span>';
    return;
  }

  els.legend.innerHTML = deviceIds
    .map(
      (deviceId) => `
        <span class="legend-item">
          <span class="legend-dot" style="background:${colorForDevice(deviceId)}"></span>
          ${escapeHtml(deviceId)}
        </span>
      `
    )
    .join("");
}

function initLeafletMap() {
  if (!window.L || state.map) {
    return Boolean(state.map);
  }

  state.map = L.map("map", {
    zoomControl: true,
    attributionControl: true,
  }).setView([2.869641, 101.65313], 14);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  }).addTo(state.map);

  state.layer = L.layerGroup().addTo(state.map);
  return true;
}

function renderLeafletMap(rows) {
  els.map.hidden = false;
  els.fallbackMap.hidden = true;
  state.layer.clearLayers();

  const bounds = [];
  rows.forEach((row) => {
    if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) return;

    const marker = L.circleMarker([row.lat, row.lon], {
      radius: row.type === "download" ? 9 : 7,
      color: "#ffffff",
      weight: 2,
      fillColor: colorForDevice(row.deviceId),
      fillOpacity: row.type === "download" ? 0.82 : 0.68,
    });
    marker.bindPopup(`
      <strong>${escapeHtml(typeLabel(row.type))}</strong><br>
      Device: ${escapeHtml(row.deviceId)}<br>
      Record: ${escapeHtml(row.recordId)}<br>
      Lat/Lon: ${escapeHtml(row.lat)}, ${escapeHtml(row.lon)}<br>
      Server: ${escapeHtml(formatTime(row.serverTs))}
    `);
    marker.addTo(state.layer);
    bounds.push([row.lat, row.lon]);
  });

  if (bounds.length === 1) {
    state.map.setView(bounds[0], 16);
  } else if (bounds.length > 1) {
    state.map.fitBounds(bounds, { padding: [38, 38], maxZoom: 17 });
  }
}

function renderFallbackMap(rows) {
  els.map.hidden = true;
  els.fallbackMap.hidden = false;
  els.fallbackMap.innerHTML = "";

  if (!rows.length) {
    els.fallbackMap.innerHTML = '<div class="empty-state">No map points for this filter.</div>';
    return;
  }

  const lats = rows.map((row) => row.lat);
  const lons = rows.map((row) => row.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latRange = maxLat - minLat || 0.001;
  const lonRange = maxLon - minLon || 0.001;

  for (const row of rows) {
    const dot = document.createElement("button");
    dot.className = "fallback-dot";
    dot.type = "button";
    dot.style.left = `${8 + ((row.lon - minLon) / lonRange) * 84}%`;
    dot.style.top = `${92 - ((row.lat - minLat) / latRange) * 84}%`;
    dot.style.background = colorForDevice(row.deviceId);
    dot.dataset.label = `${row.deviceId} ${typeLabel(row.type)}`;
    dot.title = `${row.deviceId} ${typeLabel(row.type)} ${row.lat}, ${row.lon}`;
    els.fallbackMap.appendChild(dot);
  }
}

function renderMap() {
  const rows = filteredRows().filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lon));
  renderLegend(rows);

  if (initLeafletMap()) {
    renderLeafletMap(rows);
  } else {
    renderFallbackMap(rows);
  }
}

function renderGrid() {
  const rows = filteredRows();
  if (!rows.length) {
    els.recordsBody.innerHTML =
      '<tr><td colspan="12" class="empty-state">No records match this filter.</td></tr>';
    return;
  }

  els.recordsBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>
            <span class="type-cell">
              <span class="type-dot" style="background:${colorForDevice(row.deviceId)}"></span>
              ${escapeHtml(typeLabel(row.type))}
            </span>
          </td>
          <td>${escapeHtml(row.deviceId)}</td>
          <td>${escapeHtml(row.recordId)}</td>
          <td>${escapeHtml(row.assignmentId ?? "")}</td>
          <td>${escapeHtml(row.pointId ?? "")}</td>
          <td>${escapeHtml(row.lat)}</td>
          <td>${escapeHtml(row.lon)}</td>
          <td>${escapeHtml(formatTime(row.deviceTs))}</td>
          <td>${escapeHtml(formatTime(row.serverTs))}</td>
          <td>${escapeHtml(row.battery ?? "")}</td>
          <td>${escapeHtml(row.sectorName)}</td>
          <td>${escapeHtml(row.status)}</td>
        </tr>
      `
    )
    .join("");
}

function renderAll() {
  renderMap();
  renderGrid();
}

async function loadData() {
  if (state.loginEnabled && !state.authenticated) {
    window.location.replace("/");
    return;
  }

  setStatus("Loading...");

  const params = new URLSearchParams({
    date: els.dateFilter.value,
    device: els.deviceFilter.value,
  });

  const response = await fetch(`/api/v1/dashboard/data?${params.toString()}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    const code = payload.error && payload.error.code ? payload.error.code : response.status;
    if (response.status === 401) {
      state.authenticated = false;
      window.location.replace("/");
      return;
    }
    setStatus(`Error: ${code}`, true);
    return;
  }

  state.rows = payload.data.rows || [];
  state.devices = payload.data.devices || [];
  updateStats(payload.data.summary || {});
  updateDeviceFilter(state.devices);
  renderAll();
  els.lastUpdated.textContent = `Updated ${formatTime(Math.floor(Date.now() / 1000))}`;
  setStatus("Connected");
}

els.filters.addEventListener("submit", (event) => {
  event.preventDefault();
  loadData().catch((err) => {
    setStatus(err.message || "Load failed", true);
  });
});

els.logoutButton.addEventListener("click", async () => {
  await fetch("/api/v1/dashboard/logout", { method: "POST" }).catch(() => undefined);
  state.authenticated = false;
  window.location.replace("/");
});

document.querySelectorAll(".segment-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".segment-button").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    state.selectedType = button.dataset.type;
    renderAll();
  });
});

els.dateFilter.value = malaysiaDate();

async function init() {
  try {
    const response = await fetch("/api/v1/dashboard/config");
    const payload = await response.json();
    state.loginEnabled = Boolean(payload.data && payload.data.loginEnabled);
    state.authenticated = Boolean(payload.data && payload.data.authenticated);

    if (!state.loginEnabled && payload.data && payload.data.authRequired) {
      setStatus("Protected", true);
      return;
    }

    if (state.loginEnabled && !state.authenticated) {
      window.location.replace("/");
      return;
    }
  } catch (err) {
    setStatus("Login unavailable", true);
    return;
  }

  await loadData();
}

init().catch((err) => {
  setStatus(err.message || "Load failed", true);
});
