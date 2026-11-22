/* Nutanix Build Lab: vanilla JS, no build step. */
(function () {
  'use strict';

  const STORE = 'nbl.lab.v1';
  const THEME = 'nbl.theme';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const fmt = (n, d = 1) => (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString();

  let lab;
  let view = 'physical';
  let sel = null; // { type, id }
  const fail = { nodes: new Set(), cvms: new Set(), tors: new Set(), disk: '' };

  /* ---------- state ---------- */
  function load() {
    const h = location.hash.match(/lab=([^&]+)/);
    if (h) {
      try {
        lab = normalize(JSON.parse(decodeURIComponent(escape(atob(h[1])))));
        history.replaceState(null, '', location.pathname);
        save();
        toast('Lab loaded from shared link');
        return;
      } catch (e) { console.warn('Bad shared lab', e); }
    }
    try { lab = JSON.parse(localStorage.getItem(STORE)); } catch (e) { lab = null; }
    if (!valid(lab)) lab = window.NBL_SAMPLE();
    normalize(lab);
  }
  function normalize(l) {
    const nw = l.network;
    if (!nw.layout) nw.layout = '1x2';
    if (!nw.vmSwitch) nw.vmSwitch = 'vs1 (br1)';
    if (!nw.vmBondMode) nw.vmBondMode = 'balance-slb';
    if (l.pc && l.pc.deployed === undefined) l.pc.deployed = true;
    if (!l.storage.poolName) l.storage.poolName = 'default-storage-pool';
    if (!l.cluster.peAuth) l.cluster.peAuth = 'Local admin only';
    if (!l.services.directoryTarget) l.services.directoryTarget = 'Prism Central only';
    nw.vmNetworks.forEach((v) => { if (!v.vs) v.vs = nw.layout === '2x2' ? 'vs1' : 'vs0'; if (nw.layout === '1x2') v.vs = 'vs0'; });
    l.nodes.forEach((n, i) => { if (nw.layout === '2x2') { if (!n.torAPort2) n.torAPort2 = 'Eth1/' + (i + 17); if (!n.torBPort2) n.torBPort2 = 'Eth1/' + (i + 17); } });
    if (nw.layout === '2x2' && /^2x 25GbE/.test(l.hardware.dataNics)) l.hardware.dataNics = '4x 25GbE SFP28 (2 dual-port cards)';
    if (nw.layout === '1x2' && /^4x 25GbE/.test(l.hardware.dataNics)) l.hardware.dataNics = '2x 25GbE SFP28';
    return l;
  }
  function valid(l) { return l && l.schema === 1 && Array.isArray(l.nodes) && l.cluster && l.hardware; }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(lab)); } catch (e) { /* storage may be blocked */ } }

  /* ---------- calculations ---------- */
  const node = (id) => lab.nodes.find((n) => n.id === id);
  const net = (id) => lab.network.vmNetworks.find((n) => n.id === id);
  const vlanText = (v) => {
    if (!v) return '';
    if (v.mgmt) return lab.network.mgmtTagging === 'Tagged' ? 'VLAN ' + lab.network.mgmtVlan : 'VLAN 0 (native ' + lab.network.mgmtVlan + ')';
    return 'VLAN ' + v.vlan;
  };
  const vmsOn = (id) => lab.vms.filter((v) => v.host === id);
  const pcUp = () => !!(lab.pc && lab.pc.deployed !== false);
  const pcOn = (id) => (pcUp() && lab.pc.host === id ? lab.pc : null);
  const cores = () => lab.hardware.sockets * lab.hardware.coresPerSocket;
  const nodeRawTB = () => lab.hardware.diskCount * lab.hardware.diskSizeTB;
  const ft = () => (Number(lab.cluster.rf) === 3 ? 2 : 1);

  function hostUse(id) {
    const vms = vmsOn(id);
    const pc = pcOn(id);
    return {
      vcpuVm: vms.reduce((a, v) => a + Number(v.vcpu), 0),
      ramVm: vms.reduce((a, v) => a + Number(v.ramGB), 0),
      vcpuPc: pc ? Number(pc.vcpu) : 0,
      ramPc: pc ? Number(pc.ramGB) : 0,
      vcpuCvm: Number(lab.cvm.vcpu),
      ramCvm: Number(lab.cvm.ramGB)
    };
  }
  function clusterNums() {
    const n = lab.nodes.length;
    const ramTotal = n * lab.hardware.ramGB;
    const ramCvm = n * lab.cvm.ramGB;
    const ramWork = lab.vms.reduce((a, v) => a + Number(v.ramGB), 0) + (pcUp() ? Number(lab.pc.ramGB) : 0);
    const vcpuWork = lab.vms.reduce((a, v) => a + Number(v.vcpu), 0) + (pcUp() ? Number(lab.pc.vcpu) : 0);
    const haRam = (n - ft()) * (lab.hardware.ramGB - lab.cvm.ramGB);
    const raw = n * nodeRawTB();
    const rf = Number(lab.cluster.rf);
    const reserve = ft() * nodeRawTB();
    const usable = Math.max(0, (raw - reserve) * (1 - lab.storage.planningOverheadPct / 100) / rf);
    const prov = lab.vms.reduce((a, v) => a + Number(v.diskGB), 0) / 1000;
    return { n, ramTotal, ramCvm, ramWork, vcpuWork, haRam, raw, reserve, usable, prov, coresTotal: n * cores() };
  }

  /* ---------- svg helpers ---------- */
  const R = (x, y, w, h, cls, rx = 6) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" class="${cls}"/>`;
  const T = (x, y, t, cls = '', anchor = 'start') => `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${esc(t)}</text>`;
  const L = (x1, y1, x2, y2, cls) => `<path d="M${x1} ${y1} L${x2} ${y2}" class="${cls}"/>`;
  const C = (x1, y1, x2, y2, cls) => { const m = (y1 + y2) / 2; return `<path d="M${x1} ${y1} C${x1} ${m} ${x2} ${m} ${x2} ${y2}" class="${cls}"/>`; };
  const isSel = (type, id) => sel && sel.type === type && sel.id === id;
  const G = (type, id, inner) => `<g class="obj${isSel(type, id) ? ' sel' : ''}" data-type="${type}" data-id="${esc(id)}">${inner}</g>`;
  const defs = `<defs><marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor" style="fill:var(--vm)"/></marker></defs>`;
  // lane order that keeps orthogonal cables from crossing: cables are {tx: x at top end, bx: x at bottom end}
  const laneOrder = (cables) => {
    const idx = cables.map((c, i) => i);
    const left = idx.filter((i) => cables[i].bx < cables[i].tx).sort((a, b) => cables[a].tx - cables[b].tx);
    const right = idx.filter((i) => cables[i].bx >= cables[i].tx).sort((a, b) => cables[b].tx - cables[a].tx);
    const lanes = []; left.concat(right).forEach((i, k) => { lanes[i] = k; });
    return lanes;
  };
  const head = (title, text, actions = '') => `<div class="view-head"><div><h2>${esc(title)}</h2><p>${text}</p></div><div>${actions}</div></div>`;

  /* ---------- views ---------- */
  const VIEWS = {};

  VIEWS.physical = function () {
    const U = 20, units = 42, top = 24, x0 = 50, rw = 330;
    const uy = (u) => top + (units - u) * U;
    let s = `<svg class="diagram" viewBox="0 0 ${x0 + rw + 40} ${top + units * U + 30}">`;
    s += R(x0 - 10, top - 10, rw + 20, units * U + 20, 'rack', 4);
    for (let u = 1; u <= units; u++) {
      s += `<rect x="${x0}" y="${uy(u)}" width="${rw}" height="${U}" class="unit"/>`;
      if (u % 2 === 1) s += T(x0 - 16, uy(u) + 12, u, 't-muted t-small', 'end');
    }
    const swU = { torA: 42, torB: 41, oob: 40 };
    lab.switches.forEach((sw) => {
      const y = uy(swU[sw.id] || 39) + 1;
      let inner = R(x0 + 2, y, rw - 4, U - 2, 'sw', 3) + T(x0 + 10, y + 13, sw.name, 't-small t-title');
      const ports = sw.id === 'oob' ? 24 : 32;
      for (let p = 0; p < ports; p++) inner += `<rect x="${x0 + 90 + p * 7}" y="${y + 5}" width="5" height="8" class="port"/>`;
      s += G('switch', sw.id, inner);
    });
    lab.nodes.forEach((n, i) => {
      const u = 36 - i;
      const y = uy(u) + 1;
      const down = fail.nodes.has(n.id);
      let inner = R(x0 + 2, y, rw - 4, U - 2, 'node-box' + (down ? ' down' : ''), 3);
      inner += `<circle cx="${x0 + 12}" cy="${y + 9}" r="3" class="${down ? 'led-bad' : 'led-ok'}"/>`;
      inner += T(x0 + 22, y + 13, n.name, 't-small t-title');
      const shown = Math.min(lab.hardware.diskCount, 16);
      for (let d = 0; d < shown; d++) inner += `<rect x="${x0 + 110 + d * 13}" y="${y + 3}" width="10" height="12" rx="1.5" class="bay"/>`;
      if (lab.hardware.diskCount > 16) inner += T(x0 + 110 + 16 * 13 + 2, y + 13, '+' + (lab.hardware.diskCount - 16), 't-muted t-small');
      s += G('node', n.id, inner);
    });
    s += T(x0 + rw / 2, top + units * U + 24, '42U rack, front view (example layout)', 't-muted', 'middle');
    s += '</svg>';

    const two = lab.network.layout === '2x2';
    let t = `<table class="grid"><thead><tr><th>Node</th><th>TOR-A${two ? ' (vs0 / vs1)' : ''}</th><th>TOR-B${two ? ' (vs0 / vs1)' : ''}</th><th>OOB</th><th>AHV host</th><th>CVM</th><th>IPMI</th></tr></thead><tbody>`;
    lab.nodes.forEach((n) => {
      t += `<tr class="click${isSel('node', n.id) ? ' sel' : ''}" data-type="node" data-id="${esc(n.id)}"><td><b>${esc(n.name)}</b></td><td class="mono">${esc(n.torAPort)}${two ? ' / ' + esc(n.torAPort2 || '') : ''}</td><td class="mono">${esc(n.torBPort)}${two ? ' / ' + esc(n.torBPort2 || '') : ''}</td><td class="mono">${esc(n.oobPort)}</td><td class="mono">${esc(n.hostIp)}</td><td class="mono">${esc(n.cvmIp)}</td><td class="mono">${esc(n.ipmiIp)}</td></tr>`;
    });
    t += '</tbody></table>';
    t = '<div style="overflow-x:auto">' + t + '</div>';

    const hw = lab.hardware;
    const cards = `<div class="cards">
      <div class="card obj" data-type="hardware" data-id="hw"><div class="lbl">Node model</div><div><b>${esc(hw.model)}</b></div></div>
      <div class="card obj" data-type="hardware" data-id="hw"><div class="lbl">CPU per node</div><div class="big">${hw.sockets} x ${hw.coresPerSocket}c</div><div class="lbl">${cores()} physical cores</div></div>
      <div class="card obj" data-type="hardware" data-id="hw"><div class="lbl">Memory per node</div><div class="big">${fmt(hw.ramGB, 0)} GB</div></div>
      <div class="card obj" data-type="hardware" data-id="hw"><div class="lbl">Data drives per node</div><div class="big">${hw.diskCount} x ${hw.diskSizeTB} TB</div><div class="lbl">${esc(hw.diskType)}, boot on ${esc(hw.bootDevice)}</div></div>
      <div class="card obj" data-type="hardware" data-id="hw"><div class="lbl">NICs per node</div><div><b>${esc(hw.dataNics)}</b></div><div class="lbl">${esc(hw.bmc)}</div></div>
    </div>`;

    return head('Physical view', `${lab.nodes.length} single-node 1U appliances, two data top-of-rack switches and one out-of-band switch for IPMI. ${lab.network.layout === '2x2' ? 'Each node has two data uplinks to each ToR (one per bond)' : 'Each node has one data uplink to each ToR'} and one BMC link to the OOB switch.`, '<button class="btn" data-act="addNode">Add node</button>') +
      `<div class="two"><div>${s}</div><div><h3 style="margin:0">Cabling and addressing</h3><p class="muted" style="margin:2px 0 0">Click a row to edit the node, its ports and IP addresses.</p>${t}${cards}</div></div>`;
  };

  VIEWS.network = function () {
    const two = lab.network.layout === '2x2';
    const n = lab.nodes.length, cw = two ? 270 : 200, gap = two ? 16 : 18;
    const hx = (i) => 20 + i * (cw + gap);
    const HH = 312;
    const vs0 = String(lab.network.virtualSwitch).split(' ')[0];
    const vs1 = String(lab.network.vmSwitch || 'vs1').split(' ')[0];
    // host port positions relative to host x: [label, offset, switch, node field]
    const ports = two
      ? [['A1', 8, 'torA', 'torAPort'], ['B1', 56, 'torB', 'torBPort'], ['A2', 112, 'torA', 'torAPort2'], ['B2', 160, 'torB', 'torBPort2']]
      : [['25G-A', 14, 'torA', 'torAPort'], ['25G-B', 74, 'torB', 'torBPort']];
    const pw = two ? 44 : 50;
    const bmcX = cw - (two ? 54 : 58);

    // switch geometry: one labeled port per cable, in host order
    const SPW = 52, SPG = 6;
    const torPorts = { torA: [], torB: [] };
    lab.nodes.forEach((nd, i) => ports.forEach((p) => torPorts[p[2]].push({ i, nd, p })));
    const swW = (k) => Math.max(200, k * (SPW + SPG) + 24);
    const wA = swW(torPorts.torA.length), wB = swW(torPorts.torB.length), wO = swW(n);
    const hostsSpan = Math.max(0, n * (cw + gap) - gap);
    const pairW = wA + 90 + wB;
    const x0 = 20 + Math.max(0, (hostsSpan - pairW) / 2);
    const W = Math.max(1000, hostsSpan + 40, x0 + pairW + 20, 20 + wO + 20);
    const SY = 84, SH = 56;
    const torA = { x: x0, y: SY, w: wA }, torB = { x: x0 + wA + 90, y: SY, w: wB };
    const portX = (sw, k) => sw.x + 12 + k * (SPW + SPG);

    // channels: each cable gets its own horizontal lane so no two cables overlap
    const step = 6;
    const topCables = n * ports.length;
    const bandTop = SY + SH + 26;
    const HY = bandTop + topCables * step + 34;
    const oobY = HY + HH + 26 + n * step + 26;
    const oob = { x: 20 + Math.max(0, (hostsSpan - wO) / 2), y: oobY, w: wO };
    const H = oobY + SH + 30;
    const O = (x1, y1, x2, y2, ym, cls) => `<path d="M${x1} ${y1} V${ym} H${x2} V${y2}" class="${cls}"/>`;
    const portLbl = (v) => String(v || '').replace(/^Ethernet/i, 'Eth').replace(/^GigabitEthernet/i, 'Gi');

    let s = `<svg class="diagram" viewBox="0 0 ${W} ${H + 120}" style="min-width:${Math.round(W * 0.72)}px">`;
    const coreX = x0 + pairW / 2;
    s += R(coreX - 110, 12, 220, 40, 'svc') + T(coreX, 30, 'Upstream / core network', 't-title', 'middle') + T(coreX, 45, 'Routed gateways for all VLANs', 't-muted', 'middle');
    s += O(coreX - 40, 52, torA.x + wA / 2, SY, 68, 'wire') + O(coreX + 40, 52, torB.x + wB / 2, SY, 68, 'wire');
    s += L(torA.x + wA, SY + 20, torB.x, SY + 20, 'peer') + T(torA.x + wA + 45, SY + 12, 'MLAG / vPC', 't-muted', 'middle');

    const swBox = (sw, g, list, portsOnTop) => {
      const down = fail.tors.has(sw.id);
      let h = R(g.x, g.y, g.w, SH, 'sw' + (down ? ' down' : '')) + T(g.x + 10, g.y + (portsOnTop ? SH - 10 : 18), sw.name, 't-title') + T(g.x + g.w - 10, g.y + (portsOnTop ? SH - 10 : 18), sw.role, 't-muted', 'end');
      list.forEach((c, k) => {
        const px = portX(g, k), py = portsOnTop ? g.y - 8 : g.y + SH - 22;
        h += `<rect x="${px}" y="${py}" width="${SPW}" height="22" rx="3" class="port"/>` + T(px + SPW / 2, py + 15, portLbl(c.label), 't-mono', 'middle').replace('class="', 'style="font-size:9.5px" class="');
      });
      return G('switch', sw.id, h);
    };
    const swA = lab.switches.find((x) => x.id === 'torA'), swB = lab.switches.find((x) => x.id === 'torB'), swO = lab.switches.find((x) => x.id === 'oob');
    s += swBox(swA, torA, torPorts.torA.map((c) => ({ label: c.nd[c.p[3]] })), false);
    s += swBox(swB, torB, torPorts.torB.map((c) => ({ label: c.nd[c.p[3]] })), false);
    s += swBox(swO, oob, lab.nodes.map((nd) => ({ label: nd.oobPort })), true);

    // data cables (up to the ToRs)
    const top = [];
    ['torA', 'torB'].forEach((sid) => {
      const g = sid === 'torA' ? torA : torB;
      torPorts[sid].forEach((c, k) => top.push({ tx: portX(g, k) + SPW / 2, bx: hx(c.i) + c.p[1] + pw / 2, sid, c }));
    });
    const tl = laneOrder(top);
    top.forEach((t, i) => {
      const isDown = fail.tors.has(t.sid) || fail.nodes.has(t.c.nd.id);
      s += O(t.tx, SY + SH, t.bx, HY - 12, bandTop + tl[i] * step, isDown ? 'wire-down' : (t.sid === 'torA' ? 'wire-a' : 'wire-b'));
    });
    // BMC cables (down to the OOB switch)
    const bot = lab.nodes.map((nd, i) => ({ tx: hx(i) + bmcX + 22, bx: portX(oob, i) + SPW / 2 }));
    const bl = laneOrder(bot);
    bot.forEach((b, i) => { s += O(b.tx, HY + HH + 11, b.bx, oobY - 8, HY + HH + 26 + bl[i] * step, 'wire-ipmi'); });

    lab.nodes.forEach((nd, i) => {
      const x = hx(i), y = HY;
      const down = fail.nodes.has(nd.id), cvmDown = fail.cvms.has(nd.id);
      const vms = vmsOn(nd.id).length + (pcOn(nd.id) ? 1 : 0);
      let h = G('node', nd.id, R(x, y, cw, HH, 'host' + (down ? ' down' : '')) + T(x + 10, y + HH - 12, nd.name, 't-title'));
      ports.forEach((p) => { h += R(x + p[1], y - 12, pw, 22, 'port', 4) + T(x + p[1] + pw / 2, y + 3, p[0], 't-small', 'middle'); });
      h += R(x + bmcX, y + HH - 11, 44, 22, 'ipmi', 4) + T(x + bmcX + 22, y + HH + 4, 'BMC', 't-small', 'middle');
      h += T(x + cw - 8, y + HH - 16, 'BMC ' + nd.ipmiIp, 't-mono t-muted', 'end').replace('class="', 'style="font-size:9px" class="');
      const cvmBox = (cx, w) => G('cvm', nd.id, R(cx, y + 158, w, 74, 'cvm' + (cvmDown || down ? ' down' : '')) + T(cx + w / 2, y + 176, 'CVM', 't-title', 'middle') + T(cx + 6, y + 194, 'eth0', 't-muted t-small') + T(cx + 6, y + 207, nd.cvmIp, 't-mono') + T(cx + 6, y + 224, 'eth1 192.168.5.2', 't-small'));
      const uvmBox = (cx, w) => G('vmsof', nd.id, R(cx, y + 158, w, 74, 'uvm' + (down ? ' down' : '')) + T(cx + w / 2, y + 184, 'User VMs', 't-small t-title', 'middle') + T(cx + w / 2, y + 206, vms, 't-title', 'middle').replace('t-title', 't-title" style="font-size:20px') + T(cx + w / 2, y + 224, 'on this host', 't-muted', 'middle'));
      if (two) {
        const bw = 96, b0 = x + 8, b1 = x + 112;
        h += L(x + 30, y + 10, b0 + 30, y + 48, 'wire') + L(x + 78, y + 10, b0 + 66, y + 48, 'wire');
        h += L(x + 134, y + 10, b1 + 30, y + 48, 'wire') + L(x + 182, y + 10, b1 + 66, y + 48, 'wire');
        h += G('netcfg', 'bond', R(b0, y + 48, bw, 36, 'br') + T(b0 + bw / 2, y + 63, 'br0-up bond', 't-small t-title', 'middle') + T(b0 + bw / 2, y + 77, lab.network.bondMode, 't-muted', 'middle'));
        h += G('netcfg', 'bond1', R(b1, y + 48, bw, 36, 'uvm') + T(b1 + bw / 2, y + 63, 'br1-up bond', 't-small t-title', 'middle') + T(b1 + bw / 2, y + 77, lab.network.vmBondMode, 't-muted', 'middle'));
        h += L(b0 + bw / 2, y + 84, b0 + bw / 2, y + 96, 'wire') + L(b1 + bw / 2, y + 84, b1 + bw / 2, y + 96, 'wire');
        h += G('netcfg', 'vs', R(b0, y + 96, bw, 42, 'br') + T(b0 + bw / 2, y + 113, 'br0 / ' + vs0, 't-small t-title', 'middle') + T(b0 + bw / 2, y + 130, nd.hostIp, 't-mono', 'middle'));
        h += G('netcfg', 'vs1', R(b1, y + 96, bw, 42, 'uvm') + T(b1 + bw / 2, y + 113, 'br1 / ' + vs1, 't-small t-title', 'middle') + T(b1 + bw / 2, y + 130, 'VM traffic only', 't-muted', 'middle'));
        h += L(b0 + bw / 2, y + 138, b0 + bw / 2, y + 158, 'wire') + L(b1 + bw / 2, y + 138, b1 + bw / 2, y + 158, 'wire');
        h += cvmBox(b0, bw) + uvmBox(b1, bw);
        h += L(b0 + bw / 2, y + 232, b0 + bw / 2, y + 246, 'wire');
        h += R(b0, y + 246, bw, 36, 'svc') + T(b0 + bw / 2, y + 261, 'virbr0', 't-small', 'middle') + T(b0 + bw / 2, y + 275, '192.168.5.1', 't-mono t-muted', 'middle');
        h += T(b1 + bw / 2, y + 258, 'Host and CVM', 't-muted', 'middle') + T(b1 + bw / 2, y + 272, `use ${vs0}`, 't-muted', 'middle');
      } else {
        h += L(x + 39, y + 10, x + 69, y + 50, 'wire') + L(x + 99, y + 10, x + 99, y + 50, 'wire');
        h += G('netcfg', 'bond', R(x + 10, y + 50, cw - 20, 28, 'br') + T(x + cw / 2, y + 68, 'br0-up bond: ' + lab.network.bondMode, 't-small', 'middle'));
        h += L(x + cw / 2, y + 78, x + cw / 2, y + 96, 'wire');
        h += G('netcfg', 'vs', R(x + 10, y + 96, cw - 20, 42, 'br') + T(x + cw / 2, y + 113, 'br0  (virtual switch ' + vs0 + ')', 't-small t-title', 'middle') + T(x + cw / 2, y + 130, 'AHV host ' + nd.hostIp, 't-mono', 'middle'));
        h += L(x + 56, y + 138, x + 56, y + 158, 'wire') + L(x + 149, y + 138, x + 149, y + 158, 'wire');
        h += cvmBox(x + 10, 92) + uvmBox(x + 108, 82);
        h += L(x + 56, y + 232, x + 56, y + 246, 'wire');
        h += R(x + 10, y + 246, cw - 20, 34, 'svc') + T(x + cw / 2, y + 261, 'virbr0  192.168.5.1', 't-small', 'middle') + T(x + cw / 2, y + 274, 'internal host to CVM link', 't-muted', 'middle').replace('class="', 'style="font-size:9.5px" class="');
      }
      s += h;
    });

    const ly = H + 20;
    s += T(20, ly, 'Networks (click to edit)', 't-title');
    const chips = [
      { type: 'netcfg', id: 'mgmt', label: `Mgmt VLAN ${lab.network.mgmtVlan}  ${lab.network.mgmtSubnet}  (${lab.network.mgmtTagging})${two ? '  on ' + vs0 : ''}`, cls: 'br' },
      { type: 'netcfg', id: 'ipmi', label: `IPMI VLAN ${lab.network.ipmiVlan}  ${lab.network.ipmiSubnet}`, cls: 'ipmi' }
    ].concat(lab.network.vmNetworks.map((v) => ({ type: 'vmnet', id: v.id, label: `${v.name}  ${vlanText(v)}  ${v.subnet}${two ? '  on ' + (v.vs || 'vs0') : ''}`, cls: 'uvm' })));
    let cx = 20, cy = ly + 12;
    chips.forEach((c) => {
      const w = c.label.length * 6.4 + 20;
      if (cx + w > W - 20) { cx = 20; cy += 34; }
      s += G(c.type, c.id, R(cx, cy, w, 26, c.cls, 13) + T(cx + w / 2, cy + 17, c.label, 't-small', 'middle'));
      cx += w + 10;
    });
    s += '</svg>';
    const text = two
      ? `Each AHV host has four 25GbE ports in two bonds, with one port of each bond on each ToR. br0-up (${esc(lab.network.bondMode)}) backs ${esc(vs0)} and carries the AHV host, CVM and management VLAN. br1-up (${esc(lab.network.vmBondMode)}) backs ${esc(vs1)} and carries only user VM VLANs, which keeps storage replication traffic separate from VM traffic. Each CVM also has a private link to its own host through virbr0. MTU ${esc(lab.network.mtu)}.`
      : `Each AHV host connects both 25GbE ports to one bond (br0-up) on bridge br0, which backs virtual switch ${esc(vs0)}. The CVM and AHV host share the management VLAN. Each CVM also has a private link to its own host on 192.168.5.0/24 through virbr0, which never leaves the host. MTU ${esc(lab.network.mtu)}.`;
    return head('Network view', text, '<button class="btn" data-act="addNet">Add VM network</button>') + s;
  };

  VIEWS.storage = function () {
    const n = lab.nodes.length, cw = 150, gap = 14;
    const W = Math.max(900, n * (cw + gap) + 40);
    const hx = (i) => 20 + i * (cw + gap);
    const rf = Number(lab.cluster.rf);
    let s = `<svg class="diagram" viewBox="0 0 ${W} 440">${defs}`;
    // containers
    const ctrs = lab.storage.containers;
    const ctrW = Math.min(240, (W - 40 - (ctrs.length - 1) * 12) / Math.max(1, ctrs.length));
    ctrs.forEach((c, i) => {
      const x = 20 + i * (ctrW + 12);
      s += G('container', c.id, R(x, 16, ctrW, 54, 'ctr') + T(x + ctrW / 2, 36, c.name, 't-title', 'middle') + T(x + ctrW / 2, 55, `RF${c.rf}${c.compression ? ', compression' : ''}${c.dedup ? ', dedup' : ''}${c.ecx ? ', EC-X' : ''}`, 't-muted', 'middle'));
      s += L(x + ctrW / 2, 70, x + ctrW / 2, 96, 'wire');
    });
    // pool
    s += G('pool', 'pool', R(10, 96, W - 20, 44, 'pool') + T(W / 2, 116, 'Storage pool: ' + lab.storage.poolName, 't-title', 'middle') + T(W / 2, 132, `All drives in the cluster: ${fmt(n * nodeRawTB())} TB raw across ${n * lab.hardware.diskCount} drives`, 't-muted', 'middle'));
    // nodes
    lab.nodes.forEach((nd, i) => {
      const x = hx(i), y = 176;
      const down = fail.nodes.has(nd.id) || fail.cvms.has(nd.id);
      let h = R(x, y, cw, 190, 'host' + (down ? ' down' : '')) + T(x + cw / 2, y + 20, nd.name, 't-title', 'middle');
      h += R(x + 10, y + 30, cw - 20, 34, 'cvm' + (down ? ' down' : '')) + T(x + cw / 2, y + 51, 'CVM (Stargate)', 't-small', 'middle');
      const per = lab.hardware.diskCount, cols = 4, dw = (cw - 20 - (cols - 1) * 6) / cols;
      for (let d = 0; d < Math.min(per, 12); d++) {
        const dx = x + 10 + (d % cols) * (dw + 6), dy = y + 76 + Math.floor(d / cols) * 26;
        const bad = fail.disk === nd.id + ':' + d;
        h += `<rect x="${dx}" y="${dy}" width="${dw}" height="20" rx="3" class="bay${bad ? ' down' : ''}"/>`;
      }
      if (per > 12) h += T(x + cw / 2, y + 160, `+${per - 12} more`, 't-muted', 'middle');
      h += T(x + cw / 2, y + 180, `${fmt(nodeRawTB())} TB raw`, 't-muted', 'middle');
      s += G('node', nd.id, h);
      s += L(x + cw / 2, 140, x + cw / 2, y, 'wire');
    });
    // RF illustration: write from VM on node 1
    if (n >= rf) {
      const y = 428;
      s += T(20, y, `Write path example (RF${rf}): a VM on ${lab.nodes[0].name} writes through its local CVM. One copy lands on local drives and ${rf - 1} replica${rf > 2 ? 's go' : ' goes'} to other nodes before the write is acknowledged.`, 't-small');
      for (let r = 1; r < rf; r++) {
        const from = hx(0) + cw / 2 + 20, to = hx(r * 2 < n ? r * 2 : r) + cw / 2 - 10;
        s += `<path d="M${from} 370 Q${(from + to) / 2} ${398 + r * 6} ${to} 370" class="arrow"/>`;
      }
      s += T(hx(0) + cw / 2 - 20, 388, 'local copy', 't-muted', 'middle');
    }
    s += '</svg>';

    const c = clusterNums();
    const ok = c.prov <= c.usable;
    const cards = `<div class="cards">
      <div class="card"><div class="lbl">Raw capacity</div><div class="big">${fmt(c.raw)} TB</div><div class="lbl">${fmt(c.raw * 0.9095)} TiB</div></div>
      <div class="card"><div class="lbl">Rebuild reserve (N+${ft()})</div><div class="big">${fmt(c.reserve)} TB</div><div class="lbl">capacity of ${ft()} node${ft() > 1 ? 's' : ''}, kept free to self-heal</div></div>
      <div class="card obj" data-type="pool" data-id="pool"><div class="lbl">Planning overhead</div><div class="big">${lab.storage.planningOverheadPct}%</div><div class="lbl">your assumption, editable</div></div>
      <div class="card"><div class="lbl">Usable estimate at RF${rf}</div><div class="big">${fmt(c.usable)} TB</div><div class="lbl">(raw - reserve) x (1 - overhead) / RF${rf}, before data reduction</div></div>
      <div class="card ${ok ? 'ok' : 'bad'}"><div class="lbl">Provisioned VM disks</div><div class="big">${fmt(c.prov)} TB</div><div class="lbl">${ok ? 'fits the usable estimate' : 'exceeds the usable estimate (thin provisioning still allowed)'}</div></div>
    </div>`;
    return head('Storage view', `The Distributed Storage Fabric pools every data drive in the cluster. Containers are logical datastores carved from the pool, each with its own replication factor and data reduction settings. ${lab.storage.defaultContainerRemoved ? 'In this build the default container was deleted after cluster creation, and the storage pool and user container are renamed after the cluster so they are easy to tell apart in Prism Central. ' : ''}Capacity is a planning estimate only; use Nutanix Sizer for real designs.`, '<button class="btn" data-act="addCtr">Add container</button>') + s + cards;
  };

  VIEWS.resources = function () {
    const c = clusterNums();
    const hw = lab.hardware;
    let h = '<div class="legend"><span><i style="background:var(--cvm)"></i>CVM</span><span><i style="background:var(--ipmi)"></i>Prism Central</span><span><i style="background:var(--vm)"></i>User VMs</span><span><i style="background:var(--bad)"></i>Over physical</span></div><div class="hosts">';
    lab.nodes.forEach((nd) => {
      const u = hostUse(nd.id);
      const down = fail.nodes.has(nd.id);
      const ram = hw.ramGB, cpu = cores();
      const vT = u.vcpuCvm + u.vcpuPc + u.vcpuVm, rT = u.ramCvm + u.ramPc + u.ramVm;
      const pct = (x, tot) => Math.max(0, Math.min(100, (x / tot) * 100));
      const cpuScale = Math.max(cpu, vT);
      h += `<div class="hostcard${down ? ' down' : ''}"><h4 data-type="node" data-id="${esc(nd.id)}">${esc(nd.name)} <small>${esc(nd.hostIp)}</small></h4>
        <div class="barlbl"><span>vCPU vs ${cpu} cores</span><span>${vT} vCPU (${fmt(vT / cpu, 2)}:1)</span></div>
        <div class="bar"><i class="c" style="width:${pct(u.vcpuCvm, cpuScale)}%"></i><i class="p" style="width:${pct(u.vcpuPc, cpuScale)}%"></i><i class="v" style="width:${pct(u.vcpuVm, cpuScale)}%"></i></div>
        <div class="barlbl"><span>Memory</span><span>${fmt(rT, 0)} / ${fmt(ram, 0)} GB</span></div>
        <div class="bar"><i class="c" style="width:${pct(u.ramCvm, Math.max(ram, rT))}%"></i><i class="p" style="width:${pct(u.ramPc, Math.max(ram, rT))}%"></i><i class="v" style="width:${pct(u.ramVm, Math.max(ram, rT))}%"></i>${rT > ram ? `<i class="x" style="width:${pct(rT - ram, rT)}%"></i>` : ''}</div>
        <div class="barlbl"><span>${plural(vmsOn(nd.id).length + (pcOn(nd.id) ? 1 : 0), 'VM')}</span><span>${fmt(ram - rT, 0)} GB free</span></div></div>`;
    });
    h += '</div>';
    const haOk = c.ramWork <= c.haRam;
    const cards = `<div class="cards">
      <div class="card obj" data-type="hardware" data-id="hw"><div class="lbl">Physical cores</div><div class="big">${c.coresTotal}</div><div class="lbl">${c.n} nodes x ${cores()}</div></div>
      <div class="card obj" data-type="hardware" data-id="hw"><div class="lbl">Physical memory</div><div class="big">${fmt(c.ramTotal / 1024, 2)} TB</div><div class="lbl">${fmt(c.ramTotal, 0)} GB</div></div>
      <div class="card obj" data-type="cvmcfg" data-id="cvm"><div class="lbl">CVM reservation</div><div class="big">${fmt(c.ramCvm, 0)} GB</div><div class="lbl">${lab.cvm.vcpu} vCPU / ${lab.cvm.ramGB} GB per node (example)</div></div>
      <div class="card"><div class="lbl">Workload allocation</div><div class="big">${c.vcpuWork} vCPU</div><div class="lbl">${fmt(c.ramWork, 0)} GB memory incl. Prism Central</div></div>
      <div class="card ${haOk ? 'ok' : 'bad'}"><div class="lbl">HA check (N+${ft()})</div><div class="big">${haOk ? 'Pass' : 'Fail'}</div><div class="lbl">${fmt(c.ramWork, 0)} GB needed, ${fmt(c.haRam, 0)} GB left after losing ${ft()} node${ft() > 1 ? 's' : ''}</div></div>
    </div>`;
    return head('Resources view', 'Compute and memory per host. Each host runs one CVM with reserved memory. User VM memory is not overcommitted in this model, so the HA check compares total workload memory against what remains after the largest tolerated failure. Hypervisor overhead is not modeled.') + h + cards;
  };

  VIEWS.vms = function () {
    let h = '<div class="hosts">';
    lab.nodes.forEach((nd) => {
      const down = fail.nodes.has(nd.id);
      h += `<div class="hostcard${down ? ' down' : ''}"><h4 data-type="node" data-id="${esc(nd.id)}">${esc(nd.name)} <small>${esc(nd.hostIp)}</small></h4>`;
      h += `<div class="vmchip cvm${isSel('cvm', nd.id) ? ' sel' : ''}" data-type="cvm" data-id="${esc(nd.id)}"><span>CVM</span><small>${lab.cvm.vcpu}v / ${lab.cvm.ramGB}G</small></div>`;
      if (pcOn(nd.id)) h += `<div class="vmchip pc${isSel('pc', 'pc') ? ' sel' : ''}" data-type="pc" data-id="pc"><span>${esc(lab.pc.name)} (Prism Central)</span><small>${lab.pc.vcpu}v / ${lab.pc.ramGB}G</small></div>`;
      vmsOn(nd.id).forEach((v) => {
        const nw = net(v.network);
        h += `<div class="vmchip${isSel('vm', v.id) ? ' sel' : ''}" data-type="vm" data-id="${esc(v.id)}"><span>${esc(v.name)} <small>${esc(nw ? nw.name : '')}</small></span><small>${v.vcpu}v / ${v.ramGB}G</small></div>`;
      });
      h += '</div>';
    });
    h += '</div>';
    let t = '<table class="grid"><thead><tr><th>VM</th><th>OS</th><th>vCPU</th><th>Memory</th><th>Disk</th><th>Network</th><th>Host</th></tr></thead><tbody>';
    lab.vms.forEach((v) => {
      const nd = node(v.host), nw = net(v.network);
      t += `<tr class="click${isSel('vm', v.id) ? ' sel' : ''}" data-type="vm" data-id="${esc(v.id)}"><td><b>${esc(v.name)}</b></td><td>${esc(v.os)}</td><td>${v.vcpu}</td><td>${v.ramGB} GB</td><td>${v.diskGB} GB</td><td>${esc(nw ? nw.name + ' (' + vlanText(nw) + ')' : 'none')}</td><td>${esc(nd ? nd.name : 'unassigned')}</td></tr>`;
    });
    t += '</tbody></table>';
    return head('VM view', 'Where each workload runs. Every host has its own CVM; Prism Central runs as a regular VM on the cluster. Click a VM to resize it, change its network or move it to another host.', '<button class="btn primary" data-act="addVm">Add VM</button>') + h + t;
  };

  VIEWS.management = function () {
    const W = 1100;
    let s = `<svg class="diagram" viewBox="0 0 ${W} 520">`;
    const sv = lab.services;
    const svcs = [
      { id: 'dns', label: 'DNS', val: sv.dns.join(', '), x: 40 },
      { id: 'ntp', label: 'NTP', val: sv.ntp.join(', '), x: 250 },
      { id: 'directory', label: 'Directory', val: sv.directory, x: 460 },
      { id: 'smtp', label: 'SMTP', val: sv.smtp, x: 670 },
      { id: 'syslog', label: 'Syslog', val: sv.syslog, x: 880 }
    ];
    const dirBoth = sv.directoryTarget === 'Prism Central and Prism Element';
    svcs.forEach((x) => {
      s += G('service', x.id, R(x.x, 20, 180, 56, 'svc') + T(x.x + 90, 42, x.label, 't-title', 'middle') + T(x.x + 90, 62, x.val.length > 24 ? x.val.slice(0, 23) + '...' : x.val, 't-mono t-muted', 'middle'));
      if (x.id === 'dns' || x.id === 'ntp') {
        s += C(x.x + 80, 76, 230 + (x.id === 'ntp' ? 40 : 0), 190, 'wire') + C(x.x + 100, 76, 740 + (x.id === 'ntp' ? 20 : 0), 190, 'wire');
      } else if (x.id === 'directory') {
        s += C(x.x + 110, 76, 800, 190, 'wire-a') + T(x.x + 190, 132, 'AD sign-in', 't-muted', 'middle');
        if (dirBoth) s += C(x.x + 70, 76, 330, 190, 'wire-a');
      } else {
        s += C(x.x + 90, 76, 860 + (x.id === 'syslog' ? 40 : 0), 190, 'wire');
      }
    });
    // PE
    const peLocal = lab.cluster.peAuth !== 'Directory users allowed';
    s += G('cluster', 'cluster', R(80, 190, 360, 190, 'host') + T(260, 212, 'Prism Element: ' + lab.cluster.name, 't-title', 'middle') +
      T(100, 236, 'Cluster virtual IP', 't-muted') + T(420, 236, lab.cluster.vip, 't-mono', 'end') +
      T(100, 256, 'Data services IP (iSCSI)', 't-muted') + T(420, 256, lab.cluster.dsip, 't-mono', 'end') +
      T(100, 276, 'Software', 't-muted') + T(420, 276, lab.cluster.aos, 't-mono', 'end') +
      T(100, 296, 'Redundancy factor', 't-muted') + T(420, 296, 'RF' + lab.cluster.rf + ' (FT' + ft() + ')', 't-mono', 'end') +
      T(100, 316, 'Sign-in', 't-muted') + T(420, 316, peLocal ? 'Local admin only' : 'Local + directory users', 't-mono', 'end'));
    lab.nodes.forEach((nd, i) => {
      s += G('cvm', nd.id, R(96 + i * (328 / lab.nodes.length), 330, 328 / lab.nodes.length - 6, 38, 'cvm' + (fail.cvms.has(nd.id) || fail.nodes.has(nd.id) ? ' down' : ''), 4) + T(96 + i * (328 / lab.nodes.length) + (328 / lab.nodes.length - 6) / 2, 353, 'CVM' + (i + 1), 't-small', 'middle'));
    });
    // PC
    if (!pcUp()) {
      s += `<g class="obj" data-act="deployPc">${R(640, 190, 380, 190, 'svc')}${T(830, 270, 'Prism Central not deployed', 't-title', 'middle')}${T(830, 292, 'Click to deploy it on this cluster', 't-muted', 'middle')}</g>`;
    } else s += G('pc', 'pc', R(640, 190, 380, 190, 'ipmi') + T(830, 212, 'Prism Central: ' + lab.pc.name, 't-title', 'middle') +
      T(660, 236, 'Deployment', 't-muted') + T(1000, 236, lab.pc.deployment + ', ' + lab.pc.size, 't-mono', 'end') +
      T(660, 256, 'IP / FQDN', 't-muted') + T(1000, 256, lab.pc.ip + ' / ' + lab.pc.fqdn, 't-mono', 'end') +
      T(660, 276, 'Runs on', 't-muted') + T(1000, 276, (node(lab.pc.host) || {}).name || 'unassigned', 't-mono', 'end') +
      T(660, 296, 'Size (example)', 't-muted') + T(1000, 296, lab.pc.vcpu + ' vCPU / ' + lab.pc.ramGB + ' GB', 't-mono', 'end') +
      T(660, 316, 'Directory sign-in', 't-muted') + T(1000, 316, 'Active Directory', 't-mono', 'end') +
      T(660, 346, 'Multicluster management, LCM, reporting,', 't-muted') + T(660, 362, 'categories, policies and add-on services', 't-muted'));
    s += L(440, 285, 640, 285, 'wire-a') + T(540, 276, 'registered', 't-muted', 'middle') + T(540, 302, 'TCP 9440', 't-mono t-muted', 'middle');
    // internet side
    s += G('service', 'lcmSource', R(640, 430, 180, 56, 'svc') + T(730, 452, 'LCM updates', 't-title', 'middle') + T(730, 472, sv.lcmSource.length > 28 ? sv.lcmSource.slice(0, 27) + '...' : sv.lcmSource, 't-muted', 'middle'));
    s += G('service', 'proxy', R(840, 430, 180, 56, 'svc') + T(930, 452, 'HTTP proxy', 't-title', 'middle') + T(930, 472, sv.proxy, 't-muted', 'middle'));
    s += C(830, 380, 730, 430, 'wire') + C(830, 380, 930, 430, 'wire');
    s += G('netcfg', 'ipmi', R(80, 430, 360, 56, 'ipmi') + T(260, 452, 'Out-of-band: IPMI on VLAN ' + lab.network.ipmiVlan, 't-title', 'middle') + T(260, 472, 'BMC consoles used by Foundation and for recovery', 't-muted', 'middle'));
    s += L(260, 380, 260, 430, 'wire-ipmi');
    s += '</svg>';
    return head('Management view', `Prism Element runs inside the cluster on the CVMs and manages one cluster. Prism Central is a separate VM that registers one or more clusters for central management. ${dirBoth ? 'Active Directory is connected to both Prism Central and Prism Element.' : 'Active Directory is connected only to Prism Central, so directory users sign in there and Prism Element keeps only its local admin account.'} Both depend on DNS and NTP being correct before cluster creation; click a service to edit it.`) + s;
  };

  const CONCEPTS = [
    ['Hyperconverged infrastructure (HCI)', 'Every node contributes compute, memory and storage. Capacity and performance grow by adding nodes, with no separate SAN or storage array.'],
    ['AHV', 'The Nutanix hypervisor, based on KVM and included with AOS. Each node runs AHV with one Controller VM.'],
    ['Controller VM (CVM)', 'Runs the AOS storage and cluster services on every node. It owns the local data drives and serves storage I/O for the VMs on its host. If a CVM is down, I/O is redirected to CVMs on other hosts.'],
    ['Distributed Storage Fabric', 'Pools the drives of all nodes into one storage pool. Storage containers are carved from the pool, and new writes stay on the local node when possible (data locality).'],
    ['Replication factor (RF)', 'RF2 keeps two copies of data and tolerates one node failure. RF3 keeps three copies, tolerates two failures and needs at least five nodes.'],
    ['Stargate and Curator', 'Stargate is the CVM service that handles data I/O. Curator runs background work such as re-protecting data after a failure and cleaning up space.'],
    ['Prism Element', 'The management interface of one cluster. It runs on the CVMs and is reached through the cluster virtual IP.'],
    ['Prism Central', 'A separate VM (or three for scale-out) that manages many clusters from one place and runs add-on services.'],
    ['Foundation', 'The imaging tool that installs AHV and AOS on new nodes and creates the cluster. It uses the IPMI network to reach the nodes.'],
    ['Life Cycle Manager (LCM)', 'Inventories and updates software and firmware across the cluster, one node at a time, from the Internet or a local dark site.']
  ];
  VIEWS.concepts = function () {
    return head('Nutanix concepts', 'The building ideas behind the lab. Each concept maps to something you can click in the other views.') +
      '<div class="cards">' + CONCEPTS.map((c) => `<div class="card"><div><b>${esc(c[0])}</b></div><div class="lbl" style="margin-top:4px;font-size:13px">${esc(c[1])}</div></div>`).join('') + '</div>';
  };
  const ADDONS = {
    fvn: ['Flow Virtual Networking', 'Network virtualization for AHV: VPCs, overlay subnets and external networks managed from Prism Central.'],
    fns: ['Flow Network Security', 'Microsegmentation for AHV VMs, with security policies built from Prism Central categories.'],
    files: ['Nutanix Files', 'SMB and NFS file services delivered by file server VMs on the cluster.'],
    objects: ['Nutanix Objects', 'S3-compatible object storage running on the cluster.'],
    ndb: ['Nutanix Database Service', 'Database provisioning, cloning and lifecycle management.'],
    nkp: ['Nutanix Kubernetes Platform', 'Kubernetes cluster deployment and management.'],
    dr: ['Disaster recovery', 'Protection policies and recovery plans that replicate VMs to another cluster.']
  };

  VIEWS.failure = function () {
    const nodesBox = lab.nodes.map((n) => `<label><input type="checkbox" data-fail="node" value="${esc(n.id)}"${fail.nodes.has(n.id) ? ' checked' : ''}>${esc(n.name)}</label>`).join('');
    const cvmBox = lab.nodes.map((n) => `<label><input type="checkbox" data-fail="cvm" value="${esc(n.id)}"${fail.cvms.has(n.id) ? ' checked' : ''}>CVM ${esc(n.name.replace(/^.*-/, ''))}</label>`).join('');
    const torBox = lab.switches.slice(0, 2).map((s) => `<label><input type="checkbox" data-fail="tor" value="${s.id}"${fail.tors.has(s.id) ? ' checked' : ''}>${esc(s.name)}</label>`).join('');
    let diskSel = '<select data-fail="disk"><option value="">None</option>';
    lab.nodes.forEach((n) => { for (let d = 0; d < Math.min(lab.hardware.diskCount, 12); d++) { const v = n.id + ':' + d; diskSel += `<option value="${v}"${fail.disk === v ? ' selected' : ''}>${esc(n.name)} drive ${d + 1}</option>`; } });
    diskSel += '</select>';

    const controls = `<div class="controls">
      <div class="ctlbox"><h4>Node failure (host down)</h4>${nodesBox}</div>
      <div class="ctlbox"><h4>CVM failure (host stays up)</h4>${cvmBox}</div>
      <div class="ctlbox"><h4>Switch failure</h4>${torBox}</div>
      <div class="ctlbox"><h4>Drive failure</h4>${diskSel}</div>
    </div>`;

    // mini diagram
    const n = lab.nodes.length, cw = 130, gap = 12, W = Math.max(820, n * (cw + gap) + 40);
    let s = `<svg class="diagram" viewBox="0 0 ${W} 200">`;
    const sx = [W * 0.3 - 70, W * 0.62 - 70];
    lab.switches.slice(0, 2).forEach((sw, i) => { s += G('switch', sw.id, R(sx[i], 10, 140, 40, 'sw' + (fail.tors.has(sw.id) ? ' down' : '')) + T(sx[i] + 70, 35, sw.name, 't-title', 'middle')); });
    lab.nodes.forEach((nd, i) => {
      const x = 20 + i * (cw + gap);
      const dn = fail.nodes.has(nd.id);
      const ca = { tx: sx[0] + 20 + i * (100 / Math.max(1, n)), bx: x + 40 }, cb = { tx: sx[1] + 20 + i * (100 / Math.max(1, n)), bx: x + cw - 40 };
      const la = laneOrder(lab.nodes.map((q, j) => ({ tx: sx[0] + 20 + j * (100 / Math.max(1, n)), bx: 20 + j * (cw + gap) + 40 })))[i];
      const lb = laneOrder(lab.nodes.map((q, j) => ({ tx: sx[1] + 20 + j * (100 / Math.max(1, n)), bx: 20 + j * (cw + gap) + cw - 40 })))[i];
      s += `<path d="M${ca.tx} 50 V${60 + la * 4} H${ca.bx} V110" class="${fail.tors.has('torA') || dn ? 'wire-down' : 'wire-a'}"/>`;
      s += `<path d="M${cb.tx} 50 V${60 + (n + lb) * 4} H${cb.bx} V110" class="${fail.tors.has('torB') || dn ? 'wire-down' : 'wire-b'}"/>`;
      s += G('node', nd.id, R(x, 110, cw, 76, 'host' + (dn ? ' down' : '')) + T(x + cw / 2, 130, nd.name, 't-title', 'middle') + R(x + 10, 140, cw - 20, 22, 'cvm' + (dn || fail.cvms.has(nd.id) ? ' down' : ''), 4) + T(x + cw / 2, 155, 'CVM', 't-small', 'middle') + T(x + cw / 2, 180, dn ? 'DOWN' : plural(vmsOn(nd.id).length + (pcOn(nd.id) ? 1 : 0), 'VM'), dn ? 't-small' : 't-muted', 'middle'));
    });
    s += '</svg>';

    return head('Failure scenarios', `Pick failures to see how a ${lab.nodes.length}-node RF${lab.cluster.rf} cluster responds. The cluster tolerates ${ft()} simultaneous node or CVM failure${ft() > 1 ? 's' : ''} (fault tolerance ${ft()}). These outcomes are simplified for learning.`, '<button class="btn" data-act="clearFail">Clear failures</button>') + controls + s + '<ul class="results">' + failureResults() + '</ul>';
  };

  function failureResults() {
    const out = [];
    const add = (lvl, title, text) => out.push(`<li class="${lvl}"><b>${esc(title)}</b>${text}</li>`);
    const nodesDown = [...fail.nodes];
    const cvmOnly = [...fail.cvms].filter((id) => !fail.nodes.has(id));
    const domains = new Set([...nodesDown, ...cvmOnly]);
    const tol = ft();
    const names = (ids) => ids.map((id) => (node(id) || {}).name).join(', ');

    if (!lab.nodes.length) { add('', 'No nodes yet', 'Add nodes to the lab to simulate failures.'); return out.join(''); }
    if (!domains.size && !fail.tors.size && !fail.disk) {
      add('', 'Healthy', `All ${lab.nodes.length} nodes, CVMs and both ToR switches are up. Data is protected at RF${lab.cluster.rf}.`);
      return out.join('');
    }

    if (domains.size > tol) {
      add('bad', `Exceeds fault tolerance (${domains.size} of ${tol})`, `With RF${lab.cluster.rf} the cluster keeps ${lab.cluster.rf} copies of data and tolerates ${tol} simultaneous failure${tol > 1 ? 's' : ''}. With ${names([...domains])} unavailable at the same time, some data can have every copy on unavailable nodes. Expect the storage to stop serving that data, and the cluster may go offline until enough nodes return. Failures that happen one at a time, after rebuilds finish, are a different case.`);
    } else if (domains.size) {
      add('warn', 'Within fault tolerance', `The cluster stays online. Curator starts re-protecting data whose copy lived on ${names([...domains])}, using the surviving replicas and free space on the other nodes. Data stays available during the rebuild.`);
    }

    if (nodesDown.length) {
      const needRam = nodesDown.reduce((a, id) => { const u = hostUse(id); return a + u.ramVm + u.ramPc; }, 0);
      const freeRam = lab.nodes.filter((n) => !fail.nodes.has(n.id)).reduce((a, n) => { const u = hostUse(n.id); return a + (lab.hardware.ramGB - u.ramCvm - u.ramPc - u.ramVm); }, 0);
      const vmCount = nodesDown.reduce((a, id) => a + vmsOn(id).length + (pcOn(id) ? 1 : 0), 0);
      const fits = needRam <= freeRam;
      add(fits ? 'warn' : 'bad', `VM HA restart: ${vmCount} VM${vmCount === 1 ? '' : 's'} affected`, `VMs on ${names(nodesDown)} power off with the host and AHV HA restarts them on surviving hosts. They need ${fmt(needRam, 0)} GB and the surviving hosts have ${fmt(freeRam, 0)} GB free. ${fits ? 'There is enough memory for all of them.' : 'There is not enough memory; some VMs will not restart unless HA memory is reserved or workloads are reduced.'}`);
      if (pcOn(nodesDown[0]) || nodesDown.some((id) => pcOn(id))) add('warn', 'Prism Central restarts', 'Prism Central was on a failed host. It is unavailable until HA restarts it; Prism Element on the cluster VIP stays reachable.');
    }

    if (cvmOnly.length) {
      add('warn', 'CVM down, host up', `VMs on ${names(cvmOnly)} keep running. Their storage I/O is redirected to CVMs on other hosts until the local CVM returns, so expect somewhat higher latency on those hosts. No VM restart is needed.`);
    }
    if (fail.nodes.size && [...fail.cvms].some((id) => fail.nodes.has(id))) {
      add('', 'Note', 'A CVM on a failed node is already counted with that node.');
    }

    if (fail.tors.size === 1) {
      const sw = lab.switches.find((s) => fail.tors.has(s.id));
      const bw = (mode, bond) => `${bond} (${esc(mode)}): traffic moves to the uplink on the other switch. ${mode === 'active-backup' ? 'Bandwidth does not change, because active-backup only uses one uplink at a time.' : 'It runs on half of its bandwidth until the switch returns.'}`;
      add('warn', `${sw.name} down`, `Each bond on every host loses one uplink. Expect a short interruption during failover. ${bw(lab.network.bondMode, 'br0-up')}${lab.network.layout === '2x2' ? ' ' + bw(lab.network.vmBondMode, 'br1-up') : ''}`);
    } else if (fail.tors.size === 2) {
      add('bad', 'Both ToR switches down', 'Every host loses its data uplinks. CVMs cannot reach each other, so the cluster cannot serve storage and VMs lose network access. This is a full outage until at least one switch returns.');
    }

    if (fail.disk) {
      const [id, d] = fail.disk.split(':');
      add('warn', 'Drive failure', `${esc((node(id) || {}).name)} drive ${Number(d) + 1} is marked failed. The cluster re-creates the affected copies from replicas on other nodes. VMs keep running; plan a drive replacement.`);
    }
    return out.join('');
  }

  /* ---------- editor ---------- */
  const F = (key, label, opt = {}) => Object.assign({ key, label }, opt);
  const nodeOpts = () => lab.nodes.map((n) => [n.id, n.name]);
  const netOpts = () => [['', 'none']].concat(lab.network.vmNetworks.map((n) => [n.id, `${n.name} (${vlanText(n)})`]));

  const BONDS = [['active-backup', 'active-backup'], ['balance-slb', 'balance-slb'], ['balance-tcp', 'balance-tcp (LACP)']];
  function editorFor(type, id) {
    switch (type) {
      case 'node': {
        const n = node(id); if (!n) return null;
        return { kind: 'Node', title: n.name, obj: n, fields: [F('name', 'Host name'), F('serial', 'Serial number'), F('hostIp', 'AHV host IP'), F('cvmIp', 'CVM IP'), F('ipmiIp', 'IPMI IP'), F('torAPort', lab.network.layout === '2x2' ? 'TOR-A port (vs0)' : 'TOR-A port'), F('torBPort', lab.network.layout === '2x2' ? 'TOR-B port (vs0)' : 'TOR-B port')].concat(lab.network.layout === '2x2' ? [F('torAPort2', 'TOR-A port (vs1)'), F('torBPort2', 'TOR-B port (vs1)')] : []).concat([F('oobPort', 'OOB switch port')]),
          note: `Hardware for all nodes is set in the hardware profile (homogeneous cluster).`, extra: hostSummary(id),
          del: () => removeNode(id), delLabel: 'Remove node' };
      }
      case 'switch': {
        const s = lab.switches.find((x) => x.id === id);
        return { kind: 'Switch', title: s.name, obj: s, fields: [F('name', 'Name'), F('role', 'Role'), F('model', 'Model'), F('mgmtIp', 'Management IP')],
          note: s.id === 'oob' ? 'Carries the BMC (IPMI) links. Foundation uses IPMI to image nodes.' : 'Both ToR switches should be configured as a pair (MLAG, vPC or similar) with the same VLANs trunked to every host port.' };
      }
      case 'hardware':
        return { kind: 'Hardware profile', title: lab.hardware.model, obj: lab.hardware, fields: [F('model', 'Model'), F('sockets', 'CPU sockets', { num: 1 }), F('coresPerSocket', 'Cores per socket', { num: 1 }), F('ramGB', 'Memory per node (GB)', { num: 1 }), F('diskType', 'Drive type', { opts: [['NVMe', 'NVMe'], ['SSD', 'SSD'], ['SSD + HDD', 'SSD + HDD (hybrid)']] }), F('diskCount', 'Data drives per node', { num: 1 }), F('diskSizeTB', 'Drive size (TB)', { num: 1 }), F('bootDevice', 'Boot device'), F('dataNics', 'Data NICs'), F('bmc', 'BMC')],
          note: 'Generic example values. Applies to every node.' };
      case 'cvm':
      case 'cvmcfg':
        return { kind: 'Controller VM', title: type === 'cvm' ? 'CVM on ' + (node(id) || {}).name : 'CVM sizing', obj: lab.cvm, fields: [F('vcpu', 'vCPU per CVM', { num: 1 }), F('ramGB', 'Memory per CVM (GB)', { num: 1 })],
          note: 'One CVM runs on every node and serves storage for that host. Sizing here is an example; actual CVM sizing depends on the AOS release, node memory and enabled features.',
          extra: type === 'cvm' ? kv([['CVM IP (eth0)', (node(id) || {}).cvmIp], ['Internal (eth1)', '192.168.5.2'], ['Host side (virbr0)', '192.168.5.1']]) : '' };
      case 'cluster':
        return { kind: 'Cluster', title: lab.cluster.name, obj: lab.cluster, fields: [F('name', 'Cluster name'), F('aos', 'AOS version'), F('hypervisor', 'Hypervisor', { ro: true }), F('rf', 'Redundancy factor', { opts: [[2, 'RF2 (tolerates 1 failure)'], [3, 'RF3 (tolerates 2, needs 5+ nodes)']], num: 1 }), F('vip', 'Cluster virtual IP'), F('dsip', 'Data services IP'), F('timezone', 'Time zone'), F('peAuth', 'Prism Element sign-in', { opts: [['Local admin only', 'Local admin only (directory on Prism Central)'], ['Directory users allowed', 'Directory users allowed on Prism Element']] })],
          note: 'Renaming the cluster also renames the storage pool, user container and management subnet when they start with the old cluster name.' };
      case 'pc':
        return { kind: 'Prism Central', title: lab.pc.name, obj: lab.pc, fields: [F('name', 'VM name'), F('deployment', 'Deployment', { opts: [['Single VM', 'Single VM'], ['Scale-out (3 VMs)', 'Scale-out (3 VMs)']] }), F('size', 'Size', { opts: [['Small', 'Small'], ['Large', 'Large'], ['X-Large', 'X-Large']] }), F('vcpu', 'vCPU', { num: 1 }), F('ramGB', 'Memory (GB)', { num: 1 }), F('ip', 'IP address'), F('fqdn', 'FQDN'), F('host', 'Runs on host', { opts: nodeOpts() })],
          note: 'vCPU and memory are example values. Check the Prism Central sizing table for your pc release before deploying.',
          del: () => { lab.pc.deployed = false; }, delLabel: 'Remove Prism Central' };
      case 'vm': {
        const v = lab.vms.find((x) => x.id === id); if (!v) return null;
        return { kind: 'Virtual machine', title: v.name, obj: v, fields: [F('name', 'Name'), F('os', 'Guest OS'), F('vcpu', 'vCPU', { num: 1 }), F('ramGB', 'Memory (GB)', { num: 1 }), F('diskGB', 'Disk (GB)', { num: 1 }), F('network', 'Network', { opts: netOpts() }), F('host', 'Host', { opts: nodeOpts() })],
          del: () => { lab.vms = lab.vms.filter((x) => x.id !== id); }, delLabel: 'Delete VM' };
      }
      case 'vmsof': {
        const n = node(id);
        return { kind: 'Workloads', title: 'User VMs on ' + n.name, obj: null, fields: [], extra: hostSummary(id) + '<p class="muted">Open the VMs view to move or resize VMs.</p>' };
      }
      case 'vmnet': {
        const v = net(id); if (!v) return null;
        if (v.mgmt) {
          return { kind: 'VM network (management VLAN)', title: v.name, obj: v, fields: [F('name', 'Name'), F('subnet', 'Subnet'), F('gateway', 'Gateway')],
            note: `Default subnet on the same VLAN as the AHV hosts and CVMs, named after the cluster so it is easy to identify in Prism Central. The management VLAN is ${lab.network.mgmtTagging === 'Tagged' ? 'tagged, so this subnet uses VLAN ' + lab.network.mgmtVlan : 'native (untagged) on the switch, so this subnet uses VLAN ID 0 in AHV'}.`,
            extra: kv([['VLAN in AHV', vlanText(v)], ['Virtual switch', 'vs0']]),
            del: () => { lab.network.vmNetworks = lab.network.vmNetworks.filter((x) => x.id !== id); lab.vms.forEach((x) => { if (x.network === id) x.network = ''; }); }, delLabel: 'Delete subnet' };
        }
        return { kind: 'VM network', title: v.name, obj: v, fields: [F('name', 'Name'), F('vlan', 'VLAN ID', { num: 1 }), F('subnet', 'Subnet'), F('gateway', 'Gateway')].concat(lab.network.layout === '2x2' ? [F('vs', 'Virtual switch', { opts: [['vs0', 'vs0 (br0, with management)'], ['vs1', 'vs1 (br1, VM traffic)']] })] : []),
          note: 'VM networks are VLAN-backed subnets on a virtual switch. The VLAN must be trunked on the ToR ports of that virtual switch for every host.',
          del: () => { lab.network.vmNetworks = lab.network.vmNetworks.filter((x) => x.id !== id); lab.vms.forEach((x) => { if (x.network === id) x.network = ''; }); }, delLabel: 'Delete network' };
      }
      case 'netcfg': {
        const map = {
          mgmt: { kind: 'Management network', fields: [F('mgmtVlan', 'VLAN ID', { num: 1 }), F('mgmtTagging', 'Tagging', { opts: [['Native (untagged)', 'Native (untagged)'], ['Tagged', 'Tagged']] }), F('mgmtSubnet', 'Subnet'), F('mgmtGateway', 'Gateway')], note: 'AHV hosts, CVMs, the cluster VIP, the data services IP and Prism Central share this network in the sample.' },
          ipmi: { kind: 'IPMI network', fields: [F('ipmiVlan', 'VLAN ID', { num: 1 }), F('ipmiSubnet', 'Subnet'), F('ipmiGateway', 'Gateway')], note: 'BMC interfaces, used by Foundation for imaging and for remote console.' },
          bond: { kind: 'Uplink bond', fields: [F('bondMode', 'Bond mode', { opts: [['active-backup', 'active-backup'], ['balance-slb', 'balance-slb'], ['balance-tcp', 'balance-tcp (LACP)']] }), F('mtu', 'MTU', { num: 1 })], note: 'active-backup uses one uplink at a time and needs no special switch configuration. balance-tcp requires LACP on the switch side.' },
          vs: { kind: 'Virtual switch', fields: [F('layout', 'Uplink layout', { opts: [['1x2', '2 uplinks, one bond (vs0)'], ['2x2', '4 uplinks, two bonds (vs0 + vs1)']] }), F('virtualSwitch', 'Virtual switch'), F('bondMode', 'Bond mode', { opts: BONDS }), F('mtu', 'MTU', { num: 1 })], note: 'The default virtual switch vs0 maps to bridge br0 on every host and carries the AHV host and CVM traffic.' },
          bond1: { kind: 'VM uplink bond', fields: [F('vmBondMode', 'Bond mode', { opts: BONDS })], note: 'br1-up carries only user VM traffic in the 2x2 layout.' },
          vs1: { kind: 'VM virtual switch', fields: [F('vmSwitch', 'Virtual switch'), F('vmBondMode', 'Bond mode', { opts: BONDS })], note: 'A second virtual switch for user VM VLANs. Keeping VM traffic off vs0 isolates it from CVM replication traffic.' }
        }[id];
        return { kind: map.kind, title: map.kind, obj: lab.network, fields: map.fields, note: map.note };
      }
      case 'container': {
        const c = lab.storage.containers.find((x) => x.id === id); if (!c) return null;
        return { kind: 'Storage container', title: c.name, obj: c, fields: [F('name', 'Name', { ro: c.system }), F('rf', 'Replication factor', { opts: [[2, 'RF2'], [3, 'RF3']], num: 1 }), F('compression', 'Inline compression', { bool: 1 }), F('dedup', 'Deduplication', { bool: 1 }), F('ecx', 'Erasure coding (EC-X)', { bool: 1 })],
          note: c.system ? 'Created by the system. Keep it, but you can review its settings.' : 'A container RF cannot be higher than the cluster redundancy factor allows.',
          del: c.system ? null : () => { lab.storage.containers = lab.storage.containers.filter((x) => x.id !== id); }, delLabel: 'Delete container' };
      }
      case 'pool':
        return { kind: 'Storage pool', title: lab.storage.poolName, obj: lab.storage, fields: [F('poolName', 'Storage pool name'), F('defaultContainerRemoved', 'Default container deleted after cluster creation', { bool: 1 }), F('planningOverheadPct', 'Planning overhead (%)', { num: 1 })],
          note: 'A cluster has one storage pool. Renaming it after the cluster makes it easy to identify when many clusters are registered to Prism Central. Overhead is your own planning assumption for system space, metadata and headroom, not a Nutanix published figure.' };
      case 'service': {
        const labels = { dns: 'DNS servers (comma separated)', ntp: 'NTP servers (comma separated)', directory: 'Directory service', smtp: 'SMTP relay', syslog: 'Syslog target', lcmSource: 'LCM source', proxy: 'HTTP proxy' };
        const isList = id === 'dns' || id === 'ntp';
        const extraF = id === 'directory' ? [F('directoryTarget', 'Connected to', { opts: [['Prism Central only', 'Prism Central only'], ['Prism Central and Prism Element', 'Prism Central and Prism Element']] })] : [];
        return { kind: 'Infrastructure service', title: labels[id].replace(/ \(.*\)/, ''), obj: lab.services, fields: [F(id, labels[id], isList ? { list: 1 } : (id === 'lcmSource' ? { opts: [['Internet (Nutanix portal)', 'Internet (Nutanix portal)'], ['Dark site (local web server)', 'Dark site (local web server)']] } : {}))].concat(extraF),
          note: id === 'ntp' ? 'Use reliable NTP sources reachable from the CVMs. Time drift between CVMs causes cluster issues.' : (id === 'dns' ? 'CVMs and Prism Central need working forward and reverse DNS.' : (id === 'directory' ? 'Directory users sign in through Prism Central. Prism Element keeps only its local admin account, so access to each cluster is managed in one place.' : '')) };
      }
    }
    return null;
  }

  function kv(rows) { return '<div class="kv">' + rows.map((r) => `<span>${esc(r[0])}</span><span>${esc(r[1])}</span>`).join('') + '</div>'; }
  function hostSummary(id) {
    const u = hostUse(id);
    return kv([['VMs on host', vmsOn(id).length + (pcOn(id) ? 1 : 0)], ['vCPU allocated', u.vcpuCvm + u.vcpuPc + u.vcpuVm + ' of ' + cores() + ' cores'], ['Memory allocated', u.ramCvm + u.ramPc + u.ramVm + ' of ' + lab.hardware.ramGB + ' GB'], ['Raw storage', fmt(nodeRawTB()) + ' TB']]);
  }

  function openEditor(type, id) {
    const ed = editorFor(type, id);
    if (!ed) return;
    sel = { type, id };
    let h = `<div class="kind">${esc(ed.kind)}</div><h3>${esc(ed.title)}</h3>`;
    if (ed.note) h += `<div class="note">${esc(ed.note)}</div>`;
    ed.fields.forEach((f, i) => {
      const v = ed.obj[f.key];
      const fid = 'f' + i;
      if (f.bool) {
        h += `<div class="field check"><input type="checkbox" id="${fid}" data-k="${f.key}"${v ? ' checked' : ''}><label for="${fid}">${esc(f.label)}</label></div>`;
      } else if (f.opts) {
        h += `<div class="field"><label for="${fid}">${esc(f.label)}</label><select id="${fid}" data-k="${f.key}"${f.num ? ' data-num="1"' : ''}>${f.opts.map((o) => `<option value="${esc(o[0])}"${String(o[0]) === String(v) ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></div>`;
      } else {
        const val = f.list ? (v || []).join(', ') : v;
        h += `<div class="field"><label for="${fid}">${esc(f.label)}</label><input id="${fid}" data-k="${f.key}" value="${esc(val)}"${f.num ? ' type="number" min="0" step="any" data-num="1"' : ''}${f.list ? ' data-list="1"' : ''}${f.ro ? ' readonly' : ''}></div>`;
      }
    });
    if (ed.extra) h += ed.extra;
    h += '<div class="panel-actions">';
    if (ed.del) h += `<button class="btn danger" id="btnDel">${esc(ed.delLabel || 'Delete')}</button>`;
    h += '<button class="btn" id="btnClose">Close</button></div>';
    const panel = $('#panel');
    panel.innerHTML = h;
    panel.oninput = panel.onchange = (e) => {
      const el = e.target; const k = el.dataset.k; if (!k || !ed.obj) return;
      let val = el.type === 'checkbox' ? el.checked : el.value;
      if (el.dataset.num) { val = Number(val); if (!isFinite(val)) return; }
      if (el.dataset.list) val = String(val).split(',').map((x) => x.trim()).filter(Boolean);
      if (type === 'cluster' && k === 'rf' && val === 3 && lab.nodes.length < 5) { toast('RF3 needs at least 5 nodes'); el.value = String(ed.obj.rf); return; }
      const oldVal = ed.obj[k];
      ed.obj[k] = val;
      if (type === 'cluster' && k === 'name' && oldVal && val) renameFromCluster(String(oldVal), String(val));
      normalize(lab);
      save(); render(false);
      if (k === 'layout') { openEditor(type, id); return; }
      if (k === 'name') { const t = panel.querySelector('h3'); if (t) t.textContent = val; }
    };
    const del = $('#btnDel');
    if (del) del.onclick = () => { ed.del(); sel = null; save(); render(false); backToList(); };
    $('#btnClose').onclick = () => { sel = null; render(false); backToList(); };
    render(false);
  }
  function renameFromCluster(oldN, newN) {
    const fix = (s) => (typeof s === 'string' && s.indexOf(oldN) === 0 ? newN + s.slice(oldN.length) : s);
    lab.storage.poolName = fix(lab.storage.poolName);
    lab.storage.containers.forEach((c) => { if (!c.system) c.name = fix(c.name); });
    lab.network.vmNetworks.forEach((v) => { v.name = fix(v.name); });
  }
  function backToList() { if (lastList) openList(lastList); else clearPanel(); }
  function clearPanel() {
    $('#panel').innerHTML = '<div class="panel-empty"><h3>Details</h3><p>Select a node, switch, VM, network, container or service in the diagram to see its settings here. Changes are saved in this browser automatically.</p></div>';
  }

  /* ---------- mutations ---------- */
  function nextId(prefix, list) { let i = list.length + 1; while (list.some((x) => x.id === prefix + i)) i++; return prefix + i; }
  function bumpIp(ipStr, by) { const p = String(ipStr).split('.').map(Number); if (p.length !== 4 || p.some(isNaN)) return ''; p[3] = Math.min(254, p[3] + by); return p.join('.'); }
  function addNode() {
    if (lab.nodes.length >= 16) { toast('This lab supports up to 16 nodes'); return; }
    const last = lab.nodes[lab.nodes.length - 1] || { hostIp: '10.10.10.10', cvmIp: '10.10.10.30', ipmiIp: '10.10.11.10' };
    const id = nextId('n', lab.nodes);
    const num = lab.nodes.length + 1;
    lab.nodes.push({ id, name: 'NTX-N' + num, serial: 'EXAMPLE-SN-' + String(num).padStart(2, '0'), hostIp: bumpIp(last.hostIp, 1), cvmIp: bumpIp(last.cvmIp, 1), ipmiIp: bumpIp(last.ipmiIp, 1), torAPort: 'Eth1/' + num, torBPort: 'Eth1/' + num, oobPort: 'Gi1/0/' + num });
    normalize(lab);
    if (lab.nodes.length === 1 && !lab.pc.host) lab.pc.host = id;
    if (lab.nodes.length === 3 && !lab.storage.containers.length) { lab.storage.containers.push({ id: 'ctr-mgmt', name: 'NutanixManagementShare', system: true, rf: 2, compression: true, dedup: false, ecx: false }, { id: 'ctr-user', name: lab.cluster.name + '-CTR', system: false, rf: 2, compression: true, dedup: false, ecx: false }); toast('Cluster created: system container and ' + lab.cluster.name + '-CTR added'); }
    save(); render(); openEditor('node', id);
  }
  function removeNode(id) {
    const target = lab.nodes.find((n) => n.id !== id) || { id: '' };
    lab.nodes = lab.nodes.filter((n) => n.id !== id);
    lab.vms.forEach((v) => { if (v.host === id) v.host = target.id; });
    if (lab.pc.host === id) lab.pc.host = target.id;
    if (!lab.nodes.length) lab.pc.deployed = false;
    if (Number(lab.cluster.rf) === 3 && lab.nodes.length < 5) lab.cluster.rf = 2;
    fail.nodes.delete(id); fail.cvms.delete(id);
  }
  function addVm() {
    if (!lab.nodes.length) { toast('Add nodes before creating VMs'); return; }
    const id = 'vm-' + Date.now().toString(36);
    const load = lab.nodes.map((n) => ({ id: n.id, ram: hostUse(n.id).ramVm + hostUse(n.id).ramPc })).sort((a, b) => a.ram - b.ram);
    lab.vms.push({ id, name: 'NEW-VM-' + (lab.vms.length + 1), vcpu: 2, ramGB: 8, diskGB: 100, network: (lab.network.vmNetworks[0] || {}).id || '', host: load[0].id, os: 'Linux' });
    save(); render(); openEditor('vm', id);
  }
  function addNet() {
    const id = 'net-' + Date.now().toString(36);
    const vlan = Math.max(99, ...lab.network.vmNetworks.map((n) => Number(n.vlan) || 0)) + 10;
    lab.network.vmNetworks.push({ id, name: 'VM-Net-' + vlan, vlan, subnet: `10.10.${vlan % 255}.0/24`, gateway: `10.10.${vlan % 255}.1`, vs: lab.network.layout === '2x2' ? 'vs1' : 'vs0' });
    save(); render(); openEditor('vmnet', id);
  }
  function deployPc() {
    if (lab.nodes.length < 3) { toast('Create a cluster of at least 3 nodes first'); return; }
    lab.pc.deployed = true; if (!node(lab.pc.host)) lab.pc.host = lab.nodes[0].id;
    save(); render(); openEditor('pc', 'pc');
  }
  function addMgmtSubnet() {
    if (lab.network.vmNetworks.some((v) => v.mgmt)) { toast('A management VLAN subnet already exists'); return; }
    lab.network.vmNetworks.unshift({ id: 'net-mgmt', name: lab.cluster.name + '-Mgmt', mgmt: true, subnet: lab.network.mgmtSubnet, gateway: lab.network.mgmtGateway, vs: 'vs0' });
    save(); render(); openEditor('vmnet', 'net-mgmt');
  }
  function addCtr() {
    const id = 'ctr-' + Date.now().toString(36);
    lab.storage.containers.push({ id, name: 'Container-' + (lab.storage.containers.length + 1), system: false, rf: Number(lab.cluster.rf), compression: true, dedup: false, ecx: false });
    save(); render(); openEditor('container', id);
  }

  /* ---------- sidebar ---------- */
  let menuSel = 'nodes';
  let lastList = null;
  function menu() {
    const two = lab.network.layout === '2x2';
    return [
      { g: 'Start from', items: [{ id: 'empty', label: 'Empty lab', sub: 'Build a cluster from scratch', start: 1, act: 'empty' }] },
      { g: 'Completed examples', items: Object.keys(window.NBL_PRESETS).map((k) => ({ id: 'preset-' + k, icon: '▸', label: window.NBL_PRESETS[k].short || window.NBL_PRESETS[k].label, act: 'preset:' + k })) },
      { g: 'Learn', items: [{ id: 'concepts', icon: '?', label: 'Nutanix concepts', view: 'concepts' }] },
      { g: 'Physical', items: [
        { id: 'nodes', icon: '▤', label: 'Nodes', view: 'physical', list: 'nodes', count: lab.nodes.length },
        { id: 'switches', icon: '⇄', label: 'Switches and cabling', view: 'physical', list: 'switches', count: lab.switches.length }] },
      { g: 'Cluster', items: [
        { id: 'cluster', icon: '◎', label: 'Cluster', view: 'management', edit: ['cluster', 'cluster'], count: lab.nodes.length >= 3 ? 1 : 0 },
        { id: 'resources', icon: '▦', label: 'Compute and memory', view: 'resources' }] },
      { g: 'Storage', items: [
        { id: 'pool', icon: '▭', label: 'Storage pool', view: 'storage', edit: ['pool', 'pool'], count: lab.nodes.length ? 1 : 0 },
        { id: 'containers', icon: '▣', label: 'Storage containers', view: 'storage', list: 'containers', count: lab.storage.containers.length }] },
      { g: 'Networking', items: [
        { id: 'vswitches', icon: '⌥', label: 'Virtual switches', view: 'network', list: 'vswitches', count: lab.nodes.length ? (two ? 2 : 1) : 0 },
        { id: 'subnets', icon: '≡', label: 'Subnets', view: 'network', list: 'subnets', count: lab.network.vmNetworks.length }] },
      { g: 'Management', items: [
        { id: 'pc', icon: '◈', label: 'Prism Central', view: 'management', edit: pcUp() ? ['pc', 'pc'] : null, act2: pcUp() ? null : 'deployPc', count: pcUp() ? 1 : 0 },
        { id: 'services', icon: '⚙', label: 'Infrastructure services', view: 'management', list: 'services', count: 7 }] },
      { g: 'Workloads', items: [{ id: 'vms', icon: '▢', label: 'Virtual machines', view: 'vms', list: 'vms', count: lab.vms.length + (pcUp() ? 1 : 0) }] },
      { g: 'Operations', items: [{ id: 'failure', icon: '⚠', label: 'Failure scenarios', view: 'failure' }] },
      { g: 'Add-ons (coming soon)', items: Object.keys(ADDONS).map((k) => ({ id: 'addon-' + k, icon: '+', label: ADDONS[k][0], addon: k, soon: 1 })) }
    ];
  }
  function renderSide() {
    $('#side').innerHTML = menu().map((grp) => `<div class="sgroup"><div class="sglabel">${esc(grp.g)}</div>` + grp.items.map((it) => it.start
      ? `<button class="sitem start${menuSel === it.id ? ' on' : ''}" data-menu="${it.id}"><b>${esc(it.label)}</b><small>${esc(it.sub)}</small></button>`
      : `<button class="sitem${menuSel === it.id ? ' on' : ''}${it.soon ? ' soon' : ''}" data-menu="${it.id}"><span class="sicon">${it.icon}</span><span class="slabel">${esc(it.label)}</span>${it.count !== undefined ? `<span class="scount">${it.count}</span>` : ''}${it.soon ? '<span class="scount">soon</span>' : ''}</button>`).join('') + '</div>').join('');
  }
  function pickMenu(id) {
    const it = [].concat(...menu().map((g) => g.items)).find((x) => x.id === id);
    if (!it) return;
    if (it.act) { runStart(it.act); return; }
    menuSel = id; lastList = null;
    if (it.view) view = it.view;
    sel = null;
    render(false);
    if (it.edit) openEditor(it.edit[0], it.edit[1]);
    else if (it.act2) { clearPanel(); $('#panel').innerHTML = '<div class="kind">Prism Central</div><h3>Not deployed</h3><p class="muted">Prism Central manages one or more clusters from one place. Deploy it once the cluster has at least 3 nodes.</p><div class="panel-actions"><button class="btn primary" data-act="deployPc">Deploy Prism Central</button></div>'; }
    else if (it.list) openList(it.list);
    else if (it.addon) { const a = ADDONS[it.addon]; $('#panel').innerHTML = `<div class="kind">Add-on (coming soon)</div><h3>${esc(a[0])}</h3><p>${esc(a[1])}</p><p class="muted">This add-on will get its own view and objects in a future release of the lab.</p>`; }
    else clearPanel();
  }
  function runStart(act) {
    const prev = JSON.stringify(lab);
    lab = normalize(act === 'empty' ? window.NBL_EMPTY() : window.NBL_SAMPLE(act.split(':')[1]));
    fail.nodes.clear(); fail.cvms.clear(); fail.tors.clear(); fail.disk = ''; sel = null;
    menuSel = act === 'empty' ? 'nodes' : 'nodes'; view = 'physical';
    save(); render(false);
    if (act === 'empty') openList('nodes'); else clearPanel();
    toast(act === 'empty' ? 'Empty lab: add nodes to begin' : 'Loaded: ' + lab.cluster.name + ', ' + lab.nodes.length + ' nodes, RF' + lab.cluster.rf, () => { lab = normalize(JSON.parse(prev)); save(); render(true); toast('Previous lab restored'); });
  }
  function openList(kind) {
    lastList = kind;
    const L = {
      nodes: { t: 'Nodes', type: 'node', items: lab.nodes.map((n) => [n.id, n.name, n.hostIp]), add: 'addNode', addL: 'Add node', empty: 'No nodes yet. A standard cluster needs at least 3 nodes.' },
      switches: { t: 'Switches', type: 'switch', items: lab.switches.map((x) => [x.id, x.name, x.role]) },
      vswitches: { t: 'Virtual switches', type: 'netcfg', items: lab.nodes.length ? [['vs', String(lab.network.virtualSwitch), 'host and CVM traffic'], ['bond', 'br0-up bond', lab.network.bondMode]].concat(lab.network.layout === '2x2' ? [['vs1', String(lab.network.vmSwitch), 'VM traffic'], ['bond1', 'br1-up bond', lab.network.vmBondMode]] : []) : [], empty: 'Virtual switches are created with the cluster. Add nodes first.' },
      subnets: { t: 'Subnets', type: 'vmnet', items: lab.network.vmNetworks.map((v) => [v.id, v.name, vlanText(v)]), add: 'addNet', addL: 'Add subnet', add2: lab.network.vmNetworks.some((v) => v.mgmt) ? null : 'addMgmtSubnet', add2L: 'Add management VLAN subnet', empty: 'No subnets yet.' },
      containers: { t: 'Storage containers', type: 'container', items: lab.storage.containers.map((c) => [c.id, c.name, 'RF' + c.rf]), add: 'addCtr', addL: 'Add container' },
      services: { t: 'Infrastructure services', type: 'service', items: [['dns', 'DNS', lab.services.dns.join(', ')], ['ntp', 'NTP', lab.services.ntp.join(', ')], ['directory', 'Directory', lab.services.directoryTarget], ['smtp', 'SMTP', lab.services.smtp], ['syslog', 'Syslog', lab.services.syslog], ['lcmSource', 'LCM source', lab.services.lcmSource], ['proxy', 'HTTP proxy', lab.services.proxy]] },
      vms: { t: 'Virtual machines', type: 'vm', items: lab.vms.map((v) => [v.id, v.name, v.vcpu + ' vCPU / ' + v.ramGB + ' GB']), add: 'addVm', addL: 'Add VM', empty: 'No VMs yet.' }
    }[kind];
    let h = `<div class="kind">List</div><h3>${esc(L.t)} <span class="muted" style="font-weight:400">(${L.items.length})</span></h3>`;
    h += L.items.length ? '<div class="olist">' + L.items.map((x) => `<button class="orow" data-type="${L.type}" data-id="${esc(x[0])}"><span>${esc(x[1])}</span><small>${esc(x[2] || '')}</small></button>`).join('') + '</div>' : `<p class="muted">${esc(L.empty || 'None')}</p>`;
    if (L.add || L.add2) h += '<div class="panel-actions">' + (L.add ? `<button class="btn primary" data-act="${L.add}">${esc(L.addL)}</button>` : '') + (L.add2 ? `<button class="btn" data-act="${L.add2}">${esc(L.add2L)}</button>` : '') + '</div>';
    $('#panel').innerHTML = h;
  }

  /* ---------- render ---------- */
  function renderSummary() {
    const c = clusterNums();
    $('#labTitle').textContent = c.n ? `${lab.cluster.name}: ${c.n}-node ${lab.cluster.hypervisor} cluster, RF${lab.cluster.rf}.${c.n < 3 ? ' A standard cluster needs at least 3 nodes.' : ''} Click any object to view or edit it.` : 'Empty lab: start by adding nodes from the menu.';
    $('#summary').innerHTML = [
      ['cluster', 'cluster', 'Cluster', lab.cluster.name],
      ['cluster', 'cluster', 'VIP', lab.cluster.vip],
      ['hardware', 'hw', 'Nodes', c.n + ' x ' + lab.hardware.model.replace(/ \(.*\)/, '')],
      ['hardware', 'hw', 'Cores', c.coresTotal],
      ['hardware', 'hw', 'Memory', fmt(c.ramTotal / 1024, 2) + ' TB'],
      ['pool', 'pool', 'Raw', fmt(c.raw) + ' TB'],
      ['pool', 'pool', 'Usable est.', fmt(c.usable) + ' TB'],
      ['pc', 'pc', 'Prism Central', pcUp() ? lab.pc.ip : 'not deployed'],
      [null, null, 'VMs', lab.vms.length]
    ].map((x) => `<span class="chip"${x[0] ? ` data-type="${x[0]}" data-id="${x[1]}"` : ''}>${esc(x[2])}: <b>${esc(x[3])}</b></span>`).join('');
  }
  function render(resetPanel) {
    renderSummary();
    $('#canvas').innerHTML = VIEWS[view]();
    renderSide();
    if (resetPanel) clearPanel();
  }

  /* ---------- events ---------- */
  function onPick(e) {
    const act = e.target.closest('[data-act]');
    if (act) {
      ({ addNode, addVm, addNet, addCtr, deployPc, addMgmtSubnet, clearFail: () => { fail.nodes.clear(); fail.cvms.clear(); fail.tors.clear(); fail.disk = ''; render(false); } })[act.dataset.act]();
      return;
    }
    if (e.target.closest('[data-fail]')) return;
    const t = e.target.closest('[data-type]');
    if (t) openEditor(t.dataset.type, t.dataset.id);
  }
  document.addEventListener('DOMContentLoaded', () => {
    try { document.documentElement.dataset.theme = localStorage.getItem(THEME) || 'light'; } catch (e) { /* ignore */ }
    load();
    $('#side').onclick = (e) => { const b = e.target.closest('[data-menu]'); if (b) pickMenu(b.dataset.menu); };
    $('#panel').addEventListener('click', (e) => { const a = e.target.closest('[data-act]'); if (a) { onPick(e); return; } const r = e.target.closest('.orow'); if (r) openEditor(r.dataset.type, r.dataset.id); });
    $('#canvas').addEventListener('click', onPick);
    $('#summary').addEventListener('click', onPick);
    $('#canvas').addEventListener('change', (e) => {
      const el = e.target.closest('[data-fail]'); if (!el) return;
      const k = el.dataset.fail;
      if (k === 'disk') fail.disk = el.value;
      else { const set = { node: fail.nodes, cvm: fail.cvms, tor: fail.tors }[k]; el.checked ? set.add(el.value) : set.delete(el.value); }
      render(false);
    });
    $('#btnTheme').onclick = () => { const d = document.documentElement; d.dataset.theme = d.dataset.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem(THEME, d.dataset.theme); } catch (e) { /* ignore */ } };
    $('#btnExport').onclick = () => {
      const blob = new Blob([JSON.stringify(lab, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (lab.cluster.name || 'nutanix-lab') + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#btnImport').onclick = () => $('#fileImport').click();
    $('#fileImport').onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then((txt) => { const l = JSON.parse(txt); if (!valid(l)) throw new Error('not a lab file'); lab = normalize(l); sel = null; save(); render(true); toast('Lab imported'); }).catch(() => toast('That file is not a Nutanix Build Lab export'));
      e.target.value = '';
    };
    $('#btnShare').onclick = () => {
      const url = location.origin + location.pathname + '#lab=' + btoa(unescape(encodeURIComponent(JSON.stringify(lab))));
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Share link copied'), () => { prompt('Copy this link', url); });
    };
    render(true);
  });

  let toastT;
  function toast(msg, undo) {
    const t = $('#toast');
    t.textContent = msg;
    if (undo) { const b = document.createElement('button'); b.textContent = 'Undo'; b.className = 'undo'; b.onclick = () => { t.classList.remove('show'); undo(); }; t.appendChild(b); }
    t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), undo ? 7000 : 2200);
  }
})();
