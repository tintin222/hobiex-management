/**
 * Synthetic dataset generator.
 *
 * Work orders are produced per plant per day to roughly match each plant's
 * daily target, then pushed through a finite-capacity forward scheduler
 * (each operation books the earliest free machine of its work-center type).
 * Everything — operation states, machine states, today's output, sales order
 * progress — is then derived from where "now" falls on that schedule, so all
 * screens tell one consistent story.
 */
import {
  BOM_TEMPLATES,
  CATEGORY_IMAGE,
  CATEGORY_PLANT,
  COUNTRIES,
  CUSTOMERS,
  FIRST_NAMES,
  LAST_NAMES,
  MACHINE_META,
  MACHINE_PARK,
  MACHINE_SENSORS,
  MATERIALS,
  OEM_MODELS,
  PLANTS,
  PRODUCT_PLAN,
  SKU_PREFIX,
  routingFor,
} from "./catalog";
import { addDays, type Clock, DAY, HOUR, localDateOf, localHourOf, MIN, shiftOfHour } from "./clock";
import { OP_LABELS } from "./labels";
import { clamp, Rng, round } from "./rng";
import type {
  Customer,
  DailyProduction,
  Dataset,
  DefectType,
  DowntimeEvent,
  Employee,
  EmployeeRole,
  HourlyProduction,
  Inspection,
  InspectionType,
  Machine,
  MachineStatus,
  MaintenanceOrder,
  Material,
  Measurement,
  Ncr,
  Oem,
  OperationType,
  Plant,
  PlantId,
  Priority,
  Product,
  ProductCategory,
  SalesOrder,
  ShiftId,
  StockMovement,
  Task,
  TaskStatus,
  TaskType,
  WorkOrder,
  WorkOrderOperation,
} from "./types";

const SEED = 20_26_0310;

