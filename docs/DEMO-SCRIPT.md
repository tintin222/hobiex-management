# Demo walkthrough (≈ 15 minutes)

A suggested path through the app for the Hobiex presentation. Every number is synthetic, but the
"story" items below are stable: they show up on every reload. Times, quantities and today's
counters move with the clock.

**Before you start:** open the app full-screen at 1440 px or wider. Pick EN or TR in the top bar
(the whole UI switches, including data labels). Use **user menu → Reset demo data** to start
clean.

---

## 1. Dashboard: "one screen for the production director" (2 min)
- **Units produced today vs. pace** for the daily target, plus live OEE, on-time delivery, scrap,
  and machines active.
- **Smart insights** (right). The system flags issues on its own:
  - 3 machines down: **WRB-11** (torch collision), **PRS-22** (hydraulic leak) and **LSR-31**
    (laser source alarm)
  - orders projected late
  - **SiC DPF core (RM-1303)** with ~1.7 days of cover
  - new B2B orders waiting
- Plant cards with OEE ring, output vs. target and WIP. The **plant filter** in the top bar
  scopes every screen.
- *Talking point:* "Today this lives in spreadsheets and phone calls. Here it is live, per
  plant, per shift."

## 2. Shop floor: live andon (2 min)
- Click the WRB-11 insight. The machine drawer opens with:
  - OEE broken into availability × performance × quality, and a 14-day trend
  - live sensors and the current job
  - the queue, downtime history and maintenance history
- Show **Mark repaired**. Then switch to **TV mode**, the board for a screen on the shop floor.
- *Talking point:* counters tick every few seconds, and the data comes from the operator
  terminals (step 6).

## 3. Planning: finite-capacity Gantt (2 min)
- Every operation sits on a real machine, with a red **now** line and night-shift bands.
- Drag a bar to reschedule it (15-minute snap), or click a bar to move it to a sibling machine.
- **Projected late work orders** → press **Apply** on a suggestion. The bar moves and the order
  is back on time.
- *Talking point:* capacity-checked promises instead of "we'll try".

## 4. Sales orders: B2B portal → production (2 min)
- The banner shows the connection to the **Hobiex B2B portal** that we already built.
- Open a **New** order and press **Release to production**. Work orders are created and
  scheduled on finite capacity, and a **promised date** is computed on the spot.
- *Talking point:* the order a distributor places on the portal is in the production plan
  seconds later, with no re-keying.

## 5. Work order detail (1 min)
- From the new order, open a work order:
  - routing with a mini-Gantt per operation, and standard vs. actual time
  - BOM availability
  - quality inspections and the activity log
- **Print traveler** produces a clean A4 job sheet.

## 6. Operator terminal: paperless shop floor (2 min)
- **Operator terminal** works on a tablet. Pick a plant, tap a name (or scan a badge), then pick
  a station (e.g. **WRB-12**).
- Show the job screen:
  - **START / PAUSE / COMPLETE**, **+1/+5/+10 good**, **Report scrap** with defect reasons (5+
    pieces offers an NCR)
  - **Report breakdown** stops the machine, creates an urgent maintenance order, and shows up on
    the dashboard and shop floor
  - **Call team lead** creates a task on the board
- *Talking point:* every count, stop and call is captured where it happens.

## 7. Task board: every production task in one place (1 min)
- Kanban across production, setup, quality, maintenance, material, logistics and engineering.
- Drag a card to **Blocked**; it asks for a reason. Open a card for its checklist, comments,
  time logged, and the linked work order and machine.

## 8. Quality: IATF 16949 (1.5 min)
- FPY, cost of poor quality, defect Pareto.
- Open an **NCR** and advance it through the 8D steps. The system won't let you skip root cause
  or disposition.
- **SPC** tab: control chart with UCL/LCL, spec limits and **Cp/Cpk** against the 1.33 target.

## 9. Traceability and recall simulation (1.5 min)
- Click a **serial** example chip to see the full genealogy: steel heat and lots → work order →
  each operation (machine, operator, time) → inspections → customer shipment.
- Click a **heat number**, which starts the **recall simulation**: units, customers and
  countries affected, in seconds. Then **Export containment list** (CSV).
- *Talking point:* an audit or customer complaint is answered in minutes, not days.

## 10. Inventory, maintenance, workforce (1 min)
- **Inventory:** SiC DPF core below safety stock, with a projected shortage date. **Receive
  goods** adds a lot with a heat number.
- **Maintenance:** PM calendar, overdue PMs, MTBF/MTTR, asset health score.
- **Workforce:** shift roster vs. required staffing, and an **ILUO skills matrix** with coverage
  risks per shift.

## Close
- Toggle **TR/EN** and **dark mode** live.
- *Next step:* connect the same screens to Hobiex's real data: B2B portal orders and products
  first, then machine signals and operator terminals. See "Connecting real data" in the README.

---

### Stable reference items
| What | ID |
|---|---|
| Machines down | WRB-11, PRS-22, LSR-31 |
| Work order on hold for material | DPF work order waiting on RM-1303 (SiC DPF core) |
| Low materials | RM-1303 (below safety), RM-1301, RM-1104, RM-1006 (below reorder point) |
| New B2B orders | 6, under Sales orders → New |
