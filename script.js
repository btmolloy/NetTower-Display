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
if (revealTargets.length) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  revealTargets.forEach((item) => revealObserver.observe(item));
}

const mapEl = document.querySelector("#sim-map");
if (mapEl) {
  initDemo();
}
initGalleryLightbox();

function initDemo() {
  const hostDrawer = document.querySelector("#host-drawer");
  const hostDrawerContent = document.querySelector("#host-drawer-content");
  const closeHostBtn = document.querySelector("#close-host");

  const settingsDrawer = document.querySelector("#settings-drawer");
  const openSettingsBtn = document.querySelector("#open-settings");
  const closeSettingsBtn = document.querySelector("#close-settings");

  const sessionToggleBtn = document.querySelector("#toggle-session");
  const sessionStateEl = document.querySelector("#session-state");
  const sessionCountsEl = document.querySelector("#session-counts");
  const sessionUpdateEl = document.querySelector("#session-update");

  const zoomInput = document.querySelector("#zoom-level");
  const zoomInBtn = document.querySelector("#zoom-in");
  const zoomOutBtn = document.querySelector("#zoom-out");

  const statusStates = ["hot", "warm", "cold"];
  const transitions = {
    hot: [0.72, 0.2, 0.08],
    warm: [0.42, 0.4, 0.18],
    cold: [0.22, 0.33, 0.45]
  };

  const CORE_IP = "10.15.216.1";
  const CORE_ID = hostIdFromIp(CORE_IP);
  const nodes = buildNodes(CORE_IP, CORE_ID);
  const totalEdgeCount = countTotalEdges(nodes);

  const state = {
    running: true,
    zoom: 1,
    panX: 0,
    panY: 0,
    selectedId: null,
    timer: null,
    lastUpdate: null,
    hostLimit: 170,
    edgeLimit: 360,
    refreshInterval: 2800,
    drag: {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      panStartX: 0,
      panStartY: 0
    },
    layerEl: null
  };

  wireUiEvents();
  renderMap();
  startSimulation();

  function wireUiEvents() {
    openSettingsBtn?.addEventListener("click", () => {
      settingsDrawer?.classList.add("open");
      hostDrawer?.classList.remove("open");
    });

    closeSettingsBtn?.addEventListener("click", () => {
      settingsDrawer?.classList.remove("open");
    });

    closeHostBtn?.addEventListener("click", () => {
      hostDrawer?.classList.remove("open");
      state.selectedId = null;
      renderMap();
    });

    zoomInput?.addEventListener("input", () => {
      state.zoom = clamp(Number(zoomInput.value) / 100, 0.7, 1.8);
      applyLayerTransform();
    });

    zoomInBtn?.addEventListener("click", () => {
      state.zoom = clamp(state.zoom + 0.08, 0.7, 1.8);
      if (zoomInput) zoomInput.value = String(Math.round(state.zoom * 100));
      applyLayerTransform();
    });

    zoomOutBtn?.addEventListener("click", () => {
      state.zoom = clamp(state.zoom - 0.08, 0.7, 1.8);
      if (zoomInput) zoomInput.value = String(Math.round(state.zoom * 100));
      applyLayerTransform();
    });

    sessionToggleBtn?.addEventListener("click", () => {
      state.running = !state.running;

      if (state.running) {
        sessionToggleBtn.textContent = "Stop Session";
        startSimulation();
        simulationTick();
      } else {
        sessionToggleBtn.textContent = "Resume Session";
        stopSimulation();
        refreshFooter();
      }
    });

    mapEl.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".sim-node")) return;

      state.drag.active = true;
      state.drag.pointerId = event.pointerId;
      state.drag.startX = event.clientX;
      state.drag.startY = event.clientY;
      state.drag.panStartX = state.panX;
      state.drag.panStartY = state.panY;

      mapEl.setPointerCapture(event.pointerId);
      mapEl.classList.add("dragging");
    });

    mapEl.addEventListener("pointermove", (event) => {
      if (!state.drag.active || event.pointerId !== state.drag.pointerId) return;

      const dx = event.clientX - state.drag.startX;
      const dy = event.clientY - state.drag.startY;
      state.panX = state.drag.panStartX + dx;
      state.panY = state.drag.panStartY + dy;
      applyLayerTransform();
    });

    const endDrag = (event) => {
      if (!state.drag.active || event.pointerId !== state.drag.pointerId) return;
      state.drag.active = false;
      state.drag.pointerId = null;
      mapEl.classList.remove("dragging");
    };

    mapEl.addEventListener("pointerup", endDrag);
    mapEl.addEventListener("pointercancel", endDrag);

    window.addEventListener("resize", () => {
      renderMap();
    });
  }

  function startSimulation() {
    stopSimulation();
    state.timer = window.setInterval(simulationTick, state.refreshInterval);
    if (!state.lastUpdate) {
      simulationTick();
    } else {
      refreshFooter();
    }
  }

  function stopSimulation() {
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
  }

  function simulationTick() {
    if (!state.running) return;

    const mutableNodes = nodes.filter((node) => node.id !== CORE_ID);
    const mutationCount = clamp(Math.floor(mutableNodes.length * 0.14), 4, 18);

    for (let i = 0; i < mutationCount; i += 1) {
      const node = mutableNodes[Math.floor(Math.random() * mutableNodes.length)];
      if (!node) continue;

      const next = nextStatus(node.status, transitions, statusStates);
      node.status = next;
      node.ageSeconds = statusBaseAge(next) + Math.floor(Math.random() * 14);
      node.lastSeen = formatTimestamp(new Date());
    }

    nodes.forEach((node) => {
      if (node.id === CORE_ID) {
        node.status = "hot";
        node.ageSeconds = statusBaseAge("hot");
        node.lastSeen = formatTimestamp(new Date());
        return;
      }

      node.ageSeconds += state.refreshInterval / 1000;
      if (node.status === "hot" && node.ageSeconds > 45) node.status = "warm";
      if (node.status === "warm" && node.ageSeconds > 135) node.status = "cold";
      if (node.status === "cold" && node.ageSeconds > 270) node.ageSeconds = 270;
    });

    state.lastUpdate = new Date();
    renderMap();
  }

  function renderMap() {
    const graph = buildVisibleGraph(nodes, state, CORE_ID);
    mapEl.innerHTML = "";

    const layer = document.createElement("div");
    layer.className = "map-layer";
    mapEl.append(layer);
    state.layerEl = layer;

    const width = mapEl.clientWidth;
    const height = mapEl.clientHeight;

    graph.edges.forEach((edge) => {
      const x1 = (edge.source.x / 100) * width;
      const y1 = (edge.source.y / 100) * height;
      const x2 = (edge.target.x / 100) * width;
      const y2 = (edge.target.y / 100) * height;

      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      const linkEl = document.createElement("div");
      linkEl.className = `sim-link status-${edge.status}`;
      linkEl.style.left = `${x1}px`;
      linkEl.style.top = `${y1}px`;
      linkEl.style.width = `${length}px`;
      linkEl.style.transform = `rotate(${angle}deg)`;
      layer.append(linkEl);
    });

    graph.nodes.forEach((node) => {
      const wrapEl = document.createElement("div");
      wrapEl.className = "sim-node-wrap";
      wrapEl.style.left = `${node.x}%`;
      wrapEl.style.top = `${node.y}%`;

      const nodeEl = document.createElement("button");
      nodeEl.type = "button";
      nodeEl.className = `sim-node status-${node.status}${node.id === CORE_ID ? " is-core" : ""}${
        node.id === state.selectedId ? " active" : ""
      }`;
      nodeEl.setAttribute("aria-label", `${node.ip} node`);

      if (node.id === CORE_ID) {
        const centerDeco = document.createElement("span");
        centerDeco.className = "node-center";
        nodeEl.append(centerDeco);
      }

      nodeEl.addEventListener("click", () => {
        state.selectedId = node.id;
        populateHostDrawer(node);
        hostDrawer?.classList.add("open");
        settingsDrawer?.classList.remove("open");
        renderMap();
      });

      const labelEl = document.createElement("span");
      labelEl.className = "sim-label";
      labelEl.textContent = node.ip;

      wrapEl.append(nodeEl, labelEl);
      layer.append(wrapEl);
    });

    if (state.selectedId && !graph.nodes.some((node) => node.id === state.selectedId)) {
      state.selectedId = null;
      hostDrawer?.classList.remove("open");
      hostDrawerContent.innerHTML = '<p class="drawer-placeholder">Select a node to inspect host details.</p>';
    }

    applyLayerTransform();
    refreshFooter(graph);
  }

  function applyLayerTransform() {
    if (!state.layerEl) return;
    state.layerEl.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  }

  function populateHostDrawer(node) {
    const fields = [
      ["HOST ID", node.hostId],
      ["IPS", node.ip],
      ["MACS", node.macs],
      ["HOSTNAMES", node.hostnames],
      ["DEVICE", node.device],
      ["VENDOR", node.vendor],
      ["OS GUESS", node.osGuess],
      ["DETAILED ROLE", node.detailedRole],
      ["DETAILED ROLE CONFIDENCE", node.detailedRoleConfidence],
      ["TOPOLOGY ROLE", node.topologyRole],
      ["TOPOLOGY ROLE CONFIDENCE", node.topologyRoleConfidence],
      ["PARENT CANDIDATE", node.parentCandidateId || "None"],
      ["PARENT CONFIDENCE", node.parentConfidence],
      ["TOPOLOGY LAYER", String(node.topologyLayer)],
      ["FIRST SEEN", node.firstSeen],
      ["LAST SEEN", node.lastSeen],
      ["PORTS", node.ports],
      ["SERVICES", node.services]
    ];

    hostDrawerContent.innerHTML = `
      <section class="host-summary">
        <h5>${escapeHtml(node.device)}</h5>
        <p>${escapeHtml(node.ip)} - ${escapeHtml(node.vendor)}</p>
        <p>Role Confidence: ${escapeHtml(node.topologyRoleConfidence)}</p>
        <span class="status-chip ${escapeHtml(node.status)}">${escapeHtml(statusLabel(node.status))}</span>
      </section>
      <section class="host-grid">
        ${fields
          .map(
            ([key, value]) =>
              `<article class="field-card"><span>${escapeHtml(key)}</span><strong>${escapeHtml(String(value))}</strong></article>`
          )
          .join("")}
      </section>
    `;
  }

  function refreshFooter(graphArg) {
    const graph = graphArg || buildVisibleGraph(nodes, state, CORE_ID);

    if (sessionStateEl) {
      sessionStateEl.textContent = state.running ? "Session is running." : "Session paused.";
    }

    if (sessionCountsEl) {
      sessionCountsEl.textContent = `Hosts: ${graph.nodes.length}/${nodes.length} | Edges: ${graph.edges.length}/${totalEdgeCount}`;
    }

    if (sessionUpdateEl) {
      const updateText = state.lastUpdate ? formatClock(state.lastUpdate) : "--";
      sessionUpdateEl.textContent = `Last update: ${updateText}`;
    }
  }
}

