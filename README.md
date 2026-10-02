# Hobiex Production Management System — demo

A clickable demo of a production management system (MES-lite) for **Hobiex / Hobi Exhaust**
(Silivri, İstanbul). Hobiex makes exhaust and emission systems for trucks, buses and generators,
plus air and fuel tanks, across 4 plants. Every screen runs on **synthetic data**. No real Hobiex
data is used or needed.

> Built as a pitch: it shows how every production task, from a B2B order arriving to a muffler
> leaving on a truck, can be planned, executed, checked and traced in one system.

## Screens

| Area | Route | What it shows |
|---|---|---|
| Dashboard | `/` | Units today vs pace, live OEE, on-time delivery, scrap, machines active, hourly output, 30-day trend, downtime Pareto, smart insights, due-soon work orders |
| Task board | `/tasks` | Kanban for all production tasks (production, setup, quality, maintenance, material, logistics, engineering): drag & drop, checklists, comments, new tasks |
| Work orders | `/work-orders`, `/work-orders/[id]` | Every order with routing progress, due-date risk and material status. The detail page has an operation-level mini-Gantt, BOM availability, inspections and an activity log |
| Planning | `/planning` | Finite-capacity Gantt for every machine, with "now" line, rescheduling, machine reassignment, capacity load and late-order suggestions |
| Shop floor | `/shop-floor` | Live andon board per plant and line, machine drawer (OEE A×P×Q, sensors, job queue, downtime, maintenance), breakdown reporting, TV mode |
| Operator terminal | `/operator` | Tablet-first paperless terminal: badge sign-in, work instructions, start/pause/complete, good and scrap counts, breakdown and help calls |
| Quality | `/quality` | FPY, NCRs with an 8D workflow, inspections with measurements, defect Pareto, SPC control charts with Cp/Cpk |
| Traceability | `/traceability` | Serial/lot genealogy (heat number → work order → operations → inspections → customer shipment) and recall simulation |
| Maintenance | `/maintenance` | PM calendar, corrective/predictive/calibration work orders, MTBF/MTTR, asset health |
| Sales orders | `/orders` | Orders from the **B2B portal**, EDI, e-mail and sales reps. Turn a new order into scheduled work orders with one click |
| Inventory | `/inventory` | Raw materials with days of cover, lots/heat numbers, movements, receipts, cycle counts, finished goods |
| Products & BOM | `/products`, `/products/[id]` | Catalog with photos, BOM, routing, standard times and a cost roll-up |
| Workforce | `/workforce` | Directory, shift roster vs required staffing, ILUO skills matrix, certifications |

Every screen works in **English and Turkish** (EN/TR toggle) and in **light and dark** mode. The
global **plant filter** in the top bar applies everywhere. Global search (⌘K) finds work orders,
sales orders, SKUs, machines, materials, customers, NCRs and tasks.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
# or
npm run build && npm start
```

Requirements: Node 20+. No database, API keys or environment variables are needed.

Checks: `npm run typecheck`, `npm run lint`.

Deploying: any Node host works. On Vercel, import the repo and deploy with the defaults.

## How the synthetic data works

`src/lib/data/generate.ts` builds a consistent factory "world" in the browser from a fixed seed
(about 150 ms):

- **4 plants** with the public Hobiex product mix, **64 machines** (lasers, welding robots, seam
  welders, test benches, paint lines…), **~140 employees** on 3 shifts, **51 products** (MAN,
  Mercedes-Benz, Scania, Volvo, DAF, Iveco, Renault applications) and **39 fictional customers**
  in 34 countries.
- Work orders are generated per plant per day against each plant's daily target. They then go
  through a **finite-capacity forward scheduler**: every operation books the earliest free machine
  of its work-center type. Statuses, running operations, machine states, today's output and sales
  order progress all come from where *now* falls on that schedule, so every screen tells the same
  story.
- Dates are relative to today (Europe/Istanbul). Entities stay the same on every reload: the same
  machines are down and the same customers own the same orders. Only the clock moves things along.
- Interactions (dragging tasks, operator bookings, releasing B2B orders, NCR steps, stock receipts)
  change an in-memory store that is shared across screens. **Reset demo data** in the user menu
  restores the original state.

Company facts (plants, product families, OEMs served) come from Hobiex's public website. Product
photos and the logo are taken from hobiex.com. All names, part numbers, customers, suppliers,
quantities and KPIs are invented.

## Project structure

```
src/
  app/                    routes (thin server components)
  features/<module>/      screen code + messages.ts (EN/TR strings)
  components/ui/          design-system primitives (Card, DataTable, Drawer, StatusBadge, KpiTile…)
  components/charts/      Recharts theme (CVD-safe palette, tooltips, legends)
  components/layout/      app shell, sidebar, top bar
  lib/data/               domain types, catalog, synthetic generator, labels, clock
  lib/store.ts            client store + actions (all mutations)
  lib/hooks.ts            lookups, plant filter, insights
  lib/insights.ts         rule-based "smart insights"
  i18n/                   tiny EN/TR i18n
```

## Connecting real data later

All screens read from one `Dataset` shape (`src/lib/data/types.ts`) through `useDb()`. To go live,
swap the generator for an adapter that fills the same shape, for example from Next.js route
handlers. Sales orders, customers and products can come straight from the existing B2B portal
database. Machine states and counts can come from PLC/IoT gateways or operator terminal bookings.
The UI does not need to change.

## Tech

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Recharts 3 · Zustand ·
lucide-react · Outfit / Space Grotesk (self-hosted via Fontsource).
