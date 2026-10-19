/* =========================================================
   Linear vs SMPS — slide engine + diagram renderers
   ========================================================= */

const SVGNS = "http://www.w3.org/2000/svg";
const PALETTE = {
  blue:   { fill: "#e3f3fd", stroke: "#8ccaf0", ink: "#2f7fb5" },
  pink:   { fill: "#ffe6f0", stroke: "#f4a3c4", ink: "#c2477e" },
  yellow: { fill: "#fff6d1", stroke: "#f5d36b", ink: "#a07a0c" },
  peach:  { fill: "#ffece3", stroke: "#f8b99a", ink: "#c0643c" },
  lav:    { fill: "#f1ebff", stroke: "#c4b2f2", ink: "#7457c9" },
  mint:   { fill: "#e3f7ee", stroke: "#92dbb9", ink: "#2f8c63" },
  gray:   { fill: "#f6f4f9", stroke: "#c9c3d6", ink: "#5d6478" }
};
const ARROW = { arrow: "#8aa0b8", lav: "#a48ee6", pink: "#e58bb2" };

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

function addMarkers(svg) {
  const defs = el("defs", {}, svg);
  for (const [name, color] of Object.entries(ARROW)) {
    const m = el("marker", {
      id: `${svg.id}-m-${name}`, viewBox: "0 0 10 10", refX: 9, refY: 5,
      markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse"
    }, defs);
    el("path", { d: "M0,0 L10,5 L0,10 z", fill: color }, m);
  }
}

/* Multi-line centred text: title lines + optional sub lines */
function addText(g, cx, cy, title, sub, titleClass = "fc-title", subClass = "fc-sub") {
  const tl = title ? title.split("\n") : [];
  const sl = sub ? sub.split("\n") : [];
  const TH = 18, SH = 15;
  const total = tl.length * TH + sl.length * SH + (sl.length && tl.length ? 3 : 0);
  let y = cy - total / 2;
  tl.forEach(line => {
    y += TH;
    const t = el("text", { x: cx, y: y - 4, "text-anchor": "middle", class: titleClass }, g);
    t.textContent = line;
  });
  if (sl.length && tl.length) y += 3;
  sl.forEach(line => {
    y += SH;
    const t = el("text", { x: cx, y: y - 3, "text-anchor": "middle", class: subClass }, g);
    t.textContent = line;
  });
}

/* ---------------- Flowchart renderer ---------------- */
function side(n, s) {
  switch (s) {
    case "r": return [n.x + n.w, n.y + n.h / 2];
    case "l": return [n.x, n.y + n.h / 2];
    case "t": return [n.x + n.w / 2, n.y];
    case "b": return [n.x + n.w / 2, n.y + n.h];
  }
}

function routeEdge(a, b, e) {
  let fs = e.fs, ts = e.ts;
  if (!fs || !ts) {
    if (b.x >= a.x + a.w) { fs = "r"; ts = "l"; }
    else if (b.x + b.w <= a.x) { fs = "l"; ts = "r"; }
    else if (b.y >= a.y + a.h) { fs = "b"; ts = "t"; }
    else { fs = "t"; ts = "b"; }
  }
  const s = side(a, fs), t = side(b, ts);
  if (e.via) return [s, ...e.via, t];
  const horizS = fs === "r" || fs === "l", horizT = ts === "r" || ts === "l";
  if (horizS && horizT) {
    if (Math.abs(s[1] - t[1]) < 1) return [s, t];
    const mx = (s[0] + t[0]) / 2;
    return [s, [mx, s[1]], [mx, t[1]], t];
  }
  if (!horizS && !horizT) {
    if (Math.abs(s[0] - t[0]) < 1) return [s, t];
    const my = (s[1] + t[1]) / 2;
    return [s, [s[0], my], [t[0], my], t];
  }
  return horizS ? [s, [t[0], s[1]], t] : [s, [s[0], t[1]], t];
}