function initGalleryLightbox() {
  const lightbox = document.querySelector("#gallery-lightbox");
  const lightboxImage = document.querySelector("#lightbox-image");
  const lightboxCaption = document.querySelector("#lightbox-caption");
  const lightboxClose = document.querySelector("#lightbox-close");
  const galleryImages = document.querySelectorAll(".gallery-image");

  if (!lightbox || !lightboxImage || !lightboxCaption || !lightboxClose || !galleryImages.length) {
    return;
  }

  function closeLightbox() {
    lightbox.hidden = true;
    lightboxImage.src = "";
    lightboxImage.alt = "";
  }

  galleryImages.forEach((image) => {
    image.addEventListener("click", () => {
      const captionText = image.closest("figure")?.querySelector("figcaption")?.textContent?.trim() || "";
      lightboxImage.src = image.getAttribute("src") || "";
      lightboxImage.alt = image.getAttribute("alt") || "Gallery image";
      lightboxCaption.textContent = captionText;
      lightbox.hidden = false;
    });
  });

  lightboxClose.addEventListener("click", closeLightbox);

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (!lightbox.hidden && event.key === "Escape") {
      closeLightbox();
    }
  });
}

function buildNodes(coreIp, coreId) {
  const now = new Date();

  const coreNode = createNode(
    coreIp,
    50,
    43,
    "router",
    "hot",
    {
      detailedRole: "router",
      topologyRoleConfidence: "99%",
      parentCandidate: "None",
      parentConfidence: "0%",
      topologyLayer: 1,
      firstSeen: formatTimestamp(new Date(now.getTime() - 4 * 60 * 60 * 1000)),
      osGuess: "Unknown"
    },
    12
  );

  const topSeeds = [
    ["52.112.95.64", 14, 23],
    ["104.18.32.47", 20, 26],
    ["172.64.41.4", 27, 22],
    ["108.159.227.41", 34, 25],
    ["34.160.81.0", 40, 23],
    ["142.250.188.163", 46, 19],
    ["4.249.131.160", 53, 23],
    ["142.251.210.106", 59, 22],
    ["52.168.117.174", 63, 27],
    ["52.123.129.14", 68, 20],
    ["52.96.164.162", 72, 22],
    ["13.89.179.10", 77, 21],
    ["208.103.161.1", 82, 25],
    ["52.110.7.10", 88, 26],
    ["142.250.177.238", 93, 29],
    ["142.251.156.119", 11, 32],
    ["52.96.79.66", 16, 37],
    ["173.194.195.188", 23, 35],
    ["52.85.12.89", 27, 38],
    ["142.251.41.131", 34, 35],
    ["13.107.226.51", 38, 38],
    ["18.15.99.103", 43, 41],
    ["34.228.45.57", 48, 39],
    ["44.240.13.171", 55, 34],
    ["34.107.243.93", 60, 39],
    ["140.82.112.26", 66, 35],
    ["150.171.74.16", 71, 39],
    ["142.250.189.142", 75, 34],
    ["192.178.155.84", 80, 38],
    ["142.251.41.78", 85, 41],
    ["17.248.168.197", 89, 37],
    ["13.70.79.200", 69, 46]
  ];

  const topNodes = topSeeds.map(([ip, x, y]) =>
    createNode(
      ip,
      x,
      y,
      "edge",
      weightedStatus([0.57, 0.3, 0.13]),
        {
          topologyRoleConfidence: `${72 + Math.floor(Math.random() * 22)}%`,
          parentCandidate: coreIp,
          parentId: coreId,
          parentConfidence: `${56 + Math.floor(Math.random() * 30)}%`,
          topologyLayer: 2
        },
      statusBaseAge("warm")
    )
  );

  topNodes.forEach((node) => {
    node.links.push(coreId);
  });

  for (let i = 2; i < topNodes.length; i += 5) {
    topNodes[i].links.push(topNodes[i - 1].id);
  }

  const lowerTreeSeeds = [
    ["10.15.216.10", 44, 56, coreIp, 2],
    ["10.15.216.20", 50, 58, coreIp, 2],
    ["10.15.216.30", 56, 56, coreIp, 2],

    ["10.15.216.11", 39, 66, "10.15.216.10", 3],
    ["10.15.216.12", 46, 67, "10.15.216.10", 3],
    ["10.15.216.21", 47, 68, "10.15.216.20", 3],
    ["10.15.216.22", 53, 69, "10.15.216.20", 3],
    ["10.15.216.31", 54, 66, "10.15.216.30", 3],
    ["10.15.216.32", 61, 67, "10.15.216.30", 3],

    ["10.15.216.111", 34, 76, "10.15.216.11", 4],
    ["10.15.216.112", 40, 78, "10.15.216.11", 4],
    ["10.15.216.121", 44, 78, "10.15.216.12", 4],
    ["10.15.216.122", 49, 80, "10.15.216.12", 4],
    ["10.15.216.211", 45, 79, "10.15.216.21", 4],
    ["10.15.216.212", 50, 81, "10.15.216.21", 4],
    ["10.15.216.221", 53, 79, "10.15.216.22", 4],
    ["10.15.216.222", 58, 82, "10.15.216.22", 4],
    ["10.15.216.311", 55, 78, "10.15.216.31", 4],
    ["10.15.216.312", 60, 80, "10.15.216.31", 4],
    ["10.15.216.321", 63, 78, "10.15.216.32", 4],
    ["10.15.216.322", 68, 81, "10.15.216.32", 4],

    ["10.15.216.100", 32, 88, "10.15.216.111", 5],
    ["10.15.216.130", 38, 90, "10.15.216.112", 5],
    ["10.15.216.170", 44, 90, "10.15.216.121", 5],
    ["10.15.216.190", 49, 92, "10.15.216.122", 5],
    ["10.15.216.240", 55, 91, "10.15.216.222", 5],
    ["10.15.216.255", 61, 91, "10.15.216.312", 5],
    ["10.15.217.10", 67, 90, "10.15.216.321", 5],
    ["10.15.217.45", 72, 92, "10.15.216.322", 5]
  ];

  const lowerTreeNodes = lowerTreeSeeds.map(([ip, x, y, parentIp, layer]) =>
    createNode(
      ip,
      x,
      y,
      layer <= 3 ? "branch" : "leaf",
      weightedStatus([0.8, 0.15, 0.05]),
      {
        topologyRoleConfidence: `${74 + Math.floor(Math.random() * 20)}%`,
        parentCandidate: parentIp,
        parentId: hostIdFromIp(parentIp),
        parentConfidence: `${68 + Math.floor(Math.random() * 24)}%`,
        topologyLayer: layer
      },
      statusBaseAge("hot")
    )
  );

  lowerTreeNodes.forEach((node) => {
    if (node.parentId && node.parentCandidate !== "None") {
      node.links.push(node.parentId);
    }
  });

  const extraTreeEdges = [
    ["10.15.216.121", "10.15.216.211"],
    ["10.15.216.221", "10.15.216.311"],
    ["10.15.216.222", "10.15.216.312"],
    ["10.15.216.312", "10.15.216.321"]
  ];

  extraTreeEdges.forEach(([from, to]) => {
    const node = lowerTreeNodes.find((item) => item.ip === from);
    if (node) {
      node.links.push(hostIdFromIp(to));
    }
  });

  const allNodes = [coreNode, ...topNodes, ...lowerTreeNodes];
  decorateNodeMetadata(allNodes, coreId);
  return allNodes;
}

