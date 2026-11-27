/* Rear panel layouts for each NX node type, traced from the back panel figures in the Nutanix
   system specifications (NX-9151-G9 from the vendor rear view image). Positions are fractions of the
   panel width (x, w) and height (y, h). Schematic only: sizes are approximate, not to scale.
   Item kinds: psu, slot (PCIe), aiom, lom, ipmi, usb, vga, uid, serial, mdp, btn, m2, hba, latch, drv, ctl.
   nic: which "NIC n" the slot holds. ports: drawn port count. rtl: port 1 is the right-hand port. */
(function () {
  const I = (k, l, x, y, w, h, o) => Object.assign({ k, l, x, y, w, h }, o || {});
  // shared pieces
  const psu = (n, x, y, w, h) => I('psu', 'PSU ' + n, x, y, w, h, { id: 'PSU' + n });
  const g9io = [ // NX-3155-G9 / NX-8155-G9 / NX-8155A-G9 lower left block
    psu(1, 0.05, 0.52, 0.155, 0.45), psu(2, 0.21, 0.52, 0.15, 0.45),
    I('ipmi', 'IPMI', 0.37, 0.52, 0.035, 0.16, { id: 'IPMI' }), I('usb', 'USB 3.0 x2', 0.37, 0.70, 0.035, 0.25),
    I('vga', 'VGA', 0.415, 0.74, 0.075, 0.16), I('uid', 'UID', 0.495, 0.78, 0.012, 0.1),
    I('aiom', 'AIOM', 0.52, 0.60, 0.155, 0.37, { id: 'AIOM', ports: 2, note: 'Port 1 is shared IPMI' })
  ];
  const g10io2u = (aiomRtl, psuL, psuR) => [ // NX-8150 family lower left block
    psu(psuL, 0.015, 0.52, 0.165, 0.46), psu(psuR, 0.19, 0.52, 0.16, 0.46),
    I('ipmi', 'IPMI', 0.365, 0.52, 0.035, 0.18, { id: 'IPMI' }), I('usb', 'USB x2', 0.365, 0.74, 0.035, 0.22),
    I('vga', 'VGA', 0.41, 0.72, 0.08, 0.2), I('uid', 'UID', 0.493, 0.78, 0.012, 0.1),
    I('aiom', 'AIOM', 0.53, 0.79, 0.17, 0.18, { id: 'AIOM', ports: 2, rtl: aiomRtl, note: 'Port 1 is shared IPMI / IPMI failover' })
  ];
  const r8170 = (slot1, aiomRtl) => ({
    u: 1, items: [
      psu(1, 0.005, 0.03, 0.165, 0.94), psu(2, 0.18, 0.03, 0.17, 0.94),
      I('ipmi', 'IPMI', 0.365, 0.1, 0.035, 0.33, { id: 'IPMI' }), I('usb', 'USB x2', 0.365, 0.45, 0.035, 0.48),
      I('vga', 'VGA', 0.42, 0.58, 0.055, 0.32), I('uid', 'UID', 0.488, 0.65, 0.015, 0.2),
      I('slot', slot1, 0.435, 0.08, 0.235, 0.38, { nic: 3 }),
      I('aiom', 'AIOM', 0.52, 0.55, 0.175, 0.4, { id: 'AIOM', ports: 2, rtl: aiomRtl, note: 'Port 1 is IPMI failover' }),
      I('slot', 'Slot 2: NIC 2', 0.73, 0.08, 0.23, 0.38, { nic: 2 }),
      I('slot', 'Slot 3: NIC 1', 0.73, 0.54, 0.23, 0.4, { nic: 1 })
    ]
  });

  const L = {};
  L['NX-1120AS-G10'] = { u: 1, items: [
    I('psu', 'PSU slot (empty)', 0.0, 0.03, 0.165, 0.94, { empty: 1 }), psu(1, 0.17, 0.03, 0.12, 0.94),
    I('btn', 'Power', 0.32, 0.1, 0.03, 0.4), I('serial', 'Serial', 0.33, 0.55, 0.05, 0.35),
    I('ipmi', 'IPMI', 0.395, 0.08, 0.035, 0.4, { id: 'IPMI' }), I('usb', 'USB 3.0 x4', 0.39, 0.55, 0.07, 0.38),
    I('lom', 'LOM 10GbE', 0.475, 0.55, 0.08, 0.38, { id: 'LOM', ports: 2, rtl: 1, note: 'Port 1 is shared IPMI' }),
    I('vga', 'VGA', 0.565, 0.55, 0.05, 0.35), I('uid', 'UID', 0.635, 0.6, 0.02, 0.25),
    I('slot', 'NIC 3', 0.52, 0.06, 0.16, 0.42, { nic: 3 }),
    I('slot', 'NIC 1', 0.70, 0.06, 0.22, 0.42, { nic: 1 }), I('slot', 'NIC 2', 0.70, 0.52, 0.22, 0.42, { nic: 2 })
  ] };
  L['NX-1150S-G9'] = { u: 2, frontIO: 1, items: [
    I('ctl', 'Control panel', 0.0, 0.02, 0.045, 0.96), psu(2, 0.05, 0.02, 0.13, 0.47), psu(1, 0.05, 0.51, 0.13, 0.47),
    I('drv', 'NVMe x2', 0.185, 0.05, 0.06, 0.9),
    I('slot', 'NIC 1 / GPU', 0.26, 0.06, 0.19, 0.36, { nic: 1 }),
    I('ipmi', 'IPMI', 0.415, 0.5, 0.035, 0.16, { id: 'IPMI' }), I('serial', 'COM', 0.35, 0.75, 0.055, 0.15),
    I('usb', 'USB 2.0 x2', 0.41, 0.72, 0.03, 0.22), I('usb', 'USB 3.0 x2', 0.445, 0.72, 0.03, 0.22),
    I('lom', '10GBase-T', 0.485, 0.72, 0.08, 0.2, { id: 'LOM', ports: 2, note: 'Port 1 is shared IPMI' }),
    I('vga', 'VGA', 0.585, 0.74, 0.04, 0.15), I('uid', 'UID', 0.63, 0.78, 0.015, 0.1),
    I('slot', 'NIC 2', 0.66, 0.08, 0.27, 0.22, { nic: 2 }), I('slot', 'NIC 3', 0.66, 0.33, 0.27, 0.22, { nic: 3 })
  ] };
  L['NX-1175S-G10'] = { u: 1, items: [
    psu(1, 0.02, 0.03, 0.11, 0.94), psu(2, 0.14, 0.03, 0.12, 0.94),
    I('serial', 'Serial', 0.31, 0.6, 0.06, 0.3), I('ipmi', 'IPMI', 0.38, 0.1, 0.04, 0.35, { id: 'IPMI' }), I('usb', 'USB x2', 0.38, 0.47, 0.035, 0.45),
    I('lom', '10GBase-T LAN', 0.455, 0.55, 0.09, 0.38, { id: 'LOM', ports: 2, note: 'Port 1 (left) is shared IPMI' }),
    I('vga', 'VGA', 0.57, 0.6, 0.06, 0.3), I('uid', 'UID', 0.645, 0.65, 0.015, 0.2),
    I('slot', 'HBA or NIC 3', 0.53, 0.08, 0.14, 0.38, { nic: 3 }),
    I('slot', 'NIC 2 or GPU 1', 0.68, 0.08, 0.26, 0.38, { nic: 2 }), I('slot', 'NIC 1 or GPU 2', 0.68, 0.54, 0.26, 0.38, { nic: 1 })
  ] };
  L['NX-3035-G10'] = { u: 2,
    nodes: [{ n: 'B', x: 0, y: 0, w: 0.446, h: 1 }, { n: 'A', x: 0.541, y: 0, w: 0.459, h: 1 }],
    shared: [psu(1, 0.446, 0.02, 0.095, 0.47), psu(2, 0.446, 0.51, 0.095, 0.47)],
    node: [
      I('slot', 'NIC 3', 0.16, 0.55, 0.27, 0.2, { nic: 3 }), I('slot', 'NIC 2', 0.60, 0.30, 0.29, 0.19, { nic: 2 }), I('slot', 'NIC 1', 0.60, 0.53, 0.29, 0.19, { nic: 1 }),
      I('aiom', 'AIOM', 0.13, 0.78, 0.33, 0.19, { id: 'AIOM', ports: 2, note: 'Port 1 is shared IPMI' }),
      I('vga', 'VGA', 0.53, 0.78, 0.13, 0.17), I('usb', 'USB', 0.67, 0.78, 0.06, 0.17), I('ipmi', 'IPMI', 0.75, 0.78, 0.08, 0.17, { id: 'IPMI' }),
      I('uid', 'UID', 0.85, 0.82, 0.03, 0.1), I('latch', 'Latch', 0.94, 0.2, 0.04, 0.3)
    ] };
  L['NX-3060S-G10'] = { u: 2,
    nodes: [{ n: 'D', x: 0, y: 0, w: 0.436, h: 0.5 }, { n: 'C', x: 0, y: 0.5, w: 0.436, h: 0.5 }, { n: 'B', x: 0.538, y: 0, w: 0.462, h: 0.5 }, { n: 'A', x: 0.538, y: 0.5, w: 0.462, h: 0.5 }],
    shared: [psu(1, 0.436, 0.02, 0.102, 0.47), psu(2, 0.436, 0.51, 0.102, 0.47)],
    node: [
      I('slot', 'NIC 2', 0.07, 0.10, 0.32, 0.4, { nic: 2 }), I('slot', 'NIC 1', 0.54, 0.10, 0.33, 0.4, { nic: 1 }),
      I('aiom', 'AIOM', 0.06, 0.58, 0.33, 0.38, { id: 'AIOM', ports: 2, note: 'Port 1 is shared IPMI' }),
      I('vga', 'VGA', 0.47, 0.6, 0.14, 0.32), I('usb', 'USB', 0.63, 0.6, 0.08, 0.32), I('ipmi', 'IPMI', 0.72, 0.6, 0.09, 0.32, { id: 'IPMI' }),
      I('uid', 'UID', 0.835, 0.68, 0.03, 0.15), I('latch', 'Handle', 0.93, 0.1, 0.05, 0.5)
    ] };
  L['NX-3155-G9'] = { u: 2, items: [
    I('slot', 'Slot 1: NIC 3 or GPU 2', 0.07, 0.05, 0.23, 0.43, { nic: 3 }),
    I('slot', 'Slot 3: NIC 2 or GPU 3', 0.42, 0.05, 0.24, 0.2, { nic: 2 }), I('slot', 'Slot 4: NIC 1 or GPU 4', 0.42, 0.28, 0.24, 0.2, { nic: 1 }),
    I('slot', 'Slot 5: GPU 1', 0.70, 0.06, 0.25, 0.16), I('m2', 'Slot 6: M.2 air shroud', 0.70, 0.25, 0.25, 0.15),
    I('hba', 'Slot 7: HBA or NIC 3', 0.70, 0.43, 0.25, 0.15), I('m2', 'Slot 8: M.2', 0.70, 0.62, 0.25, 0.3)
  ].concat(g9io) };
  L['NX-8155-G9'] = { u: 2, items: [
    I('slot', 'Slot 1: NIC 1', 0.07, 0.05, 0.23, 0.36, { nic: 1 }), I('slot', 'Slot 3: NIC 2', 0.42, 0.05, 0.24, 0.36, { nic: 2 }),
    I('slot', 'Slot 5: NIC 3', 0.70, 0.05, 0.25, 0.36, { nic: 3 }), I('hba', 'Slot 7: HBA', 0.70, 0.45, 0.25, 0.17), I('m2', 'Slot 8: M.2', 0.70, 0.66, 0.25, 0.26)
  ].concat(g9io) };
  L['NX-8155A-G9'] = { u: 2, items: [
    I('slot', 'NIC 1 or L4 GPU', 0.07, 0.05, 0.23, 0.36, { nic: 1 }), I('slot', 'NIC 2 or L4 GPU', 0.42, 0.05, 0.24, 0.36, { nic: 2 }),
    I('slot', 'NIC 3 or L4/A16 GPU', 0.70, 0.05, 0.25, 0.36, { nic: 3 }), I('hba', 'HBA', 0.70, 0.45, 0.25, 0.17)
  ].concat(g9io) };
  L['NX-8150-G10'] = { u: 2, items: [
    I('slot', 'NIC 1 (x16)', 0.06, 0.08, 0.23, 0.33, { nic: 1 }), I('slot', 'NIC 2 (x16)', 0.43, 0.08, 0.24, 0.33, { nic: 2 }),
    I('slot', 'NIC 3 (x16)', 0.73, 0.08, 0.24, 0.33, { nic: 3 }), I('m2', 'M.2 drive x2', 0.73, 0.48, 0.24, 0.35)
  ].concat(g10io2u(0, 1, 2)) };
  L['NX-8150G-G10'] = { u: 2, items: [
    I('slot', 'GPU 1 / NIC 3', 0.06, 0.08, 0.23, 0.33, { nic: 3 }), I('slot', 'GPU 3 / NIC 1', 0.43, 0.08, 0.24, 0.33, { nic: 1 }),
    I('slot', 'GPU 2 / NIC 2', 0.73, 0.08, 0.24, 0.33, { nic: 2 }), I('m2', 'M.2 drive x2', 0.73, 0.48, 0.24, 0.27),
    I('slot', 'NIC 4 (x8, with GPU 1)', 0.73, 0.79, 0.24, 0.18, { nic: 4 })
  ].concat(g10io2u(0, 1, 2)) };
  L['NX-8155AS-G10'] = { u: 2, items: [
    I('slot', 'Slot 1: NIC 1 / GPU 3', 0.06, 0.08, 0.23, 0.33, { nic: 1 }), I('slot', 'Slot 3: NIC 2 / GPU 2', 0.43, 0.08, 0.24, 0.33, { nic: 2 }),
    I('slot', 'Slot 5: NIC 3 / GPU 1', 0.73, 0.08, 0.24, 0.33, { nic: 3 }), I('m2', 'Slot 8: M.2', 0.73, 0.78, 0.24, 0.19)
  ].concat(g10io2u(0, 1, 2)) };
  L['NX-8170-G10'] = r8170('Slot 1: HBA / NIC 3', 0);
  L['NX-8170A-G10'] = r8170('Slot 1: NIC 3', 1);
  L['NX-8173AS-G10'] = { u: 1, items: [
    psu(1, 0.005, 0.03, 0.175, 0.94), psu(2, 0.82, 0.03, 0.175, 0.94),
    I('slot', 'NIC 2 (slot 2)', 0.21, 0.08, 0.235, 0.4, { nic: 2 }), I('slot', 'NIC 1 (slot 1)', 0.53, 0.08, 0.24, 0.4, { nic: 1 }),
    I('aiom', 'AIOM 2', 0.205, 0.55, 0.17, 0.4, { id: 'AIOM2', ports: 2 }),
    I('uid', 'UID', 0.405, 0.65, 0.015, 0.2), I('ipmi', 'IPMI', 0.43, 0.58, 0.04, 0.33, { id: 'IPMI' }),
    I('usb', 'USB x2', 0.478, 0.55, 0.027, 0.4), I('vga', 'VGA', 0.525, 0.6, 0.065, 0.3),
    I('aiom', 'AIOM 1', 0.62, 0.55, 0.17, 0.4, { id: 'AIOM', ports: 2, note: 'Port 1 is IPMI failover' })
  ] };
  L['NX-9151-G9'] = { u: 2, items: [
    I('slot', 'GPU 2 (slot 2)', 0.005, 0.02, 0.305, 0.47), I('slot', 'GPU 1 (slot 1)', 0.005, 0.51, 0.305, 0.47),
    I('slot', 'NIC 3 (slot 7)', 0.34, 0.04, 0.23, 0.16, { nic: 3 }), I('slot', 'NIC 2 (slot 6)', 0.34, 0.27, 0.23, 0.16, { nic: 2 }),
    I('slot', 'NIC 1 (slot 5)', 0.34, 0.50, 0.23, 0.16, { nic: 1 }),
    I('uid', 'UID', 0.445, 0.86, 0.012, 0.08), I('ipmi', 'IPMI', 0.465, 0.78, 0.04, 0.15, { id: 'IPMI' }),
    I('usb', 'USB 3.0 x2', 0.51, 0.76, 0.04, 0.21), I('mdp', 'mini-DP', 0.555, 0.82, 0.018, 0.08),
    I('slot', 'GPU 4 (slot 4)', 0.62, 0.02, 0.3, 0.47), I('slot', 'GPU 3 (slot 3)', 0.62, 0.51, 0.3, 0.47),
    psu(3, 0.93, 0.28, 0.068, 0.2), psu(2, 0.93, 0.53, 0.068, 0.2), psu(1, 0.93, 0.77, 0.068, 0.2)
  ] };
  (function () { // NX-9183-G10, 4U: 13 slots across the top (narrow slots 5-8 and 13 hold NICs)
    const xs = { 13: [0.021, 0.063], 12: [0.068, 0.158], 11: [0.161, 0.249], 10: [0.253, 0.342], 9: [0.344, 0.435], 8: [0.439, 0.479], 7: [0.484, 0.526], 6: [0.529, 0.572], 5: [0.576, 0.616], 4: [0.621, 0.711], 3: [0.714, 0.803], 2: [0.805, 0.895], 1: [0.898, 0.986] };
    const nicOf = { 5: 1, 6: 2, 7: 3, 8: 4, 13: 5 };
    const items = Object.keys(xs).map((s) => I('slot', 'Slot ' + s + (nicOf[s] ? ' (NIC)' : ' (GPU)'), xs[s][0], 0.04, xs[s][1] - xs[s][0], 0.71, nicOf[s] ? { nic: nicOf[s], vertical: 1 } : { vertical: 1 }));
    L['NX-9183-G10'] = { u: 4, items: items.concat([
      psu(4, 0.005, 0.76, 0.169, 0.23), psu(3, 0.179, 0.76, 0.168, 0.23), psu(2, 0.637, 0.76, 0.168, 0.23), psu(1, 0.816, 0.76, 0.173, 0.23),
      I('lom', 'X710 LOM 10G', 0.37, 0.77, 0.056, 0.07, { id: 'LOM', ports: 2 }), I('vga', 'VGA', 0.566, 0.78, 0.044, 0.07),
      I('usb', 'USB x2', 0.368, 0.86, 0.037, 0.11), I('ipmi', 'IPMI', 0.414, 0.86, 0.03, 0.09, { id: 'IPMI' }),
      I('aiom', 'AIOM', 0.453, 0.86, 0.163, 0.12, { id: 'AIOM', ports: 2 })
    ]), notes: 'NIC numbering across slots 5, 6, 7, 8 and 13, and the left-to-right PSU order, are assumptions; the system specifications number the slots but not the NICs.' };
  })();
  window.NBL_REAR = L;
})();