function pointAt(pts, frac) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segs.push(L); total += L;
  }
  let d = total * frac;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i]) {
      const r = segs[i] ? d / segs[i] : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r];
    }
    d -= segs[i];
  }
  return pts[pts.length - 1];
}

function renderFlow(svg, spec) {
  svg.setAttribute("viewBox", `0 0 ${spec.vb[0]} ${spec.vb[1]}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  addMarkers(svg);
  const byId = {};
  spec.nodes.forEach(n => byId[n.id] = n);
  const edgeLayer = el("g", {}, svg);
  const nodeLayer = el("g", {}, svg);

  spec.edges.forEach(e => {
    const a = byId[e.from], b = byId[e.to];
    const pts = routeEdge(a, b, e);
    const d = "M" + pts.map(p => p.join(",")).join(" L");
    const color = e.color || "arrow";
    const g = el("g", { class: `fc-edge seq${e.dashed ? " dashed" : ""}`, style: `--s:${e.step}` }, edgeLayer);
    el("path", {
      d, class: "line", pathLength: 1, "marker-end": `url(#${svg.id}-m-${color})`,
      style: `stroke:${ARROW[color]}`
    }, g);
    el("path", { d, class: "flowdots" }, g);
    if (e.label) {
      const [lx, ly] = e.labelAt || pointAt(pts, e.labelFrac ?? 0.5);
      const w = e.label.length * 6.6 + 12;
      el("rect", { x: lx - w / 2, y: ly - 10, width: w, height: 19, rx: 9, class: "fc-label-bg" }, g);
      const t = el("text", { x: lx, y: ly + 4, "text-anchor": "middle", class: "fc-label" }, g);
      t.textContent = e.label;
    }
  });

  spec.nodes.forEach(n => {
    const c = PALETTE[n.color || "blue"];
    const g = el("g", { class: "fc-node seq", style: `--s:${n.step}` }, nodeLayer);
    if (n.shape === "diamond") {
      const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
      el("polygon", {
        points: `${cx},${n.y} ${n.x + n.w},${cy} ${cx},${n.y + n.h} ${n.x},${cy}`,
        style: `fill:${c.fill};stroke:${c.stroke}`
      }, g);
    } else {
      el("rect", {
        x: n.x, y: n.y, width: n.w, height: n.h, rx: n.shape === "pill" ? n.h / 2 : 14,
        style: `fill:${c.fill};stroke:${c.stroke}`
      }, g);
    }
    addText(g, n.x + n.w / 2, n.y + n.h / 2, n.title, n.sub);
    if (n.badge != null) {
      const sg = el("g", { class: "fc-step" }, g);
      el("circle", { cx: n.x + 6, cy: n.y + 6, r: 12, style: `stroke:${c.stroke}` }, sg);
      const t = el("text", { x: n.x + 6, y: n.y + 10, "text-anchor": "middle", style: `fill:${c.ink}` }, sg);
      t.textContent = n.badge;
    }
  });
}