function createNode(ip, x, y, topologyRole, status, overrides = {}, ageSeconds = 10) {
  const now = new Date();

  return {
    id: hostIdFromIp(ip),
    hostId: hostIdFromIp(ip),
    ip,
    x,
    y,
    status,
    ageSeconds,
    links: [],
    device: overrides.device || "Unknown Device",
    vendor: overrides.vendor || "Unknown",
    macs: overrides.macs || "None",
    hostnames: overrides.hostnames || "None",
    osGuess: overrides.osGuess || "Unknown",
    detailedRole: overrides.detailedRole || "other",
    detailedRoleConfidence: overrides.detailedRoleConfidence || "20%",
    topologyRole,
    topologyRoleConfidence: overrides.topologyRoleConfidence || "80%",
    parentCandidate: overrides.parentCandidate || "None",
    parentCandidateId: overrides.parentCandidateId || "None",
    parentId: overrides.parentId || null,
    parentConfidence: overrides.parentConfidence || "0%",
    ports: overrides.ports || "None",
    services: overrides.services || "None",
    topologyLayer: overrides.topologyLayer || 1,
    firstSeen: overrides.firstSeen || formatTimestamp(new Date(now.getTime() - randomInt(30, 240) * 60000)),
    lastSeen: formatTimestamp(now)
  };
}

