# Nutanix Build Lab

An interactive, browser-based lab that shows what a Nutanix cluster looks like from different points of view. The first lab is a 6-node AHV cluster at RF2 on generic NX-style nodes. Every object in the diagrams can be clicked to view or edit it, and the lab can be shared as a link or exported as JSON.

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

- Click any object to open its settings in the side panel. Changes save to the browser automatically.
- **Share link** copies a URL that contains the full lab, so someone else opens the same design.
- **Export / Import** saves or loads the lab as JSON.
- **Reset sample** restores the 6-node sample (click twice to confirm).
- **Theme** switches between light and dark.

## Hosting on Cloudflare Pages

The site is plain HTML, CSS and JavaScript with no build step.

1. In Cloudflare Pages, connect this GitHub repository.
2. Framework preset: **None**. Build command: leave empty. Build output directory: `/`.
3. Every push to `main` redeploys the site.

To run it locally, open `index.html` in a browser, or serve the folder with any static web server (for example `python -m http.server`).

## Project layout

```
index.html        page shell, toolbar and tabs
css/style.css     light and dark theme, layout
js/sample.js      the sample 6-node lab (all values are examples)
js/app.js         views, editor panel, calculations, share/export
```

To change the default lab, edit `js/sample.js`. Bump `schema` only if the data structure changes.

## Notes on accuracy

- All names, IP addresses, hardware specs, CVM and Prism Central sizes are examples for learning.
- The usable capacity figure is a planning estimate: (raw minus rebuild reserve) x (1 minus a planning overhead you set) / RF. The overhead is a user assumption, not a Nutanix published number. Use Nutanix Sizer for real designs.
- Failure outcomes are simplified descriptions of expected behavior.
- Validate real designs against the official Nutanix documentation for your AOS and Prism Central release.

## Disclaimer

Independent community project. Not affiliated with or endorsed by Nutanix, Inc. Nutanix, AHV, AOS, Prism and related marks are trademarks of Nutanix, Inc.
