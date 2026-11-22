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
        lab = JSON.parse(decodeURIComponent(escape(atob(h[1]))));
        history.replaceState(null, '', location.pathname);
        save();
        toast('Lab loaded from shared link');
        return;
      } catch (e) { console.warn('Bad shared lab', e); }
    }
    try { lab = JSON.parse(localStorage.getItem(STORE)); } catch (e) { lab = null; }
    if (!valid(lab)) lab = window.NBL_SAMPLE();
  }
  function valid(l) { return l && l.schema === 1 && Array.isArray(l.nodes) && l.cluster && l.hardware; }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(lab)); } catch (e) { /* storage may be blocked */ } }

  /* ---------- calculations ---------- */
  const node = (id) => lab.nodes.find((n) => n.id === id);
  const net = (id) => lab.network.vmNetworks.find((n) => n.id === id);
  const vmsOn = (id) => lab.vms.filter((v) => v.host === id);
  const pcOn = (id) => (lab.pc && lab.pc.host === id ? lab.pc : null);
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
    const ramWork = lab.vms.reduce((a, v) => a + Number(v.ramGB), 0) + (lab.pc ? Number(lab.pc.ramGB) : 0);
    const vcpuWork = lab.vms.reduce((a, v) => a + Number(v.vcpu), 0) + (lab.pc ? Number(lab.pc.vcpu) : 0);
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

    let t = '<table class="grid"><thead><tr><th>Node</th><th>TOR-A</th><th>TOR-B</th><th>OOB</th><th>AHV host</th><th>CVM</th><th>IPMI</th></tr></thead><tbody>';
    lab.nodes.forEach((n) => {
      t += `<tr class="click${isSel('node', n.id) ? ' sel' : ''}" data-type="node" data-id="${esc(n.id)}"><td><b>${esc(n.name)}</b></td><td class="mono">${esc(n.torAPort)}</td><td class="mono">${esc(n.torBPort)}</td><td class="mono">${esc(n.oobPort)}</td><td class="mono">${esc(n.hostIp)}</td><td class="mono">${esc(n.cvmIp)}</td><td class="mono">${esc(n.ipmiIp)}</td></tr>`;
    });
    t += '</tbody></table>';

    const hw = lab.hardware;
    const cards = `<div class="cards">
      <div class="card obj" data-type="hardware" data-id="hw"><div class="lbl">Node model</div><div><b>${esc(hw.model)}</b></div></div>
      <div class="card obj" data-type="hardware" data-id="hw"><div class="lbl">CPU per node</div><div class="big">${hw.sockets} x ${hw.coresPerSocket}c</div><div class="lbl">${cores()} physical cores</div></div>
      <div class="card obj" data-type="hardware" data-id="hw"><div class="lbl">Memory per node</div><div class="big">${fmt(hw.ramGB, 0)} GB</div></div>
      <div class="card obj" data-type="hardware" data-id="hw"><div class="lbl">Data drives per node</div><div class="big">${hw.diskCount} x ${hw.diskSizeTB} TB</div><div class="lbl">${esc(hw.diskType)}, boot on ${esc(hw.bootDevice)}</div></div>
      <div class="card obj" data-type="hardware" data-id="hw"><div class="lbl">NICs per node</div><div><b>${esc(hw.dataNics)}</b></div><div class="lbl">${esc(hw.bmc)}</div></div>
    </div>`;

    return head('Physical view', `${lab.nodes.length} single-node 1U appliances, two data top-of-rack switches and one out-of-band switch for IPMI. Each node has one data uplink to each ToR and one BMC link to the OOB switch.`, '<button class="btn" data-act="addNode">Add node</button>') +
      `<div class="two"><div>${s}</div><div><h3 style="margin:0">Cabling and addressing</h3><p class="muted" style="margin:2px 0 0">Click a row to edit the node, its ports and IP addresses.</p>${t}${cards}</div></div>`;
  };

  VIEWS.network = function () {
    const n = lab.nodes.length, cw = 200, gap = 18;
    const W = Math.max(1000, n * (cw + gap) + 40);
    const hx = (i) => 20 + i * (cw + gap);
    const HY = 250, HH = 312;
    const torA = { x: W * 0.22 - 90, y: 100 }, torB = { x: W * 0.55 - 90, y: 100 }, oob = { x: W - 220, y: 100 };
    let s = `<svg class="diagram" viewBox="0 0 ${W} ${HY + HH + 110}">`;
    // core
    s += R(W * 0.385 - 110, 14, 220, 40, 'svc') + T(W * 0.385, 32, 'Upstream / core network', 't-title', 'middle') + T(W * 0.385, 47, 'Routed gateways for all VLANs', 't-muted', 'middle');
    s += C(W * 0.385 - 40, 54, torA.x + 90, torA.y, 'wire') + C(W * 0.385 + 40, 54, torB.x + 90, torB.y, 'wire');
    s += L(torA.x + 180, torA.y + 25, torB.x, torB.y + 25, 'peer') + T((torA.x + 180 + torB.x) / 2, torA.y + 18, 'MLAG / vPC peer link', 't-muted', 'middle');
    const swBox = (sw, p) => {
      const down = fail.tors.has(sw.id);
      return G('switch', sw.id, R(p.x, p.y, 180, 50, 'sw' + (down ? ' down' : '')) + T(p.x + 90, p.y + 21, sw.name, 't-title', 'middle') + T(p.x + 90, p.y + 38, sw.role, 't-muted', 'middle'));
    };
    s += swBox(lab.switches[0], torA) + swBox(lab.switches[1], torB) + swBox(lab.switches[2], oob);

    lab.nodes.forEach((nd, i) => {
      const x = hx(i), y = HY;
      const pA = { x: x + 14, y: y - 12 }, pB = { x: x + 74, y: y - 12 }, pI = { x: x + cw - 58, y: y - 12 };
      s += C(torA.x + 90, torA.y + 50, pA.x + 25, pA.y, fail.tors.has('torA') || fail.nodes.has(nd.id) ? 'wire-down' : 'wire-a');
      s += C(torB.x + 90, torB.y + 50, pB.x + 25, pB.y, fail.tors.has('torB') || fail.nodes.has(nd.id) ? 'wire-down' : 'wire-b');
      s += C(oob.x + 90, oob.y + 50, pI.x + 22, pI.y, 'wire-ipmi');
    });

    lab.nodes.forEach((nd, i) => {
      const x = hx(i), y = HY;
      const down = fail.nodes.has(nd.id), cvmDown = fail.cvms.has(nd.id);
      const vms = vmsOn(nd.id).length + (pcOn(nd.id) ? 1 : 0);
      let h = G('node', nd.id, R(x, y, cw, HH, 'host' + (down ? ' down' : '')) + T(x + 10, y + HH - 12, nd.name, 't-title') + T(x + cw - 10, y + HH - 12, 'AHV', 't-muted', 'end'));
      // ports on top edge
      h += R(x + 14, y - 12, 50, 22, 'port', 4) + T(x + 39, y + 3, '25G-A', 't-small', 'middle');
      h += R(x + 74, y - 12, 50, 22, 'port', 4) + T(x + 99, y + 3, '25G-B', 't-small', 'middle');
      h += R(x + cw - 58, y - 12, 44, 22, 'ipmi', 4) + T(x + cw - 36, y + 3, 'BMC', 't-small', 'middle');
      h += T(x + cw - 36, y + 26, nd.ipmiIp, 't-mono t-muted', 'middle').replace('class="', 'style="font-size:9px" class="');
      // bond
      h += L(x + 39, y + 10, x + 69, y + 50, 'wire') + L(x + 99, y + 10, x + 99, y + 50, 'wire');
      h += G('netcfg', 'bond', R(x + 10, y + 50, cw - 20, 28, 'br') + T(x + cw / 2, y + 68, 'br0-up bond: ' + lab.network.bondMode, 't-small', 'middle'));
      h += L(x + cw / 2, y + 78, x + cw / 2, y + 92, 'wire');
      h += G('netcfg', 'vs', R(x + 10, y + 92, cw - 20, 42, 'br') + T(x + cw / 2, y + 109, 'br0  (virtual switch ' + String(lab.network.virtualSwitch).split(' ')[0] + ')', 't-small t-title', 'middle') + T(x + cw / 2, y + 126, 'AHV host ' + nd.hostIp, 't-mono', 'middle'));
      // CVM and UVMs
      h += L(x + 55, y + 134, x + 55, y + 154, 'wire') + L(x + 145, y + 134, x + 145, y + 154, 'wire');
      h += G('cvm', nd.id, R(x + 10, y + 154, 92, 74, 'cvm' + (cvmDown || down ? ' down' : '')) + T(x + 56, y + 172, 'CVM', 't-title', 'middle') + T(x + 16, y + 190, 'eth0', 't-muted t-small') + T(x + 16, y + 203, nd.cvmIp, 't-mono') + T(x + 16, y + 220, 'eth1 192.168.5.2', 't-small'));
      h += G('vmsof', nd.id, R(x + 108, y + 154, 82, 74, 'uvm' + (down ? ' down' : '')) + T(x + 149, y + 180, 'User VMs', 't-small t-title', 'middle') + T(x + 149, y + 202, vms, 't-title', 'middle').replace('t-title', 't-title" style="font-size:20px') + T(x + 149, y + 220, 'on this host', 't-muted', 'middle'));
      h += L(x + 56, y + 228, x + 56, y + 244, 'wire');
      h += R(x + 10, y + 244, cw - 20, 34, 'svc') + T(x + cw / 2, y + 259, 'virbr0  192.168.5.1', 't-small', 'middle') + T(x + cw / 2, y + 272, 'internal host to CVM link', 't-muted', 'middle').replace('class="', 'style="font-size:9.5px" class="');
      s += h;
    });

    // VLAN legend
    const ly = HY + HH + 34;
    s += T(20, ly, 'Networks (click to edit)', 't-title');
    const chips = [
      { type: 'netcfg', id: 'mgmt', label: `Mgmt VLAN ${lab.network.mgmtVlan}  ${lab.network.mgmtSubnet}  (${lab.network.mgmtTagging})`, cls: 'br' },
      { type: 'netcfg', id: 'ipmi', label: `IPMI VLAN ${lab.network.ipmiVlan}  ${lab.network.ipmiSubnet}`, cls: 'ipmi' }
    ].concat(lab.network.vmNetworks.map((v) => ({ type: 'vmnet', id: v.id, label: `${v.name}  VLAN ${v.vlan}  ${v.subnet}`, cls: 'uvm' })));
    let cx = 20, cy = ly + 12;
    chips.forEach((c) => {
      const w = c.label.length * 6.4 + 20;
      if (cx + w > W - 20) { cx = 20; cy += 34; }
      s += G(c.type, c.id, R(cx, cy, w, 26, c.cls, 13) + T(cx + w / 2, cy + 17, c.label, 't-small', 'middle'));
      cx += w + 10;
    });
    s += '</svg>';
    return head('Network view', `Each AHV host connects both 25GbE ports to one bond (br0-up) on bridge br0, which backs virtual switch vs0. The CVM and AHV host share the management VLAN. Each CVM also has a private link to its own host on 192.168.5.0/24 through virbr0, which never leaves the host. MTU ${esc(lab.network.mtu)}.`, '<button class="btn" data-act="addNet">Add VM network</button>') + s;
  };

  VIEWS.storage = function () {
    const n = lab.nodes.length, cw = 150, gap = 14;
    const W = Math.max(900, n * (cw + gap) + 40);
    const hx = (i) => 20 + i * (cw + gap);
    const rf = Number(lab.cluster.rf);
    let s = `<svg class="diagram" viewBox="0 0 ${W} 440">${defs}`;
    // containers
    const ctrs = lab.storage.containers;
    const ctrW = Math.min(240, (W - 40 - (ctrs.length - 1) * 12) / ctrs.length);
    ctrs.forEach((c, i) => {
      const x = 20 + i * (ctrW + 12);
      s += G('container', c.id, R(x, 16, ctrW, 54, 'ctr') + T(x + ctrW / 2, 36, c.name, 't-title', 'middle') + T(x + ctrW / 2, 55, `RF${c.rf}${c.compression ? ', compression' : ''}${c.dedup ? ', dedup' : ''}${c.ecx ? ', EC-X' : ''}`, 't-muted', 'middle'));
      s += L(x + ctrW / 2, 70, x + ctrW / 2, 96, 'wire');
    });
    // pool
    s += G('pool', 'pool', R(10, 96, W - 20, 44, 'pool') + T(W / 2, 116, 'Storage pool (all drives in the cluster)', 't-title', 'middle') + T(W / 2, 132, `${fmt(n * nodeRawTB())} TB raw across ${n * lab.hardware.diskCount} drives`, 't-muted', 'middle'));
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
    return head('Storage view', `The Distributed Storage Fabric pools every data drive in the cluster. Containers are logical datastores carved from the pool, each with its own replication factor and data reduction settings. This is a planning estimate only; use Nutanix Sizer for real designs.`, '<button class="btn" data-act="addCtr">Add container</button>') + s + cards;
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
      t += `<tr class="click${isSel('vm', v.id) ? ' sel' : ''}" data-type="vm" data-id="${esc(v.id)}"><td><b>${esc(v.name)}</b></td><td>${esc(v.os)}</td><td>${v.vcpu}</td><td>${v.ramGB} GB</td><td>${v.diskGB} GB</td><td>${esc(nw ? nw.name + ' (VLAN ' + nw.vlan + ')' : 'none')}</td><td>${esc(nd ? nd.name : 'unassigned')}</td></tr>`;
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
    svcs.forEach((x) => {
      s += G('service', x.id, R(x.x, 20, 180, 56, 'svc') + T(x.x + 90, 42, x.label, 't-title', 'middle') + T(x.x + 90, 62, x.val.length > 24 ? x.val.slice(0, 23) + '...' : x.val, 't-mono t-muted', 'middle'));
      s += C(x.x + 90, 76, x.x < 500 ? 250 : 760, 190, 'wire');
    });
    // PE
    s += G('cluster', 'cluster', R(80, 190, 360, 190, 'host') + T(260, 214, 'Prism Element: ' + lab.cluster.name, 't-title', 'middle') +
      T(100, 242, 'Cluster virtual IP', 't-muted') + T(420, 242, lab.cluster.vip, 't-mono', 'end') +
      T(100, 264, 'Data services IP (iSCSI)', 't-muted') + T(420, 264, lab.cluster.dsip, 't-mono', 'end') +
      T(100, 286, 'Software', 't-muted') + T(420, 286, lab.cluster.aos, 't-mono', 'end') +
      T(100, 308, 'Redundancy factor', 't-muted') + T(420, 308, 'RF' + lab.cluster.rf + ' (FT' + ft() + ')', 't-mono', 'end'));
    lab.nodes.forEach((nd, i) => {
      s += G('cvm', nd.id, R(96 + i * (328 / lab.nodes.length), 326, 328 / lab.nodes.length - 6, 40, 'cvm' + (fail.cvms.has(nd.id) || fail.nodes.has(nd.id) ? ' down' : ''), 4) + T(96 + i * (328 / lab.nodes.length) + (328 / lab.nodes.length - 6) / 2, 350, 'CVM' + (i + 1), 't-small', 'middle'));
    });
    // PC
    s += G('pc', 'pc', R(640, 190, 380, 190, 'ipmi') + T(830, 214, 'Prism Central: ' + lab.pc.name, 't-title', 'middle') +
      T(660, 242, 'Deployment', 't-muted') + T(1000, 242, lab.pc.deployment + ', ' + lab.pc.size, 't-mono', 'end') +
      T(660, 264, 'IP / FQDN', 't-muted') + T(1000, 264, lab.pc.ip + ' / ' + lab.pc.fqdn, 't-mono', 'end') +
      T(660, 286, 'Runs on', 't-muted') + T(1000, 286, (node(lab.pc.host) || {}).name || 'unassigned', 't-mono', 'end') +
      T(660, 308, 'Size (example)', 't-muted') + T(1000, 308, lab.pc.vcpu + ' vCPU / ' + lab.pc.ramGB + ' GB', 't-mono', 'end') +
      T(660, 340, 'Multicluster management, LCM, reporting,', 't-muted') + T(660, 356, 'categories, policies and add-on services', 't-muted'));
    s += L(440, 285, 640, 285, 'wire-a') + T(540, 276, 'registered', 't-muted', 'middle') + T(540, 302, 'TCP 9440', 't-mono t-muted', 'middle');
    // internet side
    s += G('service', 'lcmSource', R(640, 430, 180, 56, 'svc') + T(730, 452, 'LCM updates', 't-title', 'middle') + T(730, 472, sv.lcmSource.length > 28 ? sv.lcmSource.slice(0, 27) + '...' : sv.lcmSource, 't-muted', 'middle'));
    s += G('service', 'proxy', R(840, 430, 180, 56, 'svc') + T(930, 452, 'HTTP proxy', 't-title', 'middle') + T(930, 472, sv.proxy, 't-muted', 'middle'));
    s += C(830, 380, 730, 430, 'wire') + C(830, 380, 930, 430, 'wire');
    s += G('netcfg', 'ipmi', R(80, 430, 360, 56, 'ipmi') + T(260, 452, 'Out-of-band: IPMI on VLAN ' + lab.network.ipmiVlan, 't-title', 'middle') + T(260, 472, 'BMC consoles used by Foundation and for recovery', 't-muted', 'middle'));
    s += L(260, 380, 260, 430, 'wire-ipmi');
    s += '</svg>';
    return head('Management view', 'Prism Element runs inside the cluster on the CVMs and manages one cluster. Prism Central is a separate VM that registers one or more clusters for central management. Both depend on DNS and NTP being correct before cluster creation; click a service to edit it.') + s;
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
      s += C(sx[0] + 70, 50, x + 40, 110, fail.tors.has('torA') || dn ? 'wire-down' : 'wire-a');
      s += C(sx[1] + 70, 50, x + cw - 40, 110, fail.tors.has('torB') || dn ? 'wire-down' : 'wire-b');
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
      add('warn', `${sw.name} down`, `Each host loses one uplink. With the ${esc(lab.network.bondMode)} bond, traffic moves to the remaining uplink on the other switch. Expect a short interruption during failover. ${lab.network.bondMode === 'active-backup' ? 'Bandwidth does not change, because active-backup only uses one uplink at a time.' : 'Each host runs on half of its uplink bandwidth until the switch returns.'}`);
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
  const netOpts = () => [['', 'none']].concat(lab.network.vmNetworks.map((n) => [n.id, `${n.name} (VLAN ${n.vlan})`]));

  function editorFor(type, id) {
    switch (type) {
      case 'node': {
        const n = node(id); if (!n) return null;
        return { kind: 'Node', title: n.name, obj: n, fields: [F('name', 'Host name'), F('serial', 'Serial number'), F('hostIp', 'AHV host IP'), F('cvmIp', 'CVM IP'), F('ipmiIp', 'IPMI IP'), F('torAPort', 'TOR-A port'), F('torBPort', 'TOR-B port'), F('oobPort', 'OOB switch port')],
          note: `Hardware for all nodes is set in the hardware profile (homogeneous cluster).`, extra: hostSummary(id),
          del: lab.nodes.length > 3 ? () => removeNode(id) : null, delLabel: 'Remove node' };
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
        return { kind: 'Cluster', title: lab.cluster.name, obj: lab.cluster, fields: [F('name', 'Cluster name'), F('aos', 'AOS version'), F('hypervisor', 'Hypervisor', { ro: true }), F('rf', 'Redundancy factor', { opts: [[2, 'RF2 (tolerates 1 failure)'], [3, 'RF3 (tolerates 2, needs 5+ nodes)']], num: 1 }), F('vip', 'Cluster virtual IP'), F('dsip', 'Data services IP'), F('timezone', 'Time zone')] };
      case 'pc':
        return { kind: 'Prism Central', title: lab.pc.name, obj: lab.pc, fields: [F('name', 'VM name'), F('deployment', 'Deployment', { opts: [['Single VM', 'Single VM'], ['Scale-out (3 VMs)', 'Scale-out (3 VMs)']] }), F('size', 'Size', { opts: [['Small', 'Small'], ['Large', 'Large'], ['X-Large', 'X-Large']] }), F('vcpu', 'vCPU', { num: 1 }), F('ramGB', 'Memory (GB)', { num: 1 }), F('ip', 'IP address'), F('fqdn', 'FQDN'), F('host', 'Runs on host', { opts: nodeOpts() })],
          note: 'vCPU and memory are example values. Check the Prism Central sizing table for your pc release before deploying.' };
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
        return { kind: 'VM network', title: v.name, obj: v, fields: [F('name', 'Name'), F('vlan', 'VLAN ID', { num: 1 }), F('subnet', 'Subnet'), F('gateway', 'Gateway')],
          note: 'VM networks are VLAN-backed subnets on virtual switch vs0. The VLAN must be trunked on both ToR ports for every host.',
          del: () => { lab.network.vmNetworks = lab.network.vmNetworks.filter((x) => x.id !== id); lab.vms.forEach((x) => { if (x.network === id) x.network = ''; }); }, delLabel: 'Delete network' };
      }
      case 'netcfg': {
        const map = {
          mgmt: { kind: 'Management network', fields: [F('mgmtVlan', 'VLAN ID', { num: 1 }), F('mgmtTagging', 'Tagging', { opts: [['Native (untagged)', 'Native (untagged)'], ['Tagged', 'Tagged']] }), F('mgmtSubnet', 'Subnet'), F('mgmtGateway', 'Gateway')], note: 'AHV hosts, CVMs, the cluster VIP, the data services IP and Prism Central share this network in the sample.' },
          ipmi: { kind: 'IPMI network', fields: [F('ipmiVlan', 'VLAN ID', { num: 1 }), F('ipmiSubnet', 'Subnet'), F('ipmiGateway', 'Gateway')], note: 'BMC interfaces, used by Foundation for imaging and for remote console.' },
          bond: { kind: 'Uplink bond', fields: [F('bondMode', 'Bond mode', { opts: [['active-backup', 'active-backup'], ['balance-slb', 'balance-slb'], ['balance-tcp', 'balance-tcp (LACP)']] }), F('mtu', 'MTU', { num: 1 })], note: 'active-backup uses one uplink at a time and needs no special switch configuration. balance-tcp requires LACP on the switch side.' },
          vs: { kind: 'Virtual switch', fields: [F('virtualSwitch', 'Virtual switch'), F('bondMode', 'Bond mode', { opts: [['active-backup', 'active-backup'], ['balance-slb', 'balance-slb'], ['balance-tcp', 'balance-tcp (LACP)']] }), F('mtu', 'MTU', { num: 1 })], note: 'The default virtual switch vs0 maps to bridge br0 on every host.' }
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
        return { kind: 'Storage pool', title: 'Storage pool', obj: lab.storage, fields: [F('planningOverheadPct', 'Planning overhead (%)', { num: 1 })],
          note: 'Overhead is your own planning assumption for system space, metadata and headroom. It is not a Nutanix published figure.' };
      case 'service': {
        const labels = { dns: 'DNS servers (comma separated)', ntp: 'NTP servers (comma separated)', directory: 'Directory service', smtp: 'SMTP relay', syslog: 'Syslog target', lcmSource: 'LCM source', proxy: 'HTTP proxy' };
        const isList = id === 'dns' || id === 'ntp';
        return { kind: 'Infrastructure service', title: labels[id].replace(/ \(.*\)/, ''), obj: lab.services, fields: [F(id, labels[id], isList ? { list: 1 } : (id === 'lcmSource' ? { opts: [['Internet (Nutanix portal)', 'Internet (Nutanix portal)'], ['Dark site (local web server)', 'Dark site (local web server)']] } : {}))],
          note: id === 'ntp' ? 'Use reliable NTP sources reachable from the CVMs. Time drift between CVMs causes cluster issues.' : (id === 'dns' ? 'CVMs and Prism Central need working forward and reverse DNS.' : '') };
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
      ed.obj[k] = val;
      save(); render(false);
      if (k === 'name') { const t = panel.querySelector('h3'); if (t) t.textContent = val; }
    };
    const del = $('#btnDel');
    if (del) del.onclick = () => { ed.del(); sel = null; save(); render(); clearPanel(); };
    $('#btnClose').onclick = () => { sel = null; clearPanel(); render(false); };
    render(false);
  }
  function clearPanel() {
    $('#panel').innerHTML = '<div class="panel-empty"><h3>Details</h3><p>Select a node, switch, VM, network, container or service in the diagram to see its settings here. Changes are saved in this browser automatically.</p></div>';
  }

  /* ---------- mutations ---------- */
  function nextId(prefix, list) { let i = list.length + 1; while (list.some((x) => x.id === prefix + i)) i++; return prefix + i; }
  function bumpIp(ipStr, by) { const p = String(ipStr).split('.').map(Number); if (p.length !== 4 || p.some(isNaN)) return ''; p[3] = Math.min(254, p[3] + by); return p.join('.'); }
  function addNode() {
    if (lab.nodes.length >= 16) { toast('This lab supports up to 16 nodes'); return; }
    const last = lab.nodes[lab.nodes.length - 1];
    const id = nextId('n', lab.nodes);
    const num = lab.nodes.length + 1;
    lab.nodes.push({ id, name: 'NTX-N' + num, serial: 'EXAMPLE-SN-' + String(num).padStart(2, '0'), hostIp: bumpIp(last.hostIp, 1), cvmIp: bumpIp(last.cvmIp, 1), ipmiIp: bumpIp(last.ipmiIp, 1), torAPort: 'Eth1/' + num, torBPort: 'Eth1/' + num, oobPort: 'Gi1/0/' + num });
    save(); render(); openEditor('node', id);
  }
  function removeNode(id) {
    const target = lab.nodes.find((n) => n.id !== id);
    lab.nodes = lab.nodes.filter((n) => n.id !== id);
    lab.vms.forEach((v) => { if (v.host === id) v.host = target.id; });
    if (lab.pc.host === id) lab.pc.host = target.id;
    if (Number(lab.cluster.rf) === 3 && lab.nodes.length < 5) lab.cluster.rf = 2;
    fail.nodes.delete(id); fail.cvms.delete(id);
  }
  function addVm() {
    const id = 'vm-' + Date.now().toString(36);
    const load = lab.nodes.map((n) => ({ id: n.id, ram: hostUse(n.id).ramVm + hostUse(n.id).ramPc })).sort((a, b) => a.ram - b.ram);
    lab.vms.push({ id, name: 'NEW-VM-' + (lab.vms.length + 1), vcpu: 2, ramGB: 8, diskGB: 100, network: (lab.network.vmNetworks[0] || {}).id || '', host: load[0].id, os: 'Linux' });
    save(); render(); openEditor('vm', id);
  }
  function addNet() {
    const id = 'net-' + Date.now().toString(36);
    const vlan = Math.max(99, ...lab.network.vmNetworks.map((n) => Number(n.vlan) || 0)) + 10;
    lab.network.vmNetworks.push({ id, name: 'VM-Net-' + vlan, vlan, subnet: `10.10.${vlan % 255}.0/24`, gateway: `10.10.${vlan % 255}.1` });
    save(); render(); openEditor('vmnet', id);
  }
  function addCtr() {
    const id = 'ctr-' + Date.now().toString(36);
    lab.storage.containers.push({ id, name: 'Container-' + (lab.storage.containers.length + 1), system: false, rf: Number(lab.cluster.rf), compression: true, dedup: false, ecx: false });
    save(); render(); openEditor('container', id);
  }

  /* ---------- render ---------- */
  function renderSummary() {
    const c = clusterNums();
    $('#labTitle').textContent = `${lab.cluster.name}: ${c.n}-node ${lab.cluster.hypervisor} cluster, RF${lab.cluster.rf}. Click any object to view or edit it.`;
    $('#summary').innerHTML = [
      ['cluster', 'cluster', 'Cluster', lab.cluster.name],
      ['cluster', 'cluster', 'VIP', lab.cluster.vip],
      ['hardware', 'hw', 'Nodes', c.n + ' x ' + lab.hardware.model.replace(/ \(.*\)/, '')],
      ['hardware', 'hw', 'Cores', c.coresTotal],
      ['hardware', 'hw', 'Memory', fmt(c.ramTotal / 1024, 2) + ' TB'],
      ['pool', 'pool', 'Raw', fmt(c.raw) + ' TB'],
      ['pool', 'pool', 'Usable est.', fmt(c.usable) + ' TB'],
      ['pc', 'pc', 'Prism Central', lab.pc.ip],
      [null, null, 'VMs', lab.vms.length]
    ].map((x) => `<span class="chip"${x[0] ? ` data-type="${x[0]}" data-id="${x[1]}"` : ''}>${esc(x[2])}: <b>${esc(x[3])}</b></span>`).join('');
  }
  function render(resetPanel) {
    renderSummary();
    $('#canvas').innerHTML = VIEWS[view]();
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    if (resetPanel) clearPanel();
  }

  /* ---------- events ---------- */
  function onPick(e) {
    const act = e.target.closest('[data-act]');
    if (act) {
      ({ addNode, addVm, addNet, addCtr, clearFail: () => { fail.nodes.clear(); fail.cvms.clear(); fail.tors.clear(); fail.disk = ''; render(false); } })[act.dataset.act]();
      return;
    }
    if (e.target.closest('[data-fail]')) return;
    const t = e.target.closest('[data-type]');
    if (t) openEditor(t.dataset.type, t.dataset.id);
  }
  document.addEventListener('DOMContentLoaded', () => {
    try { document.documentElement.dataset.theme = localStorage.getItem(THEME) || 'light'; } catch (e) { /* ignore */ }
    load();
    $('#tabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; view = b.dataset.view; render(false); };
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
    $('#btnReset').onclick = () => { if (!confirmReset()) return; lab = window.NBL_SAMPLE(); fail.nodes.clear(); fail.cvms.clear(); fail.tors.clear(); fail.disk = ''; sel = null; save(); render(true); toast('Sample lab restored'); };
    $('#btnExport').onclick = () => {
      const blob = new Blob([JSON.stringify(lab, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (lab.cluster.name || 'nutanix-lab') + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#btnImport').onclick = () => $('#fileImport').click();
    $('#fileImport').onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then((txt) => { const l = JSON.parse(txt); if (!valid(l)) throw new Error('not a lab file'); lab = l; sel = null; save(); render(true); toast('Lab imported'); }).catch(() => toast('That file is not a Nutanix Build Lab export'));
      e.target.value = '';
    };
    $('#btnShare').onclick = () => {
      const url = location.origin + location.pathname + '#lab=' + btoa(unescape(encodeURIComponent(JSON.stringify(lab))));
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Share link copied'), () => { prompt('Copy this link', url); });
    };
    render(true);
  });
  let resetArmed = 0;
  function confirmReset() { const now = Date.now(); if (now - resetArmed < 3000) { resetArmed = 0; return true; } resetArmed = now; toast('Click Reset sample again to confirm'); return false; }

  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }
})();