function buildVisibleGraph(nodes, state, coreId) {
  const coreNode = nodes.find((node) => node.id === coreId);
  if (!coreNode) return { nodes: [], edges: [] };

  const others = nodes.filter((node) => node.id !== coreId);
  const visibleNodes = [coreNode, ...others.slice(0, Math.max(0, state.hostLimit - 1))];
  const visibleIds = new Set(visibleNodes.map((node) => node.id));

  const nodeLookup = new Map(visibleNodes.map((node) => [node.id, node]));
  const edgeLookup = new Set();
  const edges = [];

  visibleNodes.forEach((node) => {
    node.links.forEach((targetId) => {
      if (!visibleIds.has(targetId)) return;
      const targetNode = nodeLookup.get(targetId);
      if (!targetNode) return;

      const key = [node.id, targetNode.id].sort().join("|");
      if (edgeLookup.has(key)) return;

      edgeLookup.add(key);
      edges.push({
        source: node,
        target: targetNode,
        status: edgeStatus(node.status, targetNode.status)
      });
    });
  });

  return {
    nodes: visibleNodes,
    edges: edges.slice(0, state.edgeLimit)
  };
}

function decorateNodeMetadata(nodes, coreId) {
  nodes.forEach((node) => {
    const profile = pickProfile(node);
    const hostSuffix = node.ip.split(".").slice(-1)[0] || "0";

    node.device = profile.device;
    node.vendor = profile.vendor;
    node.osGuess = profile.osGuess;
    node.detailedRole = profile.detailedRole;
    node.detailedRoleConfidence = profile.detailedRoleConfidence;
    node.ports = profile.ports;
    node.services = profile.services;
    node.macs = macFromIp(node.ip);
    node.hostnames = `${profile.hostnamePrefix}-${hostSuffix}`;

    if (node.parentCandidate && node.parentCandidate !== "None") {
      node.parentCandidateId = hostIdFromIp(node.parentCandidate);
    } else {
      node.parentCandidateId = "None";
    }

    if (node.id === coreId) {
      node.device = "Gateway Router";
      node.vendor = "Cisco";
      node.osGuess = "Cisco IOS XE";
      node.detailedRole = "router";
      node.detailedRoleConfidence = "96%";
      node.ports = "22/tcp, 80/tcp, 161/udp, 443/tcp";
      node.services = "SSH, HTTP, HTTPS, SNMP";
      node.hostnames = "nettower-core";
      node.parentCandidate = "None";
      node.parentCandidateId = "None";
    }
  });
}

