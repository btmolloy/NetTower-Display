const menuToggle = document.querySelector(".menu-toggle");
const siteNav = document.querySelector(".site-nav");

if (menuToggle && siteNav) {
  menuToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      siteNav.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
}

const revealTargets = document.querySelectorAll(".reveal");
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.14 }
);

revealTargets.forEach((item) => revealObserver.observe(item));

const sprintTabs = document.querySelectorAll(".tab-btn");
const sprintTracks = document.querySelectorAll(".timeline-track");

sprintTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const sprint = tab.dataset.sprint;

    sprintTabs.forEach((item) => {
      item.classList.remove("active");
      item.setAttribute("aria-selected", "false");
    });

    sprintTracks.forEach((track) => {
      track.classList.add("hidden");
    });

    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    document.querySelector(`[data-track="${sprint}"]`)?.classList.remove("hidden");
  });
});

const mapEl = document.querySelector("#sim-map");
const detailEl = document.querySelector("#node-detail");
const statusEl = document.querySelector("#sim-status");
const startBtn = document.querySelector("#start-sim");
const pauseBtn = document.querySelector("#pause-sim");
const frequencySelect = document.querySelector("#scan-frequency");
const targetRangeInput = document.querySelector("#target-range");

const statusStates = ["active", "warning", "offline"];
const statusWeight = {
  active: [0.68, 0.26, 0.06],
  warning: [0.48, 0.38, 0.14],
  offline: [0.58, 0.24, 0.18]
};

const nodes = [
  {
    id: "gateway",
    name: "Gateway Router",
    ip: "192.168.1.1",
    hostType: "network-core",
    os: "Embedded Linux",
    confidence: "high",
    status: "active",
    x: 13,
    y: 45,
    links: ["ops-laptop", "sensor-a", "sensor-b", "edge-server"]
  },
  {
    id: "ops-laptop",
    name: "Ops Laptop",
    ip: "192.168.1.18",
    hostType: "workstation",
    os: "Windows",
    confidence: "high",
    status: "active",
    x: 37,
    y: 20,
    links: ["edge-server", "camera-1"]
  },
  {
    id: "sensor-a",
    name: "Field Sensor A",
    ip: "192.168.1.44",
    hostType: "iot",
    os: "RTOS/Embedded",
    confidence: "medium",
    status: "warning",
    x: 37,
    y: 68,
    links: ["edge-server"]
  },
  {
    id: "sensor-b",
    name: "Field Sensor B",
    ip: "192.168.1.45",
    hostType: "iot",
    os: "RTOS/Embedded",
    confidence: "medium",
    status: "active",
    x: 56,
    y: 78,
    links: ["edge-server"]
  },
  {
    id: "edge-server",
    name: "Edge Server",
    ip: "192.168.1.10",
    hostType: "server",
    os: "Linux",
    confidence: "high",
    status: "active",
    x: 62,
    y: 46,
    links: ["camera-1", "camera-2", "print-node"]
  },
  {
    id: "camera-1",
    name: "Camera 01",
    ip: "192.168.1.71",
    hostType: "camera",
    os: "Embedded",
    confidence: "medium",
    status: "warning",
    x: 82,
    y: 22,
    links: []
  },
  {
    id: "camera-2",
    name: "Camera 02",
    ip: "192.168.1.72",
    hostType: "camera",
    os: "Embedded",
    confidence: "medium",
    status: "active",
    x: 85,
    y: 50,
    links: []
  },
  {
    id: "print-node",
    name: "Utility Printer",
    ip: "192.168.1.91",
    hostType: "peripheral",
    os: "Embedded",
    confidence: "low",
    status: "offline",
    x: 80,
    y: 74,
    links: []
  }
];

let selectedId = null;
let simulationTimer = null;
let lastTick = null;

function getFrequencyMs() {
  const choice = frequencySelect?.value || "medium";
  if (choice === "fast") return 1500;
  if (choice === "slow") return 5000;
  return 3000;
}

function updateSimStatus(message) {
  if (!statusEl) return;
  const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  statusEl.textContent = `${timestamp} - ${message}`;
}

function nodeById(id) {
  return nodes.find((node) => node.id === id);
}

function pickNextStatus(currentStatus) {
  const weights = statusWeight[currentStatus] || statusWeight.active;
  const draw = Math.random();
  let acc = 0;

  for (let i = 0; i < statusStates.length; i += 1) {
    acc += weights[i];
    if (draw <= acc) return statusStates[i];
  }
  return currentStatus;
}