/* ---------------- Mind-map renderer ---------------- */
function renderMind(svg, spec) {
  svg.setAttribute("viewBox", `0 0 ${spec.vb[0]} ${spec.vb[1]}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const linkLayer = el("g", {}, svg);
  const nodeLayer = el("g", {}, svg);
  let step = 0;

  function drawNode(n, isRoot) {
    const c = PALETTE[n.color || "gray"];
    const w = n.w || 200, h = n.h || 56;
    const g = el("g", { class: "seq", style: `--s:${n._step}` }, nodeLayer);
    el("rect", {
      x: n.x - w / 2, y: n.y - h / 2, width: w, height: h, rx: isRoot ? h / 2 : 14,
      style: `fill:${isRoot ? "#fff" : c.fill};stroke:${c.stroke};stroke-width:${n.focus || isRoot ? 2.6 : 1.5}`
    }, g);
    addText(g, n.x, n.y, n.label, n.sub, isRoot ? "mm-center-text" : "mm-text", "mm-sub");
  }
  function link(p, ch, color) {
    const mx = (p.x + ch.x) / 2;
    const d = Math.abs(p.x - ch.x) < 20
      ? `M${p.x},${p.y} L${ch.x},${ch.y}`
      : `M${p.x},${p.y} C${mx},${p.y} ${mx},${ch.y} ${ch.x},${ch.y}`;
    el("path", { d, pathLength: 1, class: "mm-link seq", style: `--s:${ch._step - 0.3};stroke:${PALETTE[color].stroke}` }, linkLayer);
  }

  // assign steps breadth-first so the map grows outward
  const root = spec.root;
  root._step = step++;
  const level1 = root.children || [];
  level1.forEach(b => b._step = step++);
  level1.forEach(b => (b.children || []).forEach(ch => ch._step = step++ * 0.7 + 1));

  drawNode(root, true);
  level1.forEach(b => {
    link(root, b, b.color);
    drawNode(b);
    (b.children || []).forEach(ch => {
      ch.color = ch.color || b.color;
      link(b, ch, b.color);
      drawNode(ch);
    });
  });
}

/* ---------------- Diagram specs ---------------- */
const flows = {
  "flow-intro": {
    vb: [700, 130],
    nodes: [
      { id: "a", x: 6, y: 22, w: 170, h: 86, title: "Wall Socket", sub: "230 V AC, 50 Hz", color: "yellow", step: 0, badge: 1 },
      { id: "b", x: 262, y: 22, w: 186, h: 86, title: "Power Supply", sub: "convert · regulate\n· protect", color: "blue", step: 1, badge: 2 },
      { id: "c", x: 534, y: 22, w: 160, h: 86, title: "Your Device", sub: "5 V / 12 V DC", color: "pink", step: 2, badge: 3 }
    ],
    edges: [
      { from: "a", to: "b", step: 0.5, label: "AC in" },
      { from: "b", to: "c", step: 1.5, label: "DC out" }
    ]
  },

  "flow-linear": {
    vb: [1180, 140],
    nodes: [
      ["ac", "AC Mains", "230 V, 50 Hz", "yellow"],
      ["tr", "Transformer", "steps down\n230 V → 12 V AC", "blue"],
      ["rc", "Rectifier", "AC → pulsating DC", "blue"],
      ["fl", "Filter", "capacitor smooths\nthe ripple", "blue"],
      ["rg", "Regulator", "holds output\nconstant", "blue"],
      ["dc", "DC Output", "steady 5 V\nto the load", "pink"]
    ].map(([id, title, sub, color], i) => ({
      id, title, sub, color, x: 8 + i * 196, y: 26, w: 160, h: 96, step: i, badge: i + 1
    })),
    edges: ["ac", "tr", "rc", "fl", "rg"].map((id, i, arr) => ({
      from: id, to: ["tr", "rc", "fl", "rg", "dc"][i], step: i + 0.5
    }))
  },

  "flow-smps": (() => {
    const W = 142, G = 30, X0 = 4, Y = 24, H = 112;
    const top = [
      ["ac", "AC Mains", "230 V AC", "yellow"],
      ["emi", "EMI Filter", "blocks switching\nnoise", "lav"],
      ["rec", "Rectifier +\nBulk Cap", "≈ 325 V DC", "blue"],
      ["sw", "MOSFET\nSwitch", "chops DC at\n50 kHz – 1 MHz", "pink"],
      ["tx", "HF\nTransformer", "small ferrite core,\nsteps down, isolates", "pink"],
      ["out", "Rectifier +\nLC Filter", "HF pulses →\nsmooth DC", "blue"],
      ["dc", "DC Output", "5 V · 12 V", "pink"]
    ].map(([id, title, sub, color], i) => ({
      id, title, sub, color, x: X0 + i * (W + G), y: Y, w: W, h: H, step: i, badge: i + 1
    }));
    const cx = i => X0 + i * (W + G) + W / 2;
    const FY = 228, FH = 76, FW = 150;
    const fb = [
      { id: "pwm", title: "PWM Controller", sub: "sets duty cycle", color: "lav", x: cx(3) - FW / 2, step: 9.5 },
      { id: "opto", title: "Optocoupler", sub: "isolated signal", color: "lav", x: cx(4) - FW / 2, step: 8.5 },
      { id: "err", title: "Error Amplifier", sub: "V_out vs reference", color: "lav", x: cx(5) - FW / 2, step: 7.5 }
    ].map(n => ({ ...n, y: FY, w: FW, h: FH }));
    return {
      vb: [1180, 320],
      nodes: [...top, ...fb],
      edges: [
        ...top.slice(0, -1).map((n, i) => ({ from: n.id, to: top[i + 1].id, step: i + 0.5 })),
        { from: "dc", to: "err", fs: "b", ts: "r", step: 7, color: "lav", label: "feedback", labelFrac: 0.3 },
        { from: "err", to: "opto", step: 8, color: "lav" },
        { from: "opto", to: "pwm", step: 9, color: "lav" },
        { from: "pwm", to: "sw", fs: "t", ts: "b", step: 10, color: "lav", label: "gate drive" }
      ]
    };
  })(),

  "flow-smps-cycle": (() => {
    const steps = [
      ["Rectify mains", "230 V AC → ≈ 325 V DC", "blue"],
      ["Chop with MOSFET", "ON/OFF ≈ 100 kHz → HF pulses", "pink"],
      ["HF transformer", "steps voltage down + isolates", "pink"],
      ["Rectify & filter", "diodes + LC filter → smooth DC", "blue"],
      ["Sense the output", "error amp compares with reference", "lav"],
      ["Adjust pulse width", "PWM widens / narrows the pulses", "lav"]
    ];
    const nodes = steps.map(([title, sub, color], i) => ({
      id: "s" + i, title, sub, color, x: 70, y: 12 + i * 86, w: 330, h: 60, step: i, badge: i + 1
    }));
    const mid = i => 12 + i * 86 + 30;
    return {
      vb: [440, 540],
      nodes,
      edges: [
        ...nodes.slice(0, -1).map((n, i) => ({ from: n.id, to: nodes[i + 1].id, step: i + 0.5 })),
        { from: "s5", to: "s1", fs: "l", ts: "l", via: [[28, mid(5)], [28, mid(1)]], step: 6, color: "lav",
          label: "repeat", labelAt: [28, (mid(5) + mid(1)) / 2] }
      ]
    };
  })(),

  "flow-decide": {
    vb: [560, 470],
    nodes: [
      { id: "st", x: 170, y: 4, w: 220, h: 50, title: "Need a power supply", shape: "pill", color: "yellow", step: 0 },
      { id: "d1", x: 160, y: 84, w: 240, h: 118, title: "Ultra-low noise\nneeded?", sub: "(audio, RF, sensors)", shape: "diamond", color: "peach", step: 1 },
      { id: "lin", x: 426, y: 113, w: 130, h: 60, title: "Linear", sub: "quiet output", color: "blue", step: 2 },
      { id: "d2", x: 160, y: 236, w: 240, h: 118, title: "Power > ~5 W or\nportable/battery?", sub: "(efficiency & size)", shape: "diamond", color: "peach", step: 3 },
      { id: "sm", x: 426, y: 265, w: 130, h: 60, title: "SMPS", sub: "efficient, small", color: "pink", step: 4 },
      { id: "ldo", x: 170, y: 394, w: 220, h: 64, title: "Linear / LDO", sub: "simple & cheap at low power", color: "blue", step: 5 }
    ],
    edges: [
      { from: "st", to: "d1", fs: "b", ts: "t", step: 0.5 },
      { from: "d1", to: "lin", fs: "r", ts: "l", step: 1.5, label: "Yes" },
      { from: "d1", to: "d2", fs: "b", ts: "t", step: 2.5, label: "No" },
      { from: "d2", to: "sm", fs: "r", ts: "l", step: 3.5, label: "Yes" },
      { from: "d2", to: "ldo", fs: "b", ts: "t", step: 4.5, label: "No" }
    ]
  }
};

const minds = {
  "mind-types": {
    vb: [1180, 500],
    root: {
      x: 590, y: 250, w: 190, h: 84, label: "Power\nSupplies", color: "lav",
      children: [
        { x: 345, y: 130, w: 170, h: 50, label: "AC → DC", color: "blue", children: [
          { x: 112, y: 70, label: "Linear ★", sub: "audio amps, lab benches", focus: true },
          { x: 112, y: 190, label: "SMPS ★", sub: "PCs, phone chargers", focus: true, color: "pink" }
        ]},
        { x: 345, y: 370, w: 190, h: 50, label: "DC → DC", color: "mint", children: [
          { x: 112, y: 310, label: "Buck (step-down)", sub: "CPU supply, USB 5 V" },
          { x: 112, y: 430, label: "Boost (step-up)", sub: "power banks, LED drivers" }
        ]},
        { x: 835, y: 130, w: 170, h: 50, label: "DC → AC", color: "peach", children: [
          { x: 1068, y: 70, label: "Inverter", sub: "solar, home backup" },
          { x: 1068, y: 190, label: "UPS", sub: "computers, servers" }
        ]},
        { x: 835, y: 370, w: 200, h: 50, label: "By regulation / use", color: "yellow", children: [
          { x: 1068, y: 290, label: "Regulated", sub: "constant output voltage" },
          { x: 1068, y: 370, label: "Unregulated", sub: "simple chargers, motors" },
          { x: 1068, y: 450, label: "Programmable", sub: "lab testing, R&D" }
        ]}
      ]
    }
  },
  "mind-future": {
    vb: [720, 470],
    root: {
      x: 360, y: 230, w: 196, h: 80, label: "Future of\nPower Supplies", color: "lav",
      children: [
        { x: 365, y: 38, w: 220, label: "Renewables & EVs", sub: "solar inverters, EV chargers", color: "pink" },
        { x: 112, y: 110, w: 214, label: "GaN & SiC switches", sub: "smaller, cooler chargers", color: "pink" },
        { x: 112, y: 230, w: 214, label: "MHz switching", sub: "tiny magnetics, slim designs", color: "blue" },
        { x: 112, y: 350, w: 214, label: "Digital control", sub: "smart, programmable", color: "lav" },
        { x: 608, y: 110, w: 214, label: "USB Power Delivery", sub: "one charger, up to 240 W", color: "blue" },
        { x: 608, y: 230, w: 214, label: "Wireless charging", sub: "phones, wearables, EVs", color: "peach" },
        { x: 608, y: 350, w: 214, label: "Stricter efficiency", sub: "80 PLUS Titanium, Ecodesign", color: "yellow" },
        { x: 365, y: 425, w: 230, label: "Hybrid: SMPS + LDO", sub: "efficiency and low noise", color: "yellow" }
      ]
    }
  }
};

/* ---------------- Waveforms (slide 6) ---------------- */
function wavePath(type) {
  const W = 200, Z = 46, N = 200;
  const pts = [];
  let v = 0, charged = false;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 4 * Math.PI;     // two full cycles
    const x = 6 + (i / N) * (W - 12);
    let y;
    if (type === "ac") y = 38 * Math.sin(t);
    else if (type === "small") y = 20 * Math.sin(t);
    else if (type === "rect") y = 20 * Math.abs(Math.sin(t));
    else if (type === "ripple") {
      const s = 20 * Math.abs(Math.sin(t));
      if (!charged && t >= Math.PI / 2) charged = true;
      v = charged ? Math.max(s, v - 0.1) : s;
      y = v;
    } else y = 11;
    pts.push(`${x.toFixed(1)},${(Z - y).toFixed(1)}`);
  }
  return "M" + pts.join(" L");
}

function buildWaves() {
  const box = document.getElementById("linearWaves");
  const stages = [
    ["ac", "AC Mains", "230 V sine wave (≈ 325 V peak)", "yellow"],
    ["small", "Transformer", "Same shape, stepped down to ~12 V AC", "blue"],
    ["rect", "Rectifier", "Negative halves flipped → pulsating DC", "blue"],
    ["ripple", "Filter Capacitor", "Charges at peaks, slowly discharges → small ripple", "blue"],
    ["flat", "Regulator", "Ripple removed → flat, steady 5 V DC", "pink"]
  ];
  stages.forEach(([type, name, desc, color], i) => {
    const c = PALETTE[color];
    const s = document.createElement("div");
    s.className = "wstage seq";
    s.style.setProperty("--s", i * 1.4);
    s.style.borderColor = c.stroke;
    s.innerHTML = `
      <h4><span class="wn" style="background:${c.fill};color:${c.ink};border:1.5px solid ${c.stroke}">${i + 1}</span>${name}</h4>
      <svg viewBox="0 0 200 92">
        <line x1="4" y1="46" x2="196" y2="46" stroke="#cfd8e3" stroke-dasharray="3 3"/>
        <text x="196" y="58" text-anchor="end" font-size="9" fill="#9aa5b4">0 V</text>
        <path class="wave" pathLength="1" d="${wavePath(type)}" fill="none" stroke="${c.ink}" stroke-width="2.2" stroke-linejoin="round"/>
      </svg>
      <p>${desc}</p>`;
    box.appendChild(s);
    if (i < stages.length - 1) {
      const a = document.createElement("div");
      a.className = "warrow seq";
      a.style.setProperty("--s", i * 1.4 + 0.7);
      a.innerHTML = `<svg viewBox="0 0 34 20"><path d="M2 10 H26" stroke="#e58bb2" stroke-width="2.4"/><path d="M24 4 L32 10 L24 16 z" fill="#e58bb2"/></svg>`;
      box.appendChild(a);
    }
  });
}

/* ---------------- PWM demo (slide 9) ---------------- */
function drawPWM(duty) {
  const svg = document.getElementById("pwmSvg");
  const D = duty / 100, VIN = 24;
  const x0 = 46, x1 = 548, hi = 22, lo = 112, periods = 6, P = (x1 - x0) / periods;
  let d = `M${x0},${lo}`;
  for (let k = 0; k < periods; k++) {
    const a = x0 + k * P, b = a + P * D;
    d += ` L${a},${lo} L${a},${hi} L${b},${hi} L${b},${lo}`;
  }
  d += ` L${x1},${lo}`;
  const avgY = lo - (lo - hi) * D;
  svg.innerHTML = `
    <line x1="${x0}" y1="${lo}" x2="${x1}" y2="${lo}" stroke="#cfd8e3"/>
    <text x="38" y="${hi + 4}" text-anchor="end" font-size="12" fill="#6b7788">24 V</text>
    <text x="38" y="${lo + 4}" text-anchor="end" font-size="12" fill="#6b7788">0 V</text>
    <path d="${d}" fill="rgba(244,163,196,.22)" stroke="#c2477e" stroke-width="2.2" stroke-linejoin="round"/>
    <line x1="${x0}" y1="${avgY}" x2="${x1}" y2="${avgY}" stroke="#a07a0c" stroke-width="2" stroke-dasharray="7 5"/>
    <rect x="${x1 - 118}" y="${avgY - 21}" width="118" height="18" rx="9" fill="#fff6d1"/>
    <text x="${x1 - 59}" y="${avgY - 8}" text-anchor="middle" font-size="12" font-weight="600" fill="#a07a0c">average ${(D * VIN).toFixed(1)} V</text>
    <text x="${x0 + P * D / 2}" y="${lo + 22}" text-anchor="middle" font-size="11" fill="#c2477e">ON</text>
    <text x="${x0 + P * D + P * (1 - D) / 2}" y="${lo + 22}" text-anchor="middle" font-size="11" fill="#9aa5b4">OFF</text>`;
  document.getElementById("dutyVal").textContent = duty + "%";
  document.getElementById("dutyCalc").textContent = `${D.toFixed(2)} × 24 V = ${(D * VIN).toFixed(1)} V`;
}

/* ---------------- Efficiency calculator (slide 10) ---------------- */
function calc() {
  const vin = parseFloat(document.getElementById("cVin").value);
  const vout = parseFloat(document.getElementById("cVout").value);
  const I = parseFloat(document.getElementById("cI").value);
  const out = document.getElementById("calcOut");
  if (!(vin > 0 && vout > 0 && I > 0)) { out.innerHTML = `<p class="muted small">Enter positive values.</p>`; return; }
  const pout = vout * I;
  const linOk = vin > vout;
  const linLoss = (vin - vout) * I, linEff = (vout / vin) * 100;
  const swIn = pout / 0.9, swLoss = swIn - pout;
  const maxLoss = Math.max(linOk ? linLoss : 0, swLoss, 0.001);
  out.innerHTML = `
    <div class="calc-res lin"><b class="t-blue">Linear</b>
      ${linOk ? `
      <div class="row"><span>Efficiency</span><b>${linEff.toFixed(0)}%</b></div>
      <div class="row"><span>Heat wasted</span><b>${linLoss.toFixed(1)} W</b></div>
      <div class="heat"><div style="width:${(linLoss / maxLoss) * 100}%"></div></div>`
      : `<div class="row"><span>Not possible — linear can only step <b>down</b> (V<sub>in</sub> must exceed V<sub>out</sub>).</span></div>`}
    </div>
    <div class="calc-res sw"><b class="t-pink">SMPS</b>
      <div class="row"><span>Efficiency</span><b>90%</b></div>
      <div class="row"><span>Heat wasted</span><b>${swLoss.toFixed(1)} W</b></div>
      <div class="heat"><div style="width:${(swLoss / maxLoss) * 100}%"></div></div>
    </div>
    <p class="small">Useful output power: <b>${pout.toFixed(1)} W</b></p>`;
}

/* ---------------- Slide engine ---------------- */
const stage = document.getElementById("stage");
const slides = [...document.querySelectorAll(".slide")];
let current = 0;

function fit() {
  const s = Math.min(window.innerWidth / 1280, (window.innerHeight - 8) / 720) * 0.97;
  stage.style.transform = `translate(-50%, -50%) scale(${s})`;
}

function play(slide) {
  slide.classList.remove("play");
  void slide.offsetWidth;            // restart CSS animations
  slide.classList.add("play");
}

/* PowerPoint-style transition for each slide (applied when that slide enters) */
const TRANS = ["zoom", "push", "circle", "cover", "push", "split", "flip", "push", "cover", "zoom", "split", "push", "circle", "zoom"];
const TMAP = {
  fade:   ["tFade", "tFadeOut"],
  push:   ["tPushIn", "tPushOut"],
  zoom:   ["tZoomIn", "tZoomOut"],
  cover:  ["tCoverIn", "tDim"],
  circle: ["tCircleIn", "tDim"],
  split:  ["tSplitIn", "tDim"],
  flip:   ["tFlipIn", "tFlipOut"]
};

/* Give every element on a slide an entrance effect and a delay, in reading order */
const BUILD_SEL = ".sh, .card, .photo, .diagram, .comp, .mini, .chip, .pc-title, .pc, .verdict span, " +
  ".app-col, .cmp thead tr, .cmp tbody tr, .footnote, .title-left > :not(h1)";

function assignBuilds(slide) {
  const all = [...slide.querySelectorAll(BUILD_SEL)];
  const items = all.filter(e => !all.some(o => o !== e && o.contains(e)));
  const box = slide.getBoundingClientRect();
  const mid = box.left + box.width / 2;
  let t = 0.45;

  items.forEach(e => {
    let fx = "b-up", step = 0.15;
    if (e.matches(".sh")) fx = "b-wipe";
    else if (e.matches(".photo, .comp")) fx = "b-zoom";
    else if (e.matches(".chip")) { fx = "b-pop"; step = 0.07; }
    else if (e.matches(".mini, .verdict span")) fx = "b-flip";
    else if (e.matches(".pc-title")) fx = "b-down";
    else if (e.matches("tr")) { fx = "b-left"; step = 0.07; }
    else if (e.matches(".card, .pc, .app-col")) {
      const r = e.getBoundingClientRect(), c = r.left + r.width / 2;
      fx = r.width < box.width * 0.7 && c < mid - 60 ? "b-left" : r.width < box.width * 0.7 && c > mid + 60 ? "b-right" : "b-up";
    }
    e.classList.add("b", fx);
    e.style.setProperty("--d", `${t.toFixed(2)}s`);

    // diagrams build their own nodes/arrows once the box is in place
    if (e.matches(".diagram")) e.style.setProperty("--base", `${(t + 0.4).toFixed(2)}s`);

    // bullet points fly in one after another, like PowerPoint "by paragraph"
    const lis = e.matches(".card, .pc, .app-col") ? [...e.querySelectorAll("li")] : [];
    lis.forEach((li, i) => {
      li.classList.add("b", "b-left");
      li.style.setProperty("--d", `${(t + 0.25 + i * 0.09).toFixed(2)}s`);
    });
    t += step + lis.length * 0.05;
  });
}

function go(n, first = false) {
  n = Math.max(0, Math.min(slides.length - 1, n));
  if (n === current && !first) return;
  stage.style.setProperty("--dir", n >= current ? 1 : -1);
  const [tin, tout] = TMAP[TRANS[n]] || TMAP.fade;

  const old = slides[current], next = slides[n];
  if (!first && old !== next) {
    old.classList.remove("active");
    old.style.setProperty("--tout", tout);
    old.classList.add("leaving");
    clearTimeout(old._t);
    old._t = setTimeout(() => old.classList.remove("leaving", "play"), 900);
  }
  clearTimeout(next._t);
  next.classList.remove("leaving", "active");
  next.style.setProperty("--tin", tin);
  void next.offsetWidth;
  next.classList.add("active");
  play(next);

  current = n;
  document.getElementById("counter").textContent = `${current + 1} / ${slides.length}`;
  document.getElementById("progressBar").style.width = `${((current + 1) / slides.length) * 100}%`;
  history.replaceState(null, "", `#${current + 1}`);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}

document.addEventListener("keydown", e => {
  if (e.target.matches("input, [contenteditable]")) return;
  if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); go(current + 1); }
  else if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); go(current - 1); }
  else if (e.key === "Home") go(0);
  else if (e.key === "End") go(slides.length - 1);
  else if (e.key.toLowerCase() === "f") toggleFullscreen();
});
document.getElementById("prevBtn").onclick = () => go(current - 1);
document.getElementById("nextBtn").onclick = () => go(current + 1);
document.getElementById("fsBtn").onclick = toggleFullscreen;
document.querySelectorAll(".replay").forEach(b => b.onclick = () => play(b.closest(".slide")));

