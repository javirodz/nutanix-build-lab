# Nutanix Build Lab

An interactive, browser-based lab that shows what a Nutanix cluster looks like from different points of view. Three sample labs are included: 6 nodes at RF2 with one bond, 3 nodes at RF2, and 6 nodes at RF3 with four uplinks in two bonds (vs0 for host and CVM traffic, vs1 for VM traffic). All use AHV on generic NX-style nodes and follow the same build standard: the default container is deleted, the storage pool and user container are renamed after the cluster, a default subnet named after the cluster sits on the management VLAN, and Active Directory is connected to Prism Central only (Prism Element keeps its local admin account). Every object in the diagrams can be clicked to view or edit it, and the lab can be shared as a link or exported as JSON.

Inspired by the NSX Build Lab at vconfig.pl.

## Views

| View | What it shows |
|---|---|
| Physical | 42U rack elevation, ToR and OOB switches, per-node cabling and IP plan, hardware profile |
| Network | Dual ToR with peer link, per-host 25GbE ports, br0-up bond, br0 / vs0, CVM eth0 and eth1, virbr0, VLANs |
| Storage | Containers, storage pool, drives per node, RF write path, capacity planning estimate |
| Resources | vCPU and memory per host (CVM, Prism Central, user VMs), cluster totals, N+1 HA memory check |
| VMs | VM placement per host, add, resize, move and delete VMs |
| Management | Prism Element, Prism Central registration, DNS, NTP, directory, SMTP, syslog, LCM source, proxy, IPMI |
| Failure scenarios | Toggle node, CVM, ToR switch and drive failures and read the expected cluster behavior |

## Using it

- **Node type** (Physical section) picks the NX platform for the whole cluster. The CPU, memory, storage, NIC and GPU options follow that model's Nutanix specification sheet, and the rack view draws the real form factor (1U1N, 2U1N, 2U2N, 2U4N, 4U1N) with rack space and power per block. A model number decoder explains each digit of the name.
- The Physical view shows the **rear panel** of the selected block (click a node in the rack to switch blocks), traced from the back panel figures in the Nutanix system specifications. Installed NIC cards, cabled ports and the switch port each one lands on are highlighted, and the Network view labels each host uplink with its real port (for example NIC1-1 or AIOM-2). Layouts are schematic, not to scale.

- The left menu works like the NSX Build Lab: start from an **Empty lab** or a **Completed example**, then pick an object type (nodes, switches, cluster, storage, networking, management, VMs) to open its view and list its objects in the side panel. The counts show how many of each exist.
- **Add-ons** (Flow Virtual Networking, Flow Network Security, Files, Objects, NDB, NKP, disaster recovery) are listed as coming soon.

- Click any object to open its settings in the side panel. Changes save to the browser automatically.
- **Share link** copies a URL that contains the full lab, so someone else opens the same design.
- **Export / Import** saves or loads the lab as JSON.
- Starting from an empty lab or an example replaces the current lab. Use **Undo** in the message that appears to go back.
- **Theme** switches between light and dark.

## Hosting on Cloudflare

The site is plain HTML, CSS and JavaScript with no build step. It is deployed as a Cloudflare Worker with static assets, connected to this GitHub repository.

- `wrangler.jsonc` points Cloudflare at the `public/` folder.
- Every push to `main` redeploys the site.

To run it locally, open `public/index.html` in a browser, or serve the `public/` folder with any static web server (for example `python -m http.server`).

## Project layout

```
wrangler.jsonc           Cloudflare deployment settings
public/index.html        page shell, toolbar and tabs
public/css/style.css     light and dark theme, layout
public/js/rear.js        rear panel layouts per NX model
public/js/platforms.js   NX platform data extracted from the Nutanix specification sheets and system specifications
public/js/sample.js      the sample lab presets (all values are examples)
public/js/app.js         views, editor panel, calculations, share/export
```

To change the sample labs, edit `public/js/sample.js`. Bump `schema` only if the data structure changes.

## Notes on accuracy

- All names, IP addresses, hardware specs, CVM and Prism Central sizes are examples for learning.
- The usable capacity figure is a planning estimate: (raw minus rebuild reserve) x (1 minus a planning overhead you set) / RF. The overhead is a user assumption, not a Nutanix published number. Use Nutanix Sizer for real designs.
- Failure outcomes are simplified descriptions of expected behavior.
- Validate real designs against the official Nutanix documentation for your AOS and Prism Central release.

## Disclaimer

Independent community project. Not affiliated with or endorsed by Nutanix, Inc. Nutanix, AHV, AOS, Prism and related marks are trademarks of Nutanix, Inc.