function pickProfile(node) {
  const pools = {
    router: [
      {
        device: "Cisco ISR 4331",
        vendor: "Cisco",
        osGuess: "Cisco IOS XE",
        detailedRole: "router",
        detailedRoleConfidence: "95%",
        ports: "22/tcp, 443/tcp, 161/udp",
        services: "SSH, HTTPS, SNMP",
        hostnamePrefix: "edge-router"
      },
      {
        device: "FortiGate 60F",
        vendor: "Fortinet",
        osGuess: "FortiOS",
        detailedRole: "firewall-router",
        detailedRoleConfidence: "93%",
        ports: "22/tcp, 443/tcp",
        services: "SSH, HTTPS",
        hostnamePrefix: "forti-gateway"
      }
    ],
    edge: [
      {
        device: "Dell OptiPlex 7060",
        vendor: "Dell",
        osGuess: "Windows 10 Pro",
        detailedRole: "workstation",
        detailedRoleConfidence: "88%",
        ports: "135/tcp, 445/tcp, 3389/tcp",
        services: "RPC, SMB, RDP",
        hostnamePrefix: "optiplex"
      },
      {
        device: "HP LaserJet Pro M404dn",
        vendor: "HP",
        osGuess: "Embedded Linux",
        detailedRole: "printer",
        detailedRoleConfidence: "92%",
        ports: "80/tcp, 443/tcp, 9100/tcp",
        services: "Web Admin, JetDirect",
        hostnamePrefix: "hp-printer"
      },
      {
        device: "Brother HL-L2395DW",
        vendor: "Brother",
        osGuess: "Embedded Linux",
        detailedRole: "printer",
        detailedRoleConfidence: "90%",
        ports: "80/tcp, 515/tcp, 631/tcp",
        services: "IPP, LPD, Web UI",
        hostnamePrefix: "brother-print"
      },
      {
        device: "Raspberry Pi 4",
        vendor: "Raspberry Pi",
        osGuess: "Debian Linux",
        detailedRole: "sensor-gateway",
        detailedRoleConfidence: "84%",
        ports: "22/tcp, 1883/tcp, 3000/tcp",
        services: "SSH, MQTT, Node Service",
        hostnamePrefix: "pi-gateway"
      },
      {
        device: "UniFi AP AC Pro",
        vendor: "Ubiquiti",
        osGuess: "Embedded Linux",
        detailedRole: "wireless-ap",
        detailedRoleConfidence: "87%",
        ports: "22/tcp, 8080/tcp",
        services: "SSH, Controller",
        hostnamePrefix: "unifi-ap"
      }
    ],
    branch: [
      {
        device: "Cisco Catalyst 2960",
        vendor: "Cisco",
        osGuess: "Cisco IOS",
        detailedRole: "switch",
        detailedRoleConfidence: "89%",
        ports: "22/tcp, 23/tcp, 161/udp",
        services: "SSH, Telnet, SNMP",
        hostnamePrefix: "core-switch"
      },
      {
        device: "Dell OptiPlex 7050",
        vendor: "Dell",
        osGuess: "Windows 10 Enterprise",
        detailedRole: "ops-workstation",
        detailedRoleConfidence: "82%",
        ports: "135/tcp, 445/tcp, 5985/tcp",
        services: "SMB, WinRM",
        hostnamePrefix: "ops-desk"
      },
      {
        device: "Zebra ZD421",
        vendor: "Zebra",
        osGuess: "Embedded",
        detailedRole: "label-printer",
        detailedRoleConfidence: "86%",
        ports: "80/tcp, 9100/tcp",
        services: "Web UI, Print Queue",
        hostnamePrefix: "label-printer"
      }
    ],
    leaf: [
      {
        device: "TP-Link TL-SG105",
        vendor: "TP-Link",
        osGuess: "Embedded",
        detailedRole: "access-switch",
        detailedRoleConfidence: "78%",
        ports: "None",
        services: "None",
        hostnamePrefix: "access-switch"
      },
      {
        device: "Axis M3046-V",
        vendor: "Axis",
        osGuess: "Embedded Linux",
        detailedRole: "camera",
        detailedRoleConfidence: "83%",
        ports: "80/tcp, 554/tcp",
        services: "HTTP, RTSP",
        hostnamePrefix: "cam-node"
      },
      {
        device: "Canon imageCLASS MF445dw",
        vendor: "Canon",
        osGuess: "Embedded",
        detailedRole: "multifunction-printer",
        detailedRoleConfidence: "88%",
        ports: "80/tcp, 631/tcp, 9100/tcp",
        services: "IPP, Web UI",
        hostnamePrefix: "canon-mfp"
      },
      {
        device: "Dell OptiPlex 7060",
        vendor: "Dell",
        osGuess: "Windows 11 Pro",
        detailedRole: "endpoint",
        detailedRoleConfidence: "85%",
        ports: "135/tcp, 445/tcp",
        services: "SMB, RPC",
        hostnamePrefix: "office-pc"
      },
      {
        device: "APC Smart-UPS 1500",
        vendor: "APC",
        osGuess: "Embedded",
        detailedRole: "power-management",
        detailedRoleConfidence: "79%",
        ports: "80/tcp, 161/udp",
        services: "Web UI, SNMP",
        hostnamePrefix: "ups-node"
      }
    ]
  };

  const roleKey = node.topologyRole === "router"
    ? "router"
    : node.topologyRole === "edge"
      ? "edge"
      : node.topologyRole === "branch"
        ? "branch"
        : "leaf";

  const pool = pools[roleKey];
  const index = hashText(node.ip) % pool.length;
  return pool[index];
}

