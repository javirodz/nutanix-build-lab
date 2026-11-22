/* Sample 6-node Nutanix lab. Every value here is an editable example. */
window.NBL_SAMPLE = function () {
  const ip = (base, n) => { const p = base.split('.').map(Number); p[3] = n; return p.join('.'); };
  const nodes = [];
  for (let i = 0; i < 6; i++) {
    nodes.push({
      id: 'n' + (i + 1),
      name: 'NTX-N' + (i + 1),
      serial: 'EXAMPLE-SN-0' + (i + 1),
      hostIp: ip('10.10.10.0', 11 + i),
      cvmIp: ip('10.10.10.0', 31 + i),
      ipmiIp: ip('10.10.11.0', 11 + i),
      torAPort: 'Eth1/' + (i + 1),
      torBPort: 'Eth1/' + (i + 1),
      oobPort: 'Gi1/0/' + (i + 1)
    });
  }

  const vm = (name, vcpu, ramGB, diskGB, network, host, os) => ({ id: 'vm-' + name.toLowerCase(), name, vcpu, ramGB, diskGB, network, host, os });

  return {
    schema: 1,
    cluster: {
      name: 'NTX-LAB-01',
      aos: 'AOS 7.x (example)',
      hypervisor: 'AHV',
      rf: 2,
      vip: '10.10.10.50',
      dsip: '10.10.10.51',
      timezone: 'America/New_York'
    },
    hardware: {
      model: 'NX-series 1U single node (generic)',
      sockets: 2,
      coresPerSocket: 24,
      ramGB: 1024,
      diskType: 'NVMe',
      diskCount: 6,
      diskSizeTB: 3.84,
      bootDevice: '2x M.2 (mirrored)',
      dataNics: '2x 25GbE SFP28',
      bmc: '1x 1GbE BMC (IPMI)'
    },
    cvm: { vcpu: 12, ramGB: 32 },
    network: {
      mgmtVlan: 10,
      mgmtTagging: 'Native (untagged)',
      mgmtSubnet: '10.10.10.0/24',
      mgmtGateway: '10.10.10.1',
      ipmiVlan: 11,
      ipmiSubnet: '10.10.11.0/24',
      ipmiGateway: '10.10.11.1',
      virtualSwitch: 'vs0 (br0)',
      bondMode: 'active-backup',
      mtu: 1500,
      vmNetworks: [
        { id: 'net-prod', name: 'VM-Prod', vlan: 100, subnet: '10.10.100.0/24', gateway: '10.10.100.1' },
        { id: 'net-db', name: 'VM-DB', vlan: 110, subnet: '10.10.110.0/24', gateway: '10.10.110.1' },
        { id: 'net-dmz', name: 'VM-DMZ', vlan: 200, subnet: '10.10.200.0/24', gateway: '10.10.200.1' }
      ]
    },
    switches: [
      { id: 'torA', name: 'TOR-A', role: 'Top of rack (data)', model: '25GbE ToR switch (example)', mgmtIp: '10.10.11.2' },
      { id: 'torB', name: 'TOR-B', role: 'Top of rack (data)', model: '25GbE ToR switch (example)', mgmtIp: '10.10.11.3' },
      { id: 'oob', name: 'OOB-SW', role: 'Out-of-band (IPMI)', model: '1GbE access switch (example)', mgmtIp: '10.10.11.4' }
    ],
    nodes,
    pc: {
      name: 'PC-01',
      deployment: 'Single VM',
      size: 'Small',
      vcpu: 6,
      ramGB: 28,
      ip: '10.10.10.60',
      fqdn: 'pc01.lab.example',
      host: 'n1'
    },
    services: {
      dns: ['10.10.5.10', '10.10.5.11'],
      ntp: ['0.pool.ntp.org', '1.pool.ntp.org', '2.pool.ntp.org'],
      directory: 'lab.example (AD / LDAP)',
      smtp: 'smtp.lab.example:25',
      syslog: '10.10.5.20:514',
      lcmSource: 'Internet (Nutanix portal)',
      proxy: 'None'
    },
    storage: {
      planningOverheadPct: 10,
      containers: [
        { id: 'ctr-default', name: 'default-container', system: true, rf: 2, compression: true, dedup: false, ecx: false },
        { id: 'ctr-mgmt', name: 'NutanixManagementShare', system: true, rf: 2, compression: true, dedup: false, ecx: false },
        { id: 'ctr-prod', name: 'VM-Prod', system: false, rf: 2, compression: true, dedup: false, ecx: false }
      ]
    },
    vms: [
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
    ]
  };
};