let touchX = null;
document.addEventListener("touchstart", e => touchX = e.touches[0].clientX, { passive: true });
document.addEventListener("touchend", e => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) go(current + (dx < 0 ? 1 : -1));
  touchX = null;
});

/* ---------------- Init ---------------- */
for (const id in flows) renderFlow(document.getElementById(id), flows[id]);
for (const id in minds) renderMind(document.getElementById(id), minds[id]);
buildWaves();
drawPWM(40);
document.getElementById("duty").addEventListener("input", e => drawPWM(+e.target.value));
["cVin", "cVout", "cI"].forEach(id => document.getElementById(id).addEventListener("input", calc));
calc();

// Title-slide decoration: a sine wave (AC) that becomes a flat line (DC)
(() => {
  const p = document.getElementById("titleWavePath");
  if (!p) return;
  const pts = [];
  for (let x = 40; x <= 700; x += 4) pts.push(`${x},${35 - 22 * Math.sin((x - 40) / 30) * Math.max(0, 1 - Math.max(0, x - 520) / 180)}`);
  pts.push("1240,35");
  p.setAttribute("d", "M" + pts.join(" L"));
})();

window.addEventListener("resize", fit);
fit();
slides.forEach(assignBuilds);
current = (parseInt(location.hash.slice(1), 10) || 1) - 1;
go(current, true);