function countTotalEdges(nodes) {
  const seen = new Set();
  nodes.forEach((node) => {
    node.links.forEach((targetId) => {
      seen.add([node.id, targetId].sort().join("|"));
    });
  });
  return seen.size;
}

function edgeStatus(a, b) {
  if (a === "cold" || b === "cold") return "cold";
  if (a === "warm" || b === "warm") return "warm";
  return "hot";
}

function nextStatus(current, map, states) {
  const weights = map[current] || map.hot;
  const draw = Math.random();
  let acc = 0;

  for (let i = 0; i < states.length; i += 1) {
    acc += weights[i];
    if (draw <= acc) return states[i];
  }

  return current;
}

function weightedStatus(weights) {
  const draw = Math.random();
  if (draw <= weights[0]) return "hot";
  if (draw <= weights[0] + weights[1]) return "warm";
  return "cold";
}

function statusBaseAge(status) {
  if (status === "hot") return randomInt(8, 28);
  if (status === "warm") return randomInt(35, 115);
  return randomInt(130, 230);
}

function statusLabel(status) {
  if (status === "hot") return "Active";
  if (status === "warm") return "Warm";
  return "Cold";
}

function formatTimestamp(date) {
  return new Date(date).toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatClock(date) {
  return new Date(date).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

function hostIdFromIp(ip) {
  return `host-ip-${ip.replace(/\./g, "_")}`;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function macFromIp(ip) {
  const octets = ip.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const hexParts = [0x02, octets[0], octets[1], octets[2], octets[3], (octets[0] ^ octets[3]) & 0xff];
  return hexParts.map((value) => value.toString(16).padStart(2, "0")).join(":");
}

function hashText(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