function buildUniqueLinks() {
  const links = [];
  const seen = new Set();

  nodes.forEach((node) => {
    node.links.forEach((targetId) => {
      const key = [node.id, targetId].sort().join("|");
      if (!seen.has(key)) {
        const targetNode = nodeById(targetId);
        if (targetNode) {
          links.push([node, targetNode]);
          seen.add(key);
        }
      }
    });
  });

  return links;
}

function makeDetailMarkup(node) {
  const linked = node.links.length
    ? node.links.map((id) => nodeById(id)?.name || id).join(", ")
    : "No direct downstream links";

  return `
    <h3>${node.name}</h3>
    <p><strong>IP:</strong> ${node.ip}</p>
    <p><strong>Class:</strong> ${node.hostType}</p>
    <p><strong>OS Family:</strong> ${node.os}</p>
    <p><strong>Status:</strong> ${node.status}</p>
    <p><strong>Inference Confidence:</strong> ${node.confidence}</p>
    <p><strong>Linked Nodes:</strong> ${linked}</p>
  `;
}

function selectNode(id) {
  selectedId = id;
  const node = nodeById(id);
  if (!node || !mapEl || !detailEl) return;

  mapEl.querySelectorAll(".sim-node").forEach((nodeEl) => {
    nodeEl.classList.toggle("active", nodeEl.dataset.id === id);
  });

  detailEl.innerHTML = makeDetailMarkup(node);
}

function renderSimulation() {
  if (!mapEl) return;

  const width = mapEl.clientWidth;
  const height = mapEl.clientHeight;
  mapEl.innerHTML = "";

  const links = buildUniqueLinks();
  links.forEach(([source, target]) => {
    const x1 = (source.x / 100) * width;
    const y1 = (source.y / 100) * height;
    const x2 = (target.x / 100) * width;
    const y2 = (target.y / 100) * height;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    const linkEl = document.createElement("div");
    linkEl.className = "sim-link";
    linkEl.style.left = `${x1}px`;
    linkEl.style.top = `${y1}px`;
    linkEl.style.width = `${length}px`;
    linkEl.style.transform = `rotate(${angle}deg)`;
    mapEl.append(linkEl);
  });

  nodes.forEach((node) => {
    const nodeEl = document.createElement("button");
    nodeEl.type = "button";
    nodeEl.className = `sim-node status-${node.status}`;
    nodeEl.dataset.id = node.id;
    nodeEl.style.left = `calc(${node.x}% - 52px)`;
    nodeEl.style.top = `calc(${node.y}% - 22px)`;
    nodeEl.innerHTML = `<strong>${node.name}</strong><span>${node.ip}</span>`;

    nodeEl.addEventListener("click", () => selectNode(node.id));
    mapEl.append(nodeEl);
  });

  if (selectedId && nodeById(selectedId)) {
    selectNode(selectedId);
  } else if (nodes[0]) {
    selectNode(nodes[0].id);
  }
}

function simulationTick() {
  lastTick = new Date();
  const changingCount = 1 + Math.floor(Math.random() * 2);

  for (let i = 0; i < changingCount; i += 1) {
    const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
    randomNode.status = pickNextStatus(randomNode.status);
  }

  renderSimulation();

  const activeCount = nodes.filter((node) => node.status === "active").length;
  const warningCount = nodes.filter((node) => node.status === "warning").length;
  const offlineCount = nodes.filter((node) => node.status === "offline").length;
  const targetRange = targetRangeInput?.value.trim() || "local range";

  updateSimStatus(
    `Mock scan completed for ${targetRange}: active ${activeCount}, warning ${warningCount}, offline ${offlineCount}`
  );
}

function startSimulation() {
  if (simulationTimer) window.clearInterval(simulationTimer);
  simulationTick();
  simulationTimer = window.setInterval(simulationTick, getFrequencyMs());
}

function pauseSimulation() {
  if (simulationTimer) {
    window.clearInterval(simulationTimer);
    simulationTimer = null;
  }
  if (lastTick) {
    const time = lastTick.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    updateSimStatus(`Simulation paused. Last refresh at ${time}`);
  } else {
    updateSimStatus("Simulation paused.");
  }
}

if (mapEl) {
  renderSimulation();
  updateSimStatus("Simulation idle. Press Start to animate network changes.");

  startBtn?.addEventListener("click", startSimulation);
  pauseBtn?.addEventListener("click", pauseSimulation);

  frequencySelect?.addEventListener("change", () => {
    if (simulationTimer) startSimulation();
  });

  window.addEventListener("resize", () => {
    renderSimulation();
  });
}