export function generateDataset(clock: Clock): Dataset {
  const rng = new Rng(SEED);
  const { now, today, dayStart } = clock;
  const iso = (ms: number) => new Date(ms).toISOString();
  const at = (dayOffset: number, hour = 0, minute = 0) => dayStart + dayOffset * DAY + hour * HOUR + minute * MIN;
  const yy = today.slice(2, 4);

  const plants: Plant[] = PLANTS.map((p) => ({ ...p, lines: [...p.lines] }));
  const plantNo = (id: PlantId) => Number(id.slice(1));

  // ───────────────────────────── Materials ─────────────────────────────
  const leadTimeFor: Record<string, [number, number]> = {
    sheet_metal: [7, 12],
    tube: [8, 14],
    flange_clamp: [5, 10],
    substrate: [28, 42],
    insulation: [7, 12],
    consumable: [3, 5],
    paint: [5, 9],
    packaging: [3, 5],
    component: [21, 35],
  };
  const lowStock = new Set(["RM-1303", "RM-1301", "RM-1104", "RM-1006"]);
  const materials: Material[] = MATERIALS.map(([id, name, nameTr, category, unit, unitCostEur, supplier, usage]) => {
    const [lt0, lt1] = leadTimeFor[category];
    const leadTimeDays = rng.int(lt0, lt1);
    const dailyUsage = round(usage * rng.range(0.85, 1.15), unit === "kg" || unit === "m" ? 0 : 0);
    const safetyStock = Math.ceil(dailyUsage * 3);
    const reorderPoint = Math.ceil(dailyUsage * leadTimeDays * 0.9 + safetyStock);
    let onHand: number;
    if (id === "RM-1303") onHand = Math.round(safetyStock * 0.55);
    else if (lowStock.has(id)) onHand = Math.round(reorderPoint * rng.range(0.6, 0.9));
    else onHand = Math.round(reorderPoint * rng.range(1.15, 2.6));
    const step = unit === "kg" ? 10 : 1;
    onHand = Math.round(onHand / step) * step;
    const reserved = Math.round((onHand * rng.range(0.2, 0.55)) / step) * step;
    const onOrder = onHand < reorderPoint ? Math.round(dailyUsage * leadTimeDays * 1.2) : rng.chance(0.4) ? Math.round(dailyUsage * rng.int(5, 15)) : 0;
    const zone = category === "sheet_metal" ? "A" : category === "tube" ? "B" : category === "packaging" ? "D" : "C";
    const location = `WH-${zone}-${String(rng.int(1, 18)).padStart(2, "0")}-${rng.int(1, 4)}`;
    const metallic = category === "sheet_metal" || category === "tube";
    const lots = Array.from({ length: rng.int(2, 4) }, (_, i) => {
      const daysAgo = rng.int(2 + i * 9, 10 + i * 12);
      return {
        lotNo: `RL${yy}${addDays(today, -daysAgo).slice(5, 7)}-${rng.digits(4)}`,
        heatNo: metallic ? `H${rng.digits(6)}` : undefined,
        qty: 0,
        receivedAt: addDays(today, -daysAgo),
        certificate: metallic ? "EN 10204 3.1" : category === "substrate" || category === "component" ? "CoC + PPAP L3" : "CoC",
      };
    });
    // split on-hand across lots, newest has the most
    let rest = onHand;
    lots.forEach((l, i) => {
      const share = i === lots.length - 1 ? rest : Math.round(rest * rng.range(0.45, 0.7));
      l.qty = share;
      rest -= share;
    });
    // 30-day on-hand history, built backwards from today's level
    const history: number[] = new Array(30);
    history[29] = onHand;
    const maxLevel = reorderPoint * 2.4;
    for (let i = 28; i >= 0; i--) {
      let h = history[i + 1] + dailyUsage * rng.range(0.6, 1.3);
      if (h > maxLevel) h -= dailyUsage * leadTimeDays * 1.3;
      history[i] = Math.max(0, Math.round(h));
    }
    return {
      id,
      code: id,
      name,
      nameTr,
      category,
      unit,
      onHand,
      reserved: Math.min(reserved, onHand),
      onOrder,
      reorderPoint,
      safetyStock,
      leadTimeDays,
      unitCostEur,
      supplier,
      location,
      dailyUsage,
      lots: lots.filter((l) => l.qty > 0),
      history,
    };
  });
  const materialById = new Map(materials.map((m) => [m.id, m]));

  // ───────────────────────────── Products ─────────────────────────────
  const products: Product[] = [];
  const oems = Object.keys(OEM_MODELS) as Exclude<Oem, "Universal">[];
  const oemRef = (oem: Oem): string => {
    switch (oem) {
      case "MAN":
        return `81.15${rng.digits(3)}-${rng.digits(4)}`;
      case "Mercedes-Benz":
        return `A ${rng.digits(3)} ${rng.digits(3)} ${rng.digits(2)} ${rng.digits(2)}`;
      case "Scania":
        return rng.digits(7);
      case "Volvo":
        return rng.digits(8);
      case "DAF":
        return rng.digits(7);
      case "Iveco":
        return rng.digits(10);
      case "Renault":
        return `74${rng.digits(8)}`;
      default:
        return `HBX-${rng.digits(5)}`;
    }
  };
  for (const [cat, count] of PRODUCT_PLAN) {
    const combos = rng.sample(
      oems.flatMap((o) => OEM_MODELS[o].map((m) => [o, m] as const)),
      count,
    );
    const sizes: Record<string, number[]> = {
      air_tank: rng.sample([20, 25, 30, 40, 45, 60, 80], count),
      fuel_tank: rng.sample([300, 400, 450, 500, 600, 700, 800], count),
    };
    for (let i = 0; i < count; i++) {
      let [oem, model] = combos[i] as readonly [Oem, string];
      let name = "";
      let euroNorm: Product["euroNorm"] = "—";
      let weightKg = 0;
      let sizeFactor = 1;
      switch (cat) {
        case "muffler":
          euroNorm = rng.weighted([["Euro 3", 2], ["Euro 5", 4], ["Euro 6", 5]] as const);
          name = `Exhaust Muffler · ${oem} ${model}`;
          weightKg = rng.range(18, 32);
          break;
        case "scr_muffler":
          euroNorm = "Euro 6";
          name = `SCR Muffler · ${oem} ${model}`;
          weightKg = rng.range(38, 55);
          break;
        case "dpf":
          euroNorm = "Euro 6";
          name = `DPF Filter · ${oem} ${model}`;
          weightKg = rng.range(22, 30);
          break;
        case "manifold":
          name = `Exhaust Manifold · ${oem} ${model}`;
          weightKg = rng.range(9, 14);
          break;
        case "air_tank": {
          const vol = sizes.air_tank[i];
          const dia = vol <= 30 ? 246 : vol <= 45 ? 276 : 310;
          name = `Air Tank ${vol} L · Ø${dia} · ${oem}`;
          weightKg = vol * 0.32 + 2;
          sizeFactor = vol / 40;
          break;
        }
        case "fuel_tank": {
          const vol = sizes.fuel_tank[i];
          name = `Fuel Tank ${vol} L · Aluminium · ${oem} ${model}`;
          weightKg = vol * 0.055 + 8;
          sizeFactor = vol / 500;
          break;
        }
        case "insulated_pipe": {
          oem = "Universal";
          model = "";
          const d = [76, 102, 127][i % 3];
          const len = [1000, 1500, 600][i % 3];
          name = `Insulated Exhaust Pipe Ø${d} × ${len} mm`;
          weightKg = (d / 76) * (len / 1000) * 4.2;
          sizeFactor = (d / 102) * (len / 1000);
          break;
        }
        case "generator_exhaust": {
          oem = "Universal";
          model = "";
          const kva = [250, 500, 1000][i % 3];
          const grade = ["Residential Grade", "Critical Grade", "Industrial Grade"][i % 3];
          name = `Generator Silencer ${kva} kVA · ${grade}`;
          euroNorm = "Stage V";
          weightKg = kva * 0.38 + 40;
          sizeFactor = kva / 500;
          break;
        }
        case "brake_valve": {
          const d = [90, 100][i % 2];
          name = `Exhaust Brake Valve Ø${d} · ${oem}`;
          weightKg = rng.range(3.5, 5);
          break;
        }
        case "nox_sensor":
          euroNorm = "Euro 6";
          name = `NOx Sensor 24 V · ${oem}`;
          weightKg = 0.62;
          break;
      }
      const routing = routingFor(cat);
      const bom = BOM_TEMPLATES[cat].map(([materialId, q]) => ({
        materialId,
        qtyPerUnit: round(q * (["air_tank", "fuel_tank", "insulated_pipe", "generator_exhaust"].includes(cat) ? sizeFactor : 1) * rng.range(0.9, 1.1), 2),
      }));
      const matCost = bom.reduce((s, b) => s + b.qtyPerUnit * (materialById.get(b.materialId)?.unitCostEur ?? 0), 0);
      const laborMin = routing.reduce((s, r) => s + r.cycleMin, 0);
      const unitCostEur = round(matCost + laborMin * 0.62 + 4, 2);
      products.push({
        id: `PRD-${cat}-${i + 1}`,
        sku: `HBX-${SKU_PREFIX[cat]}-${1000 + products.length * 17 + rng.int(0, 9)}`,
        name,
        category: cat,
        oem,
        model,
        oemRef: oemRef(oem),
        euroNorm,
        weightKg: round(weightKg, 1),
        unitCostEur,
        listPriceEur: round(unitCostEur * rng.range(1.35, 1.6), 0),
        plantId: CATEGORY_PLANT[cat],
        image: CATEGORY_IMAGE[cat],
        routing,
        bom,
        stockQty: 0,
        safetyStock: 0,
        monthlyDemand: 0,
        drawingRev: `Rev ${rng.pick(["A", "B", "C", "C", "D", "E"])}`,
        active: true,
      });
    }
  }
  // demand weights per plant so generated volume matches targets
  const categoryShare: Record<ProductCategory, number> = {
    muffler: 0.6,
    scr_muffler: 0.4,
    air_tank: 0.68,
    fuel_tank: 0.32,
    dpf: 0.2,
    manifold: 0.28,
    brake_valve: 0.26,
    nox_sensor: 0.26,
    insulated_pipe: 0.965,
    generator_exhaust: 0.035,
  };
  for (const p of products) {
    const siblings = products.filter((q) => q.category === p.category).length;
    const plant = plants.find((pl) => pl.id === p.plantId)!;
    const w = rng.range(0.6, 1.4);
    p.monthlyDemand = Math.round(((plant.dailyTarget * 26 * categoryShare[p.category]) / siblings) * w);
    p.safetyStock = Math.round(p.monthlyDemand * 0.12);
    p.stockQty = Math.round(p.monthlyDemand * rng.range(0.05, 0.5));
  }
  const productById = new Map(products.map((p) => [p.id, p]));

  // ───────────────────────────── Machines ─────────────────────────────
  const machines: Machine[] = [];
  for (const plant of plants) {
    let idx = 0;
    for (const [type, count] of MACHINE_PARK[plant.id]) {
      const meta = MACHINE_META[type];
      for (let i = 1; i <= count; i++) {
        const id = `${meta.prefix}-${plantNo(plant.id)}${i}`;
        machines.push({
          id,
          name: `${meta.name} ${plantNo(plant.id)}${i}`,
          model: meta.models[(i - 1) % meta.models.length],
          type,
          plantId: plant.id,
          line: plant.lines[idx % plant.lines.length],
          status: "idle",
          statusSince: iso(now - rng.int(5, 140) * MIN),
          availability: 0,
          performance: 0,
          quality: 0,
          oee: 0,
          outputToday: 0,
          targetToday: 0,
          runtimeHoursTotal: rng.int(4000, 52000),
          installedYear: rng.int(2009, 2024),
          mtbfHours: rng.int(90, 420),
          mttrHours: round(rng.range(0.7, 3.8), 1),
          lastPm: addDays(today, -rng.int(3, 40)),
          nextPm: addDays(today, rng.int(-3, 35)),
          oeeTrend: [],
          sensors: [],
        });
        idx++;
      }
    }
  }
  const machinesByKey = new Map<string, Machine[]>();
  for (const m of machines) {
    const k = `${m.plantId}:${m.type}`;
    if (!machinesByKey.has(k)) machinesByKey.set(k, []);
    machinesByKey.get(k)!.push(m);
  }

  // ───────────────────────────── Employees ─────────────────────────────
  const employees: Employee[] = [];
  const usedNames = new Set<string>();
  const nextName = () => {
    for (;;) {
      const n = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
      if (!usedNames.has(n)) {
        usedNames.add(n);
        return n;
      }
    }
  };
  const currentShift = shiftOfHour(clock.hour);
  const plantOps = (pid: PlantId): OperationType[] => {
    const ops = new Set<OperationType>();
    products.filter((p) => p.plantId === pid).forEach((p) => p.routing.forEach((r) => ops.add(r.operation)));
    return [...ops];
  };
  const staffPlan: Record<PlantId, [EmployeeRole, number][]> = {
    P1: [["supervisor", 2], ["team_lead", 3], ["planner", 1], ["qc_inspector", 4], ["maintenance_tech", 3], ["warehouse", 2], ["welder", 12], ["operator", 19]],
    P2: [["supervisor", 1], ["team_lead", 3], ["planner", 1], ["qc_inspector", 3], ["maintenance_tech", 3], ["warehouse", 2], ["welder", 9], ["operator", 16]],
    P3: [["supervisor", 1], ["team_lead", 3], ["planner", 1], ["qc_inspector", 3], ["maintenance_tech", 2], ["warehouse", 2], ["welder", 5], ["operator", 13]],
    P4: [["supervisor", 1], ["team_lead", 3], ["planner", 1], ["qc_inspector", 2], ["maintenance_tech", 2], ["warehouse", 1], ["welder", 6], ["operator", 10]],
  };
  const weldOps: OperationType[] = ["robotic_welding", "manual_welding", "seam_welding"];
  let empNo = 1001;
  for (const plant of plants) {
    const ops = plantOps(plant.id);
    let shiftIdx = 0;
    for (const [role, n] of staffPlan[plant.id]) {
      for (let i = 0; i < n; i++) {
        const shift: ShiftId = role === "planner" ? "A" : (["A", "B", "C"] as const)[shiftIdx++ % 3];
        const skills: Employee["skills"] = {};
        const certs: string[] = [];
        if (role === "welder") {
          weldOps.filter((o) => ops.includes(o)).forEach((o) => (skills[o] = rng.int(2, 4)));
          rng.sample(ops.filter((o) => !weldOps.includes(o)), 2).forEach((o) => (skills[o] = rng.int(1, 3)));
          certs.push(rng.pick(["EN ISO 9606-1 · 135 P BW", "EN ISO 9606-1 · 135 P FW", "EN ISO 9606-1 · 141 T BW"]));
          if (rng.chance(0.4)) certs.push("EN ISO 14732 · Robot welding operator");
        } else if (role === "operator" || role === "team_lead") {
          rng.sample(ops.filter((o) => !weldOps.includes(o)), rng.int(3, 6)).forEach((o) => (skills[o] = rng.int(1, role === "team_lead" ? 4 : 3)));
          if (role === "team_lead") {
            ops.forEach((o) => (skills[o] = Math.max(skills[o] ?? 0, rng.int(2, 4))));
            certs.push("Lean / 5S Practitioner");
          }
          if (rng.chance(0.3)) certs.push("Forklift licence");
        } else if (role === "qc_inspector") {
          (["leak_test", "pressure_test", "final_inspection"] as OperationType[]).filter((o) => ops.includes(o)).forEach((o) => (skills[o] = rng.int(3, 4)));
          certs.push("VT Level 2 · EN ISO 9712");
          if (rng.chance(0.5)) certs.push("LT Level 2 · EN ISO 9712");
          if (rng.chance(0.4)) certs.push("IATF 16949 Internal Auditor");
        } else if (role === "maintenance_tech") {
          certs.push(rng.pick(["Hydraulics L2", "Industrial Electrics L3", "Robot programming (6-axis)"]));
          certs.push("LOTO authorised");
        } else if (role === "warehouse") {
          skills.packing = rng.int(2, 4);
          certs.push("Forklift licence");
        } else if (role === "supervisor") {
          ops.forEach((o) => (skills[o] = rng.int(2, 4)));
          certs.push("IATF 16949 Core Tools");
        }
        const absent = rng.chance(0.06);
        employees.push({
          id: `E${empNo++}`,
          name: nextName(),
          role,
          plantId: plant.id,
          shift,
          skills,
          certifications: certs,
          hireDate: addDays(today, -rng.int(120, 9000)),
          status: absent ? rng.pick(["leave", "sick"] as const) : shift === currentShift || role === "planner" ? (role === "planner" && (clock.hour < 8 || clock.hour >= 18) ? "off_shift" : "on_shift") : "off_shift",
          efficiency: round(rng.range(0.82, 1.18), 2),
          phone: `+90 5${rng.int(30, 55)} ${rng.digits(3)} ${rng.digits(2)} ${rng.digits(2)}`,
          avatarHue: rng.int(0, 359),
        });
      }
    }
  }
  const staffFor = (pid: PlantId, shift: ShiftId, op: OperationType) => {
    const roles: EmployeeRole[] = weldOps.includes(op) ? ["welder"] : op === "final_inspection" || op === "leak_test" || op === "pressure_test" ? ["qc_inspector", "operator"] : op === "packing" ? ["warehouse", "operator"] : ["operator", "team_lead"];
    const pool = employees.filter((e) => e.plantId === pid && e.shift === shift && roles.includes(e.role));
    return pool.length ? pool : employees.filter((e) => e.plantId === pid && roles.includes(e.role));
  };
  const plannerOf = (pid: PlantId) => employees.find((e) => e.plantId === pid && e.role === "planner")!.id;

  // ───────────────────────────── Customers ─────────────────────────────
  const customers: Customer[] = CUSTOMERS.map(([name, cc, city, segment, channel], i) => ({
    id: `C${String(101 + i)}`,
    name,
    country: COUNTRIES[cc].en,
    countryTr: COUNTRIES[cc].tr,
    countryCode: cc,
    city,
    segment,
    channel,
    creditLimitEur: rng.pick([50000, 75000, 100000, 150000, 250000, 400000]),
    since: rng.int(2001, 2023),
  }));

  // ───────────────────── Work orders + finite-capacity schedule ─────────────────────
  const START_DAY = -21;
  const END_DAY = 12;
  const qtyRange: Record<ProductCategory, [number, number, number]> = {
    muffler: [40, 240, 10],
    scr_muffler: [30, 160, 10],
    dpf: [20, 100, 5],
    manifold: [40, 200, 10],
    air_tank: [60, 300, 20],
    fuel_tank: [20, 120, 10],
    insulated_pipe: [50, 250, 10],
    generator_exhaust: [2, 10, 1],
    brake_valve: [50, 200, 10],
    nox_sensor: [50, 250, 10],
  };
  type Draft = { product: Product; qty: number; release: number; priority: Priority; mto: boolean };
  const drafts: Draft[] = [];
  for (let d = START_DAY; d <= END_DAY; d++) {
    for (const plant of plants) {
      const pool = products.filter((p) => p.plantId === plant.id);
      let remaining = plant.dailyTarget * rng.range(0.8, 0.92);
      while (remaining > 0) {
        // weight by demand in units ÷ typical lot size, so the unit mix follows demand
        const product = rng.weighted(pool.map((p) => [p, p.monthlyDemand / ((qtyRange[p.category][0] + qtyRange[p.category][1]) / 2)] as const));
        const [lo, hi, step] = qtyRange[product.category];
        const qty = Math.round(rng.range(lo, hi) / step) * step || step;
        remaining -= qty;
        drafts.push({
          product,
          qty,
          release: at(d, rng.int(0, 21), rng.pick([0, 15, 30, 45])),
          priority: rng.weighted([["low", 1], ["normal", 6], ["high", 2.2], ["urgent", 0.8]] as const),
          mto: rng.chance(0.72),
        });
      }
    }
  }
  drafts.sort((a, b) => a.release - b.release);

  const freeAt = new Map<string, number>(machines.map((m) => [m.id, at(START_DAY)]));
  const workOrders: WorkOrder[] = [];
  let woNo = 10120;
  const leadDays: Record<Priority, [number, number]> = { urgent: [1, 2], high: [2, 3], normal: [2, 6], low: [5, 9] };
  for (const dft of drafts) {
    const id = `WO-${yy}-${woNo++}`;
    let t = dft.release;
    const ops: WorkOrderOperation[] = dft.product.routing.map((step) => {
      const candidates = machinesByKey.get(`${dft.product.plantId}:${step.workCenterType}`)!;
      let best = candidates[0];
      let bestStart = Infinity;
      for (const m of candidates) {
        const s = Math.max(freeAt.get(m.id)!, t);
        if (s < bestStart) {
          bestStart = s;
          best = m;
        }
      }
      const stdMinutes = Math.round(step.setupMin + step.cycleMin * dft.qty);
      const dur = Math.max(10, stdMinutes * rng.range(1.04, 1.18)) * MIN;
      const start = bestStart;
      const end = start + dur;
      freeAt.set(best.id, end + rng.int(0, 12) * MIN);
      t = end + rng.int(10, 50) * MIN;
      return {
        id: `${id}-${step.seq}`,
        seq: step.seq,
        operation: step.operation,
        machineId: best.id,
        status: "pending",
        plannedStart: iso(start),
        plannedEnd: iso(end),
        stdMinutes,
        actualMinutes: 0,
        qtyDone: 0,
        qtyScrap: 0,
      };
    });
    const [l0, l1] = leadDays[dft.priority];
    workOrders.push({
      id,
      productId: dft.product.id,
      qty: dft.qty,
      qtyDone: 0,
      qtyScrap: 0,
      plantId: dft.product.plantId,
      status: "planned",
      priority: dft.priority,
      createdAt: iso(dft.release - rng.int(4, 72) * HOUR),
      plannedStart: ops[0].plannedStart,
      plannedEnd: ops[ops.length - 1].plannedEnd,
      dueDate: localDateOf(dft.release + rng.int(l0, l1) * DAY),
      operations: ops,
      lotNo: `L${yy}${localDateOf(dft.release).slice(5, 7)}-${String(woNo).slice(-4)}`,
      plannerId: plannerOf(dft.product.plantId),
      materialStatus: "available",
      customerId: dft.mto ? "pending" : undefined,
    });
  }

  // derive execution state from "now"
  const scrapRate = () => (rng.chance(0.55) ? 0 : rng.range(0.002, 0.02));
  for (const wo of workOrders) {
    let input = wo.qty;
    let scrapTotal = 0;
    for (const op of wo.operations) {
      const s = Date.parse(op.plannedStart);
      const e = Date.parse(op.plannedEnd);
      const shift = shiftOfHour(localHourOf(op.plannedStart));
      if (e <= now) {
        const jitter = rng.int(-8, 18) * MIN;
        op.status = "done";
        op.actualStart = iso(s + jitter);
        op.actualEnd = iso(Math.min(now - MIN, e + jitter + rng.int(-10, 25) * MIN));
        op.actualMinutes = Math.round((Date.parse(op.actualEnd) - Date.parse(op.actualStart)) / MIN);
        op.qtyScrap = Math.round(input * scrapRate());
        op.qtyDone = input - op.qtyScrap;
        op.operatorId = rng.pick(staffFor(wo.plantId, shift, op.operation)).id;
        scrapTotal += op.qtyScrap;
        input = op.qtyDone;
      } else if (s <= now) {
        const frac = (now - s) / (e - s);
        op.status = "running";
        op.actualStart = iso(s + rng.int(-5, 10) * MIN);
        op.actualMinutes = Math.round((now - Date.parse(op.actualStart)) / MIN);
        op.qtyScrap = rng.chance(0.3) ? rng.int(1, 2) : 0;
        op.qtyDone = Math.max(0, Math.floor(input * frac) - op.qtyScrap);
        op.operatorId = rng.pick(staffFor(wo.plantId, currentShift, op.operation)).id;
        scrapTotal += op.qtyScrap;
      }
    }
    const done = wo.operations.filter((o) => o.status === "done").length;
    const running = wo.operations.find((o) => o.status === "running");
    wo.qtyScrap = scrapTotal;
    if (done === wo.operations.length) {
      wo.status = "completed";
      wo.qtyDone = wo.operations[wo.operations.length - 1].qtyDone;
      wo.actualStart = wo.operations[0].actualStart;
      wo.actualEnd = wo.operations[wo.operations.length - 1].actualEnd;
    } else if (done === 0 && !running) {
      const startsIn = Date.parse(wo.plannedStart) - now;
      wo.status = startsIn < 36 * HOUR ? "released" : "planned";
      wo.operations[0].status = wo.status === "released" ? "ready" : "pending";
    } else {
      wo.actualStart = wo.operations[0].actualStart;
      wo.status = running?.operation === "final_inspection" ? "quality_check" : "in_progress";
      wo.qtyDone = 0;
      if (!running) {
        const next = wo.operations.find((o) => o.status === "pending");
        if (next) next.status = "ready";
      }
    }
  }

  // machine live state from the schedule
  const runningOps = new Map<string, { wo: WorkOrder; op: WorkOrderOperation }>();
  for (const wo of workOrders) for (const op of wo.operations) if (op.status === "running") runningOps.set(op.machineId, { wo, op });

  const downReasonsByType: Partial<Record<Machine["type"], [string, string][]>> = {
    weld_robot: [["Wire feeder fault — motor overcurrent", "Tel sürücü arızası — motor aşırı akım"], ["Torch collision — TCP recalibration needed", "Torç çarpması — TCP kalibrasyonu gerekli"]],
    laser: [["Laser source alarm E-412", "Lazer kaynağı alarmı E-412"], ["Chiller over-temperature alarm", "Soğutucu aşırı sıcaklık alarmı"]],
    press: [["Hydraulic leak on main cylinder", "Ana silindirde hidrolik kaçak"]],
    paint_line: [["Conveyor chain broken", "Konveyör zinciri koptu"]],
    cnc: [["Spindle drive overcurrent", "İş mili sürücüsü aşırı akım"]],
    seam_welder: [["Seam tracking sensor failure", "Dikiş takip sensörü arızası"]],
    tube_bender: [["Servo drive overcurrent on axis 3", "3. eksen servo sürücü aşırı akım"]],
    roller: [["Hydraulic pressure drop on top roll", "Üst merdanede hidrolik basınç düşüşü"]],
    canning: [["Press force sensor out of calibration", "Pres kuvvet sensörü kalibrasyon dışı"]],
    insulation: [["Wrapping head jammed", "Sarma kafası sıkıştı"]],
    weld_station: [["Welding power source fault E-07", "Kaynak güç ünitesi arızası E-07"]],
  };
  const downReasonsTr: Record<string, string> = Object.fromEntries(Object.values(downReasonsByType).flat());
  // pick 3 running machines in different plants to be "down" right now
  const downIds = new Set<string>();
  const usedPlants = new Set<PlantId>();
  for (const id of rng.shuffle([...runningOps.keys()])) {
    const m = machines.find((x) => x.id === id)!;
    if (!downReasonsByType[m.type] || usedPlants.has(m.plantId)) continue;
    downIds.add(id);
    usedPlants.add(m.plantId);
    if (downIds.size === 3) break;
  }
  const holdWoIds = new Set<string>();
  const holdReasons = [
    "Material shortage — SiC DPF core (RM-1303)",
    "Quality hold — weld porosity investigation",
    "Customer requested drawing change (Rev D)",
    "Waiting for fixture repair",
  ];
  // put 4 in-progress work orders on hold (not on the down machines)
  const holdCandidates = rng.shuffle(
    [...runningOps.values()].filter(({ op, wo }) => !downIds.has(op.machineId) && wo.status === "in_progress"),
  );
  const dpfHold = holdCandidates.find(({ wo }) => productById.get(wo.productId)!.category === "dpf");
  const holds = [dpfHold, ...holdCandidates.filter((c) => c !== dpfHold)].filter(Boolean).slice(0, 4) as { wo: WorkOrder; op: WorkOrderOperation }[];
  holds.forEach(({ wo, op }, i) => {
    wo.status = "on_hold";
    wo.holdReason = productById.get(wo.productId)!.category === "dpf" && i === 0 ? holdReasons[0] : holdReasons[1 + (i % 3)];
    op.status = "paused";
    holdWoIds.add(wo.id);
    runningOps.delete(op.machineId);
  });

  const nextOpOn = new Map<string, { wo: WorkOrder; op: WorkOrderOperation }>();
  for (const wo of workOrders)
    for (const op of wo.operations) {
      if (op.status !== "pending" && op.status !== "ready") continue;
      const cur = nextOpOn.get(op.machineId);
      if (Date.parse(op.plannedStart) > now && (!cur || op.plannedStart < cur.op.plannedStart)) nextOpOn.set(op.machineId, { wo, op });
    }
  for (const m of machines) {
    const r = runningOps.get(m.id);
    let status: MachineStatus;
    if (downIds.has(m.id)) {
      status = "down";
      m.downReason = rng.pick(downReasonsByType[m.type]!)[0];
      m.statusSince = iso(now - rng.int(25, 150) * MIN);
      if (r) {
        r.op.status = "paused";
        m.currentWoId = r.wo.id;
        m.currentOpId = r.op.id;
      }
    } else if (r) {
      const sinceStart = now - Date.parse(r.op.plannedStart);
      const setupMs = (productById.get(r.wo.productId)!.routing.find((s) => s.operation === r.op.operation)?.setupMin ?? 0) * MIN;
      status = sinceStart < setupMs ? "setup" : "running";
      m.currentWoId = r.wo.id;
      m.currentOpId = r.op.id;
      m.operatorId = r.op.operatorId;
      m.statusSince = r.op.actualStart ?? r.op.plannedStart;
    } else {
      const upcoming = nextOpOn.get(m.id);
      if (upcoming && Date.parse(upcoming.op.plannedStart) - now < 100 * MIN) {
        status = "setup";
        m.currentWoId = upcoming.wo.id;
        m.currentOpId = upcoming.op.id;
        m.operatorId = rng.pick(staffFor(m.plantId, currentShift, upcoming.op.operation)).id;
      } else status = rng.chance(0.1) ? "maintenance" : "idle";
      m.statusSince = iso(now - rng.int(10, 180) * MIN);
    }
    m.status = status;
  }
  // a downed machine's work order is effectively blocked
  for (const m of machines) if (m.status === "down" && m.currentWoId) {
    const wo = workOrders.find((w) => w.id === m.currentWoId)!;
    if (wo.status === "in_progress" || wo.status === "quality_check") wo.status = "in_progress";
  }

  // machine KPIs + today's throughput
  const dayEnd = dayStart + DAY;
  for (const m of machines) {
    let outToday = 0;
    let tgtToday = 0;
    for (const wo of workOrders) {
      for (const op of wo.operations) {
        if (op.machineId !== m.id) continue;
        const s = Date.parse(op.plannedStart);
        const e = Date.parse(op.plannedEnd);
        const len = e - s;
        if (e <= dayStart || s >= dayEnd) continue;
        tgtToday += (wo.qty * (Math.min(e, dayEnd) - Math.max(s, dayStart))) / len;
        if (op.status === "done") outToday += (op.qtyDone * (Math.min(e, now) - Math.max(s, dayStart))) / len;
        else if (op.status === "running" || op.status === "paused") {
          const portion = (Math.min(now, e) - Math.max(s, dayStart)) / Math.max(1, now - s);
          outToday += op.qtyDone * clamp(portion, 0, 1);
        }
      }
    }
    m.outputToday = Math.max(0, Math.round(outToday));
    m.targetToday = Math.round(tgtToday);
    const down = m.status === "down";
    m.availability = round(down ? rng.range(0.62, 0.74) : rng.range(0.8, 0.96), 3);
    m.performance = round(rng.range(0.8, 0.97), 3);
    m.quality = round(rng.range(0.975, 0.998), 3);
    m.oee = round(m.availability * m.performance * m.quality, 3);
    let o = m.oee * rng.range(0.92, 1.05);
    m.oeeTrend = Array.from({ length: 14 }, (_, i) => {
      o = clamp(o + rng.normal(0, 0.025), 0.5, 0.93);
      return round(i === 13 ? m.oee : o, 3);
    });
    m.sensors = MACHINE_SENSORS[m.type].map(([label, nominal, unit, spread]) => {
      const off = m.status === "idle" || m.status === "maintenance";
      const warn = (down && rng.chance(0.7)) || rng.chance(0.04);
      const value = off && !/temp|Gauge|accuracy|OK rate/i.test(label) ? 0 : nominal + rng.normal(0, spread * 0.4) + (warn ? spread * 1.8 : 0);
      return { label, value: round(value, nominal < 10 ? 2 : 0), unit, warn: warn || undefined };
    });
  }

  // ───────────────────────────── Sales orders ─────────────────────────────
  const salesOrders: SalesOrder[] = [];
  let soNo = 4380;
  const custWeights = customers.map((c) => [c, c.channel === "b2b_portal" ? 3 : 1.6] as const);
  const transitDays = (cc: string) => (cc === "TR" ? 1 : ["BG", "GR", "RO", "RS", "GE", "AZ"].includes(cc) ? 3 : ["DE", "PL", "NL", "FR", "IT", "HU", "CZ", "LT", "HR", "IQ"].includes(cc) ? 5 : ["ES", "GB", "SE", "JO", "LB", "KZ", "UZ"].includes(cc) ? 8 : 18);
  let openOrder: SalesOrder | null = null;
  let openOrderRelease = 0;
  for (const wo of workOrders) {
    if (wo.customerId !== "pending") continue;
    const product = productById.get(wo.productId)!;
    const release = Date.parse(wo.createdAt);
    if (!openOrder || openOrder.lines.length >= 4 || release - openOrderRelease > 1.5 * DAY || rng.chance(0.5)) {
      const customer = rng.weighted(custWeights);
      const orderDate = addDays(localDateOf(release), -rng.int(0, 4));
      const so: SalesOrder = {
        id: `SO-${yy}-${String(soNo++).padStart(5, "0")}`,
        customerId: customer.id,
        channel: customer.channel,
        orderDate: orderDate > today ? today : orderDate,
        requestedDate: wo.dueDate,
        promisedDate: wo.dueDate,
        status: "confirmed",
        priority: wo.priority,
        lines: [],
        totalEur: 0,
        workOrderIds: [],
        incoterm: customer.countryCode === "TR" ? "DAP" : ["ZA", "NG", "BR", "CL", "SA", "AE", "QA", "EG", "MA", "DZ"].includes(customer.countryCode) ? "CIF" : rng.pick(["EXW", "FCA", "FCA"] as const),
        b2bRef: customer.channel === "b2b_portal" ? `B2B-${yy}${rng.digits(6)}` : undefined,
      };
      salesOrders.push(so);
      openOrder = so;
      openOrderRelease = release;
    }
    const so = openOrder;
    wo.customerId = so.customerId;
    wo.salesOrderId = so.id;
    so.workOrderIds.push(wo.id);
    so.lines.push({
      productId: product.id,
      qty: wo.qty,
      unitPriceEur: round(product.listPriceEur * rng.range(0.84, 0.97), 2),
      qtyProduced: wo.qtyDone,
    });
    if (wo.dueDate > so.promisedDate) so.promisedDate = wo.dueDate;
    if (wo.dueDate < so.requestedDate) so.requestedDate = wo.dueDate;
    if (["urgent", "high"].includes(wo.priority) && so.priority !== "urgent") so.priority = wo.priority;
  }
  for (const wo of workOrders) if (wo.customerId === "pending") wo.customerId = undefined;
  const woById = new Map(workOrders.map((w) => [w.id, w]));
  for (const so of salesOrders) {
    so.totalEur = round(so.lines.reduce((s, l) => s + l.qty * l.unitPriceEur, 0), 2);
    const wos = so.workOrderIds.map((id) => woById.get(id)!);
    const allDone = wos.every((w) => w.status === "completed");
    const anyStarted = wos.some((w) => w.status !== "planned" && w.status !== "released");
    if (allDone) {
      const lastEnd = Math.max(...wos.map((w) => Date.parse(w.actualEnd!)));
      const shipAt = lastEnd + rng.range(0.6, 1.4) * DAY;
      const cust = customers.find((c) => c.id === so.customerId)!;
      if (shipAt > now) so.status = "ready";
      else {
        const eta = shipAt + transitDays(cust.countryCode) * DAY;
        const mode = ["ZA", "NG", "BR", "CL"].includes(cust.countryCode) ? "sea" : rng.chance(0.06) ? "air" : "truck";
        so.shipment = {
          mode,
          carrier: mode === "sea" ? rng.pick(["Bosphorus Line", "Marmara Shipping"]) : mode === "air" ? "Silivri Air Cargo" : rng.pick(["Trakya Lojistik", "Anadolu Transport", "EuroRoute TIR"]),
          tracking: `${mode === "sea" ? "MSKU" : mode === "air" ? "AWB" : "TIR"}${rng.digits(8)}`,
          shippedAt: localDateOf(shipAt),
          eta: localDateOf(eta),
        };
        so.status = eta < now ? "delivered" : "shipped";
      }
    } else if (anyStarted) so.status = "in_production";
    else so.status = "confirmed";
  }
  // brand-new orders that just came in through the B2B portal (not yet converted)
  for (let i = 0; i < 6; i++) {
    const customer = rng.weighted(custWeights.filter(([c]) => c.channel === "b2b_portal" || rng.chance(0.3)));
    const lines = rng.sample(products, rng.int(1, 4)).map((p) => {
      const [lo, hi, step] = qtyRange[p.category];
      return { productId: p.id, qty: Math.round(rng.range(lo, hi) / step) * step || step, unitPriceEur: round(p.listPriceEur * rng.range(0.85, 0.96), 2), qtyProduced: 0 };
    });
    salesOrders.push({
      id: `SO-${yy}-${String(soNo++).padStart(5, "0")}`,
      customerId: customer.id,
      channel: i < 4 ? "b2b_portal" : customer.channel,
      orderDate: addDays(today, -rng.int(0, 1)),
      requestedDate: addDays(today, rng.int(8, 20)),
      promisedDate: addDays(today, rng.int(10, 22)),
      status: "new",
      priority: rng.weighted([["normal", 5], ["high", 2], ["urgent", 1]] as const),
      lines,
      totalEur: round(lines.reduce((s, l) => s + l.qty * l.unitPriceEur, 0), 2),
      workOrderIds: [],
      incoterm: rng.pick(["EXW", "FCA", "CIF", "DAP"] as const),
      b2bRef: i < 4 ? `B2B-${yy}${rng.digits(6)}` : undefined,
    });
  }
  salesOrders.sort((a, b) => (a.orderDate < b.orderDate ? 1 : a.orderDate > b.orderDate ? -1 : a.id < b.id ? 1 : -1));

  // material availability for upcoming work
  for (const wo of workOrders) {
    if (wo.status !== "planned" && wo.status !== "released") continue;
    const product = productById.get(wo.productId)!;
    const short = product.bom.find((b) => lowStock.has(b.materialId));
    if (short) wo.materialStatus = short.materialId === "RM-1303" ? "short" : rng.chance(0.5) ? "partial" : "available";
  }

  // ───────────────────────────── Tasks ─────────────────────────────
  const tasks: Task[] = [];
  let taskNo = 5001;
  const opL = (op: OperationType) => OP_LABELS[op];
  const checklists: Record<TaskType, [string, string][]> = {
    production: [["Check work instruction", "İş talimatını kontrol et"], ["Verify material lots", "Malzeme lotlarını doğrula"], ["Report quantity", "Miktar bildir"], ["Clean workstation", "İstasyonu temizle"]],
    setup: [["Remove previous fixture", "Önceki fikstürü sök"], ["Load CNC / robot program", "CNC / robot programını yükle"], ["Mount fixture & tools", "Fikstür ve takımları bağla"], ["First-off check", "İlk parça kontrolü"], ["Release to production", "Üretime serbest bırak"]],
    quality: [["Collect samples", "Numune al"], ["Measure critical dimensions", "Kritik ölçüleri ölç"], ["Record results in control plan", "Sonuçları kontrol planına gir"], ["Sign off", "Onayla"]],
    maintenance: [["Lock-out / tag-out", "Kilitle / etiketle (LOTO)"], ["Replace worn parts", "Aşınan parçaları değiştir"], ["Test run", "Test çalıştırması"], ["Update maintenance log", "Bakım kaydını güncelle"]],
    material: [["Print pick list", "Toplama listesini yazdır"], ["Pick materials", "Malzemeleri topla"], ["Scan lot numbers", "Lot numaralarını okut"], ["Deliver to line", "Hatta teslim et"]],
    logistics: [["Packing list", "Çeki listesi"], ["Commercial invoice", "Ticari fatura"], ["Certificate of origin (EUR.1 / A.TR)", "Menşe belgesi (EUR.1 / A.TR)"], ["Loading photos", "Yükleme fotoğrafları"]],
    engineering: [["Draft", "Taslak"], ["Peer review", "Gözden geçirme"], ["Approve", "Onay"], ["Publish to shop floor", "Atölyeye yayınla"]],
  };
  const commentPool = [
    "Started, first pieces look good.",
    "Fixture clamps worn — requested spares.",
    "Waiting on forklift, will continue after break.",
    "Checked with QC, OK to proceed.",
    "Material lot scanned and verified.",
    "Customer asked for photos before loading.",
    "Program updated to v3, cycle time −8%.",
    "Need second welder for this batch.",
  ];
  const activeWos = workOrders.filter((w) => ["in_progress", "released", "quality_check", "on_hold"].includes(w.status));
  const addTask = (type: TaskType, title: string, titleTr: string, extra: Partial<Task> & { plantId: PlantId }) => {
    const status: TaskStatus = extra.status ?? rng.weighted([["todo", 3], ["in_progress", 2.5], ["blocked", 0.7], ["review", 1.2], ["done", 2.2]] as const);
    const created = now - rng.int(2, 120) * HOUR;
    const due = status === "done" ? created + rng.int(4, 48) * HOUR : now + rng.int(-20, 96) * HOUR;
    const items = checklists[type];
    const doneUpTo = status === "done" ? items.length : status === "todo" ? 0 : rng.int(1, items.length - 1);
    const plantStaff = employees.filter((e) => e.plantId === extra.plantId);
    const assigneePool =
      type === "maintenance" ? plantStaff.filter((e) => e.role === "maintenance_tech")
      : type === "quality" ? plantStaff.filter((e) => e.role === "qc_inspector")
      : type === "material" || type === "logistics" ? plantStaff.filter((e) => e.role === "warehouse" || e.role === "planner")
      : type === "engineering" ? plantStaff.filter((e) => e.role === "planner" || e.role === "supervisor")
      : plantStaff.filter((e) => ["operator", "welder", "team_lead"].includes(e.role));
    const est = rng.pick([0.5, 1, 1.5, 2, 3, 4, 6, 8]);
    const task: Task = {
      id: `TSK-${taskNo++}`,
      title,
      titleTr,
      type,
      status,
      priority: extra.priority ?? rng.weighted([["low", 1], ["normal", 5], ["high", 2], ["urgent", 0.6]] as const),
      assigneeId: rng.chance(0.92) ? rng.pick(assigneePool.length ? assigneePool : plantStaff).id : undefined,
      reporterId: rng.pick(plantStaff.filter((e) => ["supervisor", "team_lead", "planner"].includes(e.role))).id,
      createdAt: iso(created),
      dueAt: iso(due),
      estimateHours: est,
      loggedHours: status === "todo" ? 0 : round(est * (status === "done" ? rng.range(0.8, 1.3) : rng.range(0.1, 0.9)), 1),
      checklist: items.map(([en, tr], i) => ({ label: en, labelTr: tr, done: i < doneUpTo })),
      comments: Array.from({ length: status === "todo" ? rng.int(0, 1) : rng.int(0, 3) }, (_, i) => ({
        id: `c${taskNo}-${i}`,
        authorId: rng.pick(plantStaff).id,
        at: iso(created + (i + 1) * rng.int(1, 6) * HOUR),
        text: rng.pick(commentPool),
      })),
      tags: [],
      ...extra,
    };
    task.status = status;
    if (task.status === "blocked" && !task.blockedReason) task.blockedReason = rng.pick(["Waiting for material", "Machine down", "Awaiting QC approval", "Missing drawing revision"]);
    tasks.push(task);
    return task;
  };
  for (const wo of rng.sample(activeWos, 26)) {
    const product = productById.get(wo.productId)!;
    const op = wo.operations.find((o) => o.status === "running" || o.status === "paused" || o.status === "ready") ?? wo.operations[0];
    const machine = machines.find((m) => m.id === op.machineId)!;
    const kind = rng.weighted([["production", 5], ["material", 2], ["setup", 2], ["quality", 1.5]] as const);
    const base = { plantId: wo.plantId, workOrderId: wo.id, machineId: op.machineId, tags: [product.sku] };
    if (kind === "production")
      addTask("production", `${opL(op.operation).en} — ${wo.id} (${wo.qty} pcs)`, `${opL(op.operation).tr} — ${wo.id} (${wo.qty} adet)`, {
        ...base,
        status: op.status === "running" ? "in_progress" : wo.status === "on_hold" ? "blocked" : "todo",
        priority: wo.priority,
        blockedReason: wo.holdReason,
      });
    else if (kind === "material") addTask("material", `Stage materials for ${wo.id}`, `${wo.id} için malzemeleri hatta hazırla`, { ...base, tags: [product.sku, "kitting"] });
    else if (kind === "setup") addTask("setup", `Changeover ${machine.id} to ${product.sku}`, `${machine.id} model değişimi: ${product.sku}`, { ...base, tags: [product.sku, "SMED"] });
    else addTask("quality", `First article inspection — ${product.sku}`, `İlk parça muayenesi — ${product.sku}`, { ...base, tags: [product.sku, "FAI"] });
  }
  for (const m of rng.sample(machines, 12)) {
    const tpl = rng.pick([
      ["Replace torch liner & contact tips", "Torç spirali ve kontak memelerini değiştir"],
      ["Inspect hydraulic hoses", "Hidrolik hortumları kontrol et"],
      ["Clean laser lens & check nozzle", "Lazer lensini temizle, nozulu kontrol et"],
      ["Lubricate guides & check backlash", "Kızakları yağla, boşluğu kontrol et"],
      ["Calibrate pressure transducer", "Basınç transmiterini kalibre et"],
    ] as const);
    addTask("maintenance", `${tpl[0]} — ${m.id}`, `${tpl[1]} — ${m.id}`, { plantId: m.plantId, machineId: m.id, tags: ["TPM"], status: m.status === "down" ? "in_progress" : undefined, priority: m.status === "down" ? "urgent" : undefined });
  }
  for (const so of rng.sample(salesOrders.filter((s) => s.status === "ready" || s.status === "in_production"), 8)) {
    const cust = customers.find((c) => c.id === so.customerId)!;
    const wo = woById.get(so.workOrderIds[0]);
    const kind = rng.chance(0.5);
    addTask(
      "logistics",
      kind ? `Prepare export documents — ${so.id}` : `Load truck for ${cust.name}`,
      kind ? `İhracat evraklarını hazırla — ${so.id}` : `${cust.name} için tır yüklemesi`,
      { plantId: wo?.plantId ?? "P1", tags: [cust.countryCode, so.incoterm] },
    );
  }
  for (const p of rng.sample(products, 7)) {
    const tpl = rng.pick([
      [`Release drawing ${p.drawingRev} for ${p.sku}`, `${p.sku} için ${p.drawingRev} çizimini yayınla`],
      [`Optimise nesting program — ${p.sku}`, `Yerleşim (nesting) programını optimize et — ${p.sku}`],
      [`Weld fixture modification — ${p.sku}`, `Kaynak fikstürü revizyonu — ${p.sku}`],
      [`Update control plan — ${p.sku}`, `Kontrol planını güncelle — ${p.sku}`],
    ] as const);
    addTask(tpl[0].startsWith("Update control") ? "quality" : "engineering", tpl[0], tpl[1], { plantId: p.plantId, tags: [p.sku] });
  }
  for (const mat of materials.filter((m) => m.onHand < m.reorderPoint)) {
    addTask("material", `Expedite delivery — ${mat.name}`, `Teslimatı hızlandır — ${mat.nameTr}`, { plantId: mat.category === "substrate" ? "P3" : mat.id === "RM-1006" ? "P2" : "P4", priority: mat.onHand < mat.safetyStock ? "urgent" : "high", tags: [mat.id, "purchasing"], status: "in_progress" });
  }
  for (let i = 0; i < 4; i++) {
    const loc = `WH-${rng.pick(["A", "B", "C"])}-${String(rng.int(1, 18)).padStart(2, "0")}`;
    addTask("material", `Cycle count rack ${loc}`, `${loc} rafında periyodik sayım`, { plantId: rng.pick(plants).id, tags: ["inventory"] });
  }

  // ───────────────────────────── Quality ─────────────────────────────
  const measurementTemplates: Record<ProductCategory, [string, number, number, number, string][]> = {
    muffler: [["Overall length", 980, 2, 2, "mm"], ["Inlet pipe Ø", 101.6, 0.4, 0.4, "mm"], ["Flange flatness", 0, 0, 0.2, "mm"], ["Leak test Δp", 0, 0, 3, "mbar"], ["Paint thickness", 70, 15, 15, "µm"]],
    scr_muffler: [["Overall length", 1120, 2.5, 2.5, "mm"], ["Mat GBD", 0.42, 0.03, 0.03, "g/cm³"], ["Inlet Ø", 127, 0.5, 0.5, "mm"], ["Leak test Δp", 0, 0, 3, "mbar"]],
    dpf: [["Overall length", 610, 1.5, 1.5, "mm"], ["Mount GBD", 0.45, 0.03, 0.03, "g/cm³"], ["Back-pressure", 3.2, 0.6, 0.6, "kPa"], ["Leak test Δp", 0, 0, 3, "mbar"]],
    manifold: [["Flange flatness", 0, 0, 0.1, "mm"], ["Port pitch", 140, 0.15, 0.15, "mm"], ["Leak test Δp", 0, 0, 2, "mbar"]],
    air_tank: [["Wall thickness", 3.0, 0.15, 0.15, "mm"], ["Proof pressure", 15, 0, 0.5, "bar"], ["Boss position", 120, 1, 1, "mm"], ["Paint thickness", 80, 15, 15, "µm"]],
    fuel_tank: [["Wall thickness", 3.0, 0.15, 0.15, "mm"], ["Leak test Δp", 0, 0, 2, "mbar"], ["Overall length", 1100, 2, 2, "mm"], ["Weld bead width", 6, 1.5, 1.5, "mm"]],
    insulated_pipe: [["Length", 1000, 2, 2, "mm"], ["Bend angle", 90, 0.5, 0.5, "°"], ["Insulation thickness", 25, 2, 2, "mm"]],
    generator_exhaust: [["Overall length", 2400, 4, 4, "mm"], ["Shell Ø", 610, 2, 2, "mm"], ["Paint thickness", 90, 20, 20, "µm"]],
    brake_valve: [["Bore Ø", 100, 0, 0.05, "mm"], ["Actuation pressure", 6, 0.3, 0.3, "bar"], ["Leak test Δp", 0, 0, 1, "mbar"]],
    nox_sensor: [["Zero-point signal", 0, 10, 10, "ppm"], ["Heater resistance", 3.2, 0.3, 0.3, "Ω"], ["CAN response", 50, 20, 20, "ms"]],
  };
  const measure = (cat: ProductCategory, fail: boolean): Measurement[] => {
    const tpl = measurementTemplates[cat];
    const failIdx = fail ? rng.int(0, tpl.length - 1) : -1;
    return tpl.map(([name, nominal, tm, tp, unit], i) => {
      const width = tm + tp;
      let value: number;
      if (i === failIdx) value = rng.chance(0.5) && tm > 0 ? nominal - tm - width * rng.range(0.1, 0.4) : nominal + tp + width * rng.range(0.1, 0.4);
      else value = clamp(nominal + (tp - tm) / 2 + rng.normal(0, width / 7), nominal - tm, nominal + tp);
      const dp = nominal !== 0 && Math.abs(nominal) < 10 ? 2 : 1;
      return { name, nominal, tolMinus: tm, tolPlus: tp, value: round(value, dp), unit };
    });
  };
  const inspections: Inspection[] = [];
  let qiNo = 8800;
  const inspectorsOf = (pid: PlantId) => employees.filter((e) => e.plantId === pid && e.role === "qc_inspector");
  for (const wo of workOrders) {
    if (wo.status === "planned" || wo.status === "released") continue;
    const product = productById.get(wo.productId)!;
    const pushInsp = (type: InspectionType, atMs: number, failP: number) => {
      if (atMs > now) return;
      const result = rng.chance(failP) ? "fail" : rng.chance(0.035) ? "conditional" : "pass";
      inspections.push({
        id: `QI-${yy}-${qiNo++}`,
        type,
        workOrderId: wo.id,
        productId: product.id,
        inspectorId: rng.pick(inspectorsOf(wo.plantId)).id,
        at: iso(atMs),
        result,
        sampleSize: type === "final" ? Math.min(wo.qty, rng.pick([5, 8, 13, 20])) : type === "first_article" ? 1 : rng.pick([3, 5]),
        defectsFound: result === "fail" ? rng.int(1, 4) : result === "conditional" ? 1 : 0,
        measurements: measure(product.category, result === "fail"),
        plantId: wo.plantId,
      });
    };
    const first = wo.operations[0];
    if (first.actualStart && rng.chance(0.55)) pushInsp("first_article", Date.parse(first.actualStart) + 40 * MIN, 0.03);
    const leak = wo.operations.find((o) => (o.operation === "leak_test" || o.operation === "pressure_test") && o.status === "done");
    if (leak && rng.chance(0.5)) pushInsp("leak_test", Date.parse(leak.actualEnd!) - 20 * MIN, 0.05);
    if (wo.status === "completed" && rng.chance(0.6)) pushInsp("final", Date.parse(wo.actualEnd!) - 15 * MIN, 0.035);
    else if (rng.chance(0.2)) pushInsp("in_process", Math.min(now - 30 * MIN, Date.parse(wo.actualStart ?? wo.plannedStart) + 6 * HOUR), 0.06);
  }
  for (const mat of materials) {
    for (const lot of mat.lots) {
      if (!["sheet_metal", "tube", "substrate", "component"].includes(mat.category)) continue;
      const fail = rng.chance(0.05);
      inspections.push({
        id: `QI-${yy}-${qiNo++}`,
        type: "incoming",
        materialId: mat.id,
        inspectorId: rng.pick(employees.filter((e) => e.role === "qc_inspector")).id,
        at: iso(Date.parse(`${lot.receivedAt}T10:30:00+03:00`) + rng.int(0, 240) * MIN),
        result: fail ? "fail" : "pass",
        sampleSize: rng.pick([3, 5]),
        defectsFound: fail ? 1 : 0,
        measurements:
          mat.category === "sheet_metal"
            ? [
                { name: "Thickness", nominal: 1.5, tolMinus: 0.08, tolPlus: 0.08, value: round(1.5 + rng.normal(0, 0.02) + (fail ? 0.12 : 0), 2), unit: "mm" },
                { name: "Tensile strength Rm", nominal: 420, tolMinus: 40, tolPlus: 60, value: round(430 + rng.normal(0, 12), 0), unit: "MPa" },
              ]
            : [{ name: "Visual / CoC check", nominal: 1, tolMinus: 0, tolPlus: 0, value: fail ? 0 : 1, unit: "OK" }],
        plantId: mat.category === "substrate" || mat.category === "component" ? "P3" : "P1",
      });
    }
  }
  inspections.sort((a, b) => (a.at < b.at ? 1 : -1));

  const ncrTitles: Record<DefectType, [string, string]> = {
    weld_porosity: ["Porosity on circumferential weld", "Çevresel kaynakta gözenek"],
    weld_crack: ["Crack at bracket weld toe", "Braket kaynak dibinde çatlak"],
    leak: ["Leak detected at inlet flange", "Giriş flanşında kaçak tespit edildi"],
    dimensional: ["Overall length out of tolerance", "Toplam boy tolerans dışında"],
    paint_defect: ["Paint peeling after salt-spray test", "Tuz testi sonrası boya kalkması"],
    burr_sharp_edge: ["Sharp edges on laser-cut baffles", "Lazer kesim perdelerde çapak"],
    wrong_marking: ["Wrong part number on label", "Etikette yanlış parça numarası"],
    dent_scratch: ["Transport dents on shell", "Gövdede nakliye kaynaklı ezik"],
    missing_part: ["Missing temperature sensor boss", "Sıcaklık sensörü bosu eksik"],
    material_defect: ["Lamination in incoming sheet lot", "Gelen sac lotunda katmanlaşma"],
  };
  const rootCauses = [
    "Gas flow drop due to worn regulator on robot cell",
    "Fixture locator pin worn > 0.3 mm",
    "Wrong program revision loaded after changeover",
    "Supplier coil with lamination — heat number traced",
    "Insufficient pre-treatment time in paint line",
    "Operator skipped poka-yoke step on new shift",
    "Pallet strapping method damages shell edges",
  ];
  const ncrs: Ncr[] = [];
  const defectWeights: [DefectType, number][] = [["weld_porosity", 9], ["leak", 7], ["dimensional", 6], ["paint_defect", 4], ["burr_sharp_edge", 4], ["dent_scratch", 3], ["weld_crack", 2], ["wrong_marking", 2], ["missing_part", 2], ["material_defect", 2]];
  for (let i = 0; i < 34; i++) {
    const defectType = rng.weighted(defectWeights);
    const openedDays = rng.int(0, 88);
    const ageFactor = openedDays / 88;
    const status = rng.weighted([
      ["open", 1 - ageFactor + 0.1],
      ["containment", 0.9 - ageFactor * 0.6],
      ["root_cause", 0.7 - ageFactor * 0.3],
      ["corrective_action", 0.6],
      ["verification", 0.45],
      ["closed", 0.4 + ageFactor * 3],
    ] as const);
    const wo = rng.pick(workOrders.filter((w) => w.status !== "planned" && w.status !== "released"));
    const source = defectType === "material_defect" ? "supplier" : rng.weighted([["internal", 7], ["customer", 2.2]] as const);
    const severity = rng.weighted([["minor", 5], ["major", 3], ["critical", source === "customer" ? 1.4 : 0.5]] as const);
    const qtyAffected = rng.int(2, severity === "critical" ? 120 : 40);
    const prod = productById.get(wo.productId)!;
    ncrs.push({
      id: `NCR-${yy}-${String(141 + i).padStart(4, "0")}`,
      title: ncrTitles[defectType][0],
      titleTr: ncrTitles[defectType][1],
      source,
      defectType,
      severity,
      productId: prod.id,
      workOrderId: source === "supplier" ? undefined : wo.id,
      customerId: source === "customer" ? wo.customerId ?? rng.pick(customers).id : undefined,
      qtyAffected,
      status,
      disposition: status === "open" ? "pending" : rng.weighted([["rework", 5], ["scrap", 2], ["use_as_is", 1], ["return_to_supplier", source === "supplier" ? 5 : 0]] as const),
      ownerId: rng.pick(inspectorsOf(prod.plantId)).id,
      openedAt: addDays(today, -openedDays),
      targetDate: addDays(today, -openedDays + (severity === "critical" ? 10 : 30)),
      closedAt: status === "closed" ? addDays(today, -Math.max(0, openedDays - rng.int(5, 25))) : undefined,
      rootCause: ["root_cause", "open", "containment"].includes(status) ? undefined : rng.pick(rootCauses),
      costEur: round(qtyAffected * prod.unitCostEur * (rng.range(0.15, 0.6) + (source === "customer" ? 0.5 : 0)), 0),
      method: severity === "minor" ? "5 Why" : rng.pick(["8D", "8D", "Ishikawa"] as const),
      plantId: prod.plantId,
    });
  }
  ncrs.sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));

  // ───────────────────────────── Maintenance ─────────────────────────────
  const maintenance: MaintenanceOrder[] = [];
  let moNo = 720;
  const techs = (pid: PlantId) => employees.filter((e) => e.plantId === pid && e.role === "maintenance_tech");
  const pmChecklist: [string, string][] = [["Lock-out / tag-out", "Kilitle / etiketle (LOTO)"], ["Visual inspection", "Gözle kontrol"], ["Lubrication points", "Yağlama noktaları"], ["Filters & consumables", "Filtreler ve sarflar"], ["Safety devices test", "Emniyet ekipmanları testi"], ["Test run & sign-off", "Test çalıştırması ve onay"]];
  const pmParts: Record<string, [string, number][]> = {
    laser: [["Protective window", 38], ["Nozzle set", 22]],
    weld_robot: [["Torch liner", 14], ["Contact tips (×20)", 18], ["Gas nozzle", 9]],
    weld_station: [["Torch liner", 14], ["Contact tips (×20)", 18]],
    press: [["Hydraulic filter", 64], ["Seal kit", 140]],
    cnc: [["Way oil 20 L", 46], ["Coolant filter", 28]],
    paint_line: [["Powder gun nozzle", 32], ["Oven burner filter", 55]],
    default: [["Grease cartridge", 7], ["Filter element", 24]],
  };
  for (const m of machines) {
    const tech = rng.pick(techs(m.plantId));
    const parts = (pmParts[m.type] ?? pmParts.default).map(([name, cost]) => ({ name, qty: rng.int(1, 2), costEur: cost }));
    const mk = (o: Partial<MaintenanceOrder> & Pick<MaintenanceOrder, "type" | "title" | "titleTr" | "status" | "scheduledDate">) => {
      const estHours = o.estHours ?? round(rng.range(1, 4), 1);
      const ps = o.parts ?? parts;
      const doneN = o.status === "completed" ? pmChecklist.length : o.status === "in_progress" ? rng.int(1, 4) : 0;
      maintenance.push({
        id: `MO-${yy}-${String(moNo++).padStart(4, "0")}`,
        machineId: m.id,
        priority: "normal",
        technicianId: tech.id,
        estHours,
        downtimeHours: o.status === "completed" ? round(estHours * rng.range(0.8, 1.3), 1) : 0,
        parts: ps,
        costEur: round(ps.reduce((s, p) => s + p.qty * p.costEur, 0) + estHours * 32, 0),
        plantId: m.plantId,
        checklist: pmChecklist.map(([en, tr], i) => ({ label: en, labelTr: tr, done: i < doneN })),
        ...o,
      });
    };
    mk({ type: "preventive", title: `Monthly PM — ${MACHINE_META[m.type].name}`, titleTr: `Aylık periyodik bakım — ${m.id}`, status: "completed", scheduledDate: m.lastPm, completedDate: m.lastPm });
    const overdue = m.nextPm < today;
    mk({ type: "preventive", title: `Monthly PM — ${MACHINE_META[m.type].name}`, titleTr: `Aylık periyodik bakım — ${m.id}`, status: overdue ? "overdue" : m.status === "maintenance" ? "in_progress" : "scheduled", scheduledDate: m.status === "maintenance" ? today : m.nextPm, priority: overdue ? "high" : "normal" });
    if (m.status === "down") {
      const reason = m.downReason!;
      mk({ type: "corrective", title: reason, titleTr: downReasonsTr[reason] ?? reason, status: rng.chance(0.5) ? "in_progress" : "waiting_parts", scheduledDate: today, priority: "urgent", estHours: round(rng.range(2, 6), 1), parts: [{ name: "Spare part (on order)", qty: 1, costEur: rng.int(120, 1400) }] });
    }
    if (rng.chance(0.35)) {
      const d = rng.int(5, 60);
      const [en, tr] = rng.pick(downReasonsByType[m.type] ?? [["Unplanned stop — sensor fault", "Plansız duruş — sensör arızası"]]);
      mk({ type: "corrective", title: en, titleTr: tr, status: "completed", scheduledDate: addDays(today, -d), completedDate: addDays(today, -d), priority: "high" });
    }
    if ((m.type === "test_bench" || m.type === "inspection") && rng.chance(0.8)) {
      const d = rng.int(-20, 40);
      mk({ type: "calibration", title: m.type === "test_bench" ? "Leak/pressure tester calibration (ISO 17025 ref.)" : "Gauge & CMM calibration", titleTr: m.type === "test_bench" ? "Sızdırmazlık/basınç test cihazı kalibrasyonu" : "Mastar ve CMM kalibrasyonu", status: d < 0 ? "completed" : "scheduled", scheduledDate: addDays(today, d), completedDate: d < 0 ? addDays(today, d) : undefined, estHours: 2 });
    }
    if ((m.type === "cnc" || m.type === "press" || m.type === "weld_robot") && rng.chance(0.3)) {
      mk({ type: "predictive", title: m.type === "press" ? "Oil temperature trending up — check cooler" : "Vibration trend +18% — inspect bearings", titleTr: m.type === "press" ? "Yağ sıcaklığı artış eğiliminde — soğutucuyu kontrol et" : "Titreşim eğilimi +%18 — rulmanları kontrol et", status: "scheduled", scheduledDate: addDays(today, rng.int(1, 6)), priority: "high" });
    }
  }
  maintenance.sort((a, b) => (a.scheduledDate < b.scheduledDate ? -1 : 1));

  // ───────────────────────────── Production history ─────────────────────────────
  const dailyProduction: DailyProduction[] = [];
  for (let d = -59; d <= -1; d++) {
    const date = addDays(today, d);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const trend = (d + 60) / 60; // slight improvement over time
    for (const plant of plants) {
      const factor = dow === 0 ? 0.32 : dow === 6 ? 0.78 : 1;
      const target = Math.round(plant.dailyTarget * factor);
      const produced = Math.round(target * rng.range(0.84, 1.04) * (0.97 + trend * 0.03));
      dailyProduction.push({
        date,
        plantId: plant.id,
        produced,
        target,
        scrap: Math.round(produced * rng.range(0.004, 0.017) * (1.15 - trend * 0.25)),
        oee: round(clamp(rng.normal(0.72 + trend * 0.05, 0.03), 0.6, 0.88), 3),
        downtimeMin: Math.round(rng.range(80, 340) * (factor || 1)),
        onTimePct: round(clamp(rng.normal(0.9 + trend * 0.03, 0.02), 0.82, 0.995), 3),
      });
    }
  }
  const hourlyProduction: HourlyProduction[] = [];
  for (const plant of plants) {
    const perHour = plant.dailyTarget / 24;
    for (let h = 0; h <= clock.hour; h++) {
      const dip = h === 6 || h === 14 || h === 22 ? 0.72 : h === 12 || h === 3 || h === 18 ? 0.86 : 1;
      const partial = h === clock.hour ? (clock.minuteOfDay % 60) / 60 : 1;
      hourlyProduction.push({ hour: h, plantId: plant.id, target: Math.round(perHour), produced: Math.round(perHour * dip * rng.range(0.82, 1.08) * partial) });
    }
  }
  // today's running totals feed the daily series as well
  for (const plant of plants) {
    const hs = hourlyProduction.filter((h) => h.plantId === plant.id);
    const produced = hs.reduce((s, h) => s + h.produced, 0);
    dailyProduction.push({
      date: today,
      plantId: plant.id,
      produced,
      target: plant.dailyTarget,
      scrap: Math.round(produced * 0.009),
      oee: round(machines.filter((m) => m.plantId === plant.id).reduce((s, m) => s + m.oee, 0) / machines.filter((m) => m.plantId === plant.id).length, 3),
      downtimeMin: Math.round(rng.range(60, 180) * (clock.hour / 24)),
      onTimePct: round(rng.range(0.9, 0.96), 3),
    });
  }

  const downtime: DowntimeEvent[] = [];
  const dtWeights: [DowntimeEvent["reason"], number][] = [["setup_changeover", 30], ["tool_change", 16], ["planned_maintenance", 14], ["breakdown", 15], ["no_material", 12], ["no_operator", 8], ["quality_hold", 6]];
  const dtMinutes: Record<DowntimeEvent["reason"], [number, number]> = { setup_changeover: [15, 55], tool_change: [5, 20], planned_maintenance: [60, 240], breakdown: [30, 260], no_material: [20, 140], no_operator: [15, 90], quality_hold: [30, 180] };
  for (let i = 0; i < 160; i++) {
    const reason = rng.weighted(dtWeights);
    const m = rng.pick(machines);
    const start = now - rng.range(0.1, 14) * DAY;
    const [a, b] = dtMinutes[reason];
    downtime.push({ id: `DT-${i + 1}`, machineId: m.id, start: iso(start), minutes: rng.int(a, b), reason });
  }
  for (const m of machines.filter((x) => x.status === "down")) {
    downtime.push({ id: `DT-live-${m.id}`, machineId: m.id, start: m.statusSince, minutes: Math.round((now - Date.parse(m.statusSince)) / MIN), reason: "breakdown", note: m.downReason });
  }
  downtime.sort((a, b) => (a.start < b.start ? 1 : -1));

  // ───────────────────────────── Stock movements ─────────────────────────────
  const stockMovements: StockMovement[] = [];
  const recentWos = workOrders.filter((w) => w.actualStart && Date.parse(w.actualStart) > now - 7 * DAY);
  const whStaff = employees.filter((e) => e.role === "warehouse");
  let smNo = 1;
  for (const wo of rng.sample(recentWos, 70)) {
    const p = productById.get(wo.productId)!;
    const b = rng.pick(p.bom);
    stockMovements.push({ id: `SM-${smNo++}`, materialId: b.materialId, type: "issue", qty: -round(b.qtyPerUnit * wo.qty, 1), at: wo.actualStart!, ref: wo.id, userId: rng.pick(whStaff).id });
  }
  for (const mat of materials) {
    for (const lot of mat.lots.filter((l) => l.receivedAt >= addDays(today, -7))) {
      stockMovements.push({ id: `SM-${smNo++}`, materialId: mat.id, type: "receipt", qty: lot.qty, at: `${lot.receivedAt}T07:${String(rng.int(10, 59))}:00.000Z`, ref: `PO-${yy}-${rng.digits(4)}`, userId: rng.pick(whStaff).id });
    }
  }
  for (let i = 0; i < 10; i++) {
    const mat = rng.pick(materials);
    const adj = rng.chance(0.5);
    stockMovements.push({ id: `SM-${smNo++}`, materialId: mat.id, type: adj ? "adjustment" : "transfer", qty: adj ? rng.int(-12, 8) : rng.int(5, 60), at: iso(now - rng.range(0.1, 7) * DAY), ref: adj ? "Cycle count" : `WH → ${rng.pick(["SLV-1", "SLV-2", "SLV-3", "SLV-4"])}`, userId: rng.pick(whStaff).id });
  }
  stockMovements.sort((a, b) => (a.at < b.at ? 1 : -1));

  // reserve materials for upcoming work orders
  return {
    generatedAt: iso(now),
    today,
    plants,
    products,
    machines,
    employees,
    customers,
    salesOrders,
    workOrders,
    tasks,
    inspections,
    ncrs,
    maintenance,
    materials,
    stockMovements,
    dailyProduction,
    hourlyProduction,
    downtime,
  };
}
