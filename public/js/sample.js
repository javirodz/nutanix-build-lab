/* Sample labs. Every value here is an editable example. */
(function () {
  const ip = (base, n) => { const p = base.split('.').map(Number); p[3] = n; return p.join('.'); };
  const vm = (name, vcpu, ramGB, diskGB, network, host, os) => ({ id: 'vm-' + name.toLowerCase(), name, vcpu, ramGB, diskGB, network, host, os });

  function makeNodes(count, twoByTwo) {
    const nodes = [];
    for (let i = 0; i < count; i++) {
      const n = {
        id: 'n' + (i + 1),
        name: 'NTX-N' + (i + 1),
        serial: 'EXAMPLE-SN-0' + (i + 1),
        hostIp: ip('10.10.10.0', 11 + i),
        cvmIp: ip('10.10.10.0', 31 + i),
        ipmiIp: ip('10.10.11.0', 11 + i),
        torAPort: 'Eth1/' + (i + 1),
        torBPort: 'Eth1/' + (i + 1),
        oobPort: 'Gi1/0/' + (i + 1)
      };
      if (twoByTwo) { n.torAPort2 = 'Eth1/' + (i + 17); n.torBPort2 = 'Eth1/' + (i + 17); }
      nodes.push(n);
    }
    return nodes;
  }

  function base(opts) {
    const twoByTwo = opts.layout === '2x2';
    const rf = opts.rf;
    return {
      schema: 1,
      preset: opts.preset,
      cluster: { name: opts.name, aos: 'AOS 7.x (example)', hypervisor: 'AHV', rf, vip: '10.10.10.50', dsip: '10.10.10.51', timezone: 'America/New_York', peAuth: 'Local admin only' },
      hardware: {
        platform: opts.platform || '',
        model: 'Generic node',
        sockets: 2, coresPerSocket: opts.cores || 24, ramGB: opts.ramGB || 1024,
        diskType: 'NVMe', diskCount: opts.disks || 6, diskSizeTB: 3.84,
        bootDevice: '2x M.2 (mirrored)',
        dataNics: twoByTwo ? '4x 25GbE SFP28 (2 dual-port cards)' : '2x 25GbE SFP28',
        bmc: '1x 1GbE BMC (IPMI)'
      },
      cvm: { vcpu: 12, ramGB: 32 },
      network: {
        layout: twoByTwo ? '2x2' : '1x2',
        mgmtVlan: 10, mgmtTagging: 'Native (untagged)', mgmtSubnet: '10.10.10.0/24', mgmtGateway: '10.10.10.1',
        ipmiVlan: 11, ipmiSubnet: '10.10.11.0/24', ipmiGateway: '10.10.11.1',
        virtualSwitch: 'vs0 (br0)', bondMode: 'active-backup',
        vmSwitch: 'vs1 (br1)', vmBondMode: 'balance-slb',
        mtu: 1500,
        vmNetworks: [
          { id: 'net-mgmt', name: opts.name + '-Mgmt', mgmt: true, subnet: '10.10.10.0/24', gateway: '10.10.10.1', vs: 'vs0' },
          { id: 'net-prod', name: 'VM-Prod', vlan: 100, subnet: '10.10.100.0/24', gateway: '10.10.100.1', vs: twoByTwo ? 'vs1' : 'vs0' },
          { id: 'net-db', name: 'VM-DB', vlan: 110, subnet: '10.10.110.0/24', gateway: '10.10.110.1', vs: twoByTwo ? 'vs1' : 'vs0' },
          { id: 'net-dmz', name: 'VM-DMZ', vlan: 200, subnet: '10.10.200.0/24', gateway: '10.10.200.1', vs: twoByTwo ? 'vs1' : 'vs0' }
        ]
      },
      switches: [
        { id: 'torA', name: 'TOR-A', role: 'Top of rack (data)', model: '25GbE ToR switch (example)', mgmtIp: '10.10.11.2' },
        { id: 'torB', name: 'TOR-B', role: 'Top of rack (data)', model: '25GbE ToR switch (example)', mgmtIp: '10.10.11.3' },
        { id: 'oob', name: 'OOB-SW', role: 'Out-of-band (IPMI)', model: '1GbE access switch (example)', mgmtIp: '10.10.11.4' }
      ],
      nodes: makeNodes(opts.nodes, twoByTwo),
      pc: { deployed: true, name: 'PC-01', deployment: 'Single VM', size: 'Small', vcpu: 6, ramGB: 28, ip: '10.10.10.60', fqdn: 'pc01.lab.example', host: 'n1' },
      services: {
        dns: ['10.10.5.10', '10.10.5.11'],
        ntp: ['0.pool.ntp.org', '1.pool.ntp.org', '2.pool.ntp.org'],
        directory: 'lab.example (Active Directory)', directoryTarget: 'Prism Central only', smtp: 'smtp.lab.example:25', syslog: '10.10.5.20:514',
        lcmSource: 'Internet (Nutanix portal)', proxy: 'None'
      },
      storage: {
        planningOverheadPct: 10,
        poolName: opts.name + '-SP',
        defaultContainerRemoved: true,
        containers: [
          { id: 'ctr-mgmt', name: 'NutanixManagementShare', system: true, rf, compression: true, dedup: false, ecx: false },
          { id: 'ctr-user', name: opts.name + '-CTR', system: false, rf, compression: true, dedup: false, ecx: false }
        ]
      },
      vms: opts.vms
    };
  }

  const sixVms = [
    vm('WEB-01', 4, 16, 100, 'net-dmz', 'n1', 'Linux'),
    vm('WEB-02', 4, 16, 100, 'net-dmz', 'n2', 'Linux'),
    vm('APP-01', 8, 32, 200, 'net-prod', 'n2', 'Windows'),
    vm('APP-02', 8, 32, 200, 'net-prod', 'n3', 'Windows'),
    vm('SQL-01', 16, 128, 1000, 'net-db', 'n4', 'Windows'),
    vm('SQL-02', 16, 128, 1000, 'net-db', 'n5', 'Windows'),
    vm('FILE-01', 4, 16, 2000, 'net-prod', 'n6', 'Windows'),
    vm('DC-01', 2, 8, 80, 'net-prod', 'n3', 'Windows'),
    vm('DC-02', 2, 8, 80, 'net-prod', 'n6', 'Windows'),
    vm('MON-01', 4, 16, 250, 'net-prod', 'n1', 'Linux')
  ];

  const PRESETS = {
    'six-rf2': {
      label: '6 nodes, RF2, 2x25GbE (one bond)', short: '6 nodes, RF2, one bond',
      build: () => base({ preset: 'six-rf2', name: 'NTX-LAB-01', nodes: 6, rf: 2, layout: '1x2', platform: 'NX-8170-G10', vms: sixVms.map((v) => Object.assign({}, v)) })
    },
    'three-rf2': {
      label: '3 nodes, RF2, 2x25GbE (one bond)', short: '3 nodes, RF2, one bond',
      build: () => base({ preset: 'three-rf2', name: 'NTX-LAB-03', nodes: 3, rf: 2, layout: '1x2', platform: 'NX-1175S-G10', cores: 16, ramGB: 512, disks: 4, vms: [
        vm('WEB-01', 4, 16, 100, 'net-dmz', 'n1', 'Linux'),
        vm('APP-01', 8, 32, 200, 'net-prod', 'n2', 'Windows'),
        vm('SQL-01', 8, 64, 500, 'net-db', 'n3', 'Windows'),
        vm('DC-01', 2, 8, 80, 'net-prod', 'n2', 'Windows'),
        vm('DC-02', 2, 8, 80, 'net-prod', 'n3', 'Windows')
      ] })
    },
    'six-rf3-2x2': {
      label: '6 nodes, RF3, 4x25GbE (two bonds: vs0 + vs1)', short: '6 nodes, RF3, two bonds',
      build: () => base({ preset: 'six-rf3-2x2', name: 'NTX-LAB-02', nodes: 6, rf: 3, layout: '2x2', platform: 'NX-8150-G10', vms: sixVms.map((v) => Object.assign({}, v)) })
    }
  };

  window.NBL_PRESETS = PRESETS;
  window.NBL_EMPTY = () => {
    const l = base({ preset: 'empty', name: 'NTX-LAB', nodes: 0, rf: 2, layout: '1x2', platform: 'NX-8170-G10', vms: [] });
    l.pc.deployed = false; l.pc.host = '';
    l.network.vmNetworks = [];
    l.storage.containers = [];
    return l;
  };
  window.NBL_SAMPLE = (id) => (PRESETS[id] || PRESETS['six-rf2']).build();
})();
