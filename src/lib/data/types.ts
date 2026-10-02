/**
 * Domain model for the Hobiex Production Management demo.
 * Every record is synthetic — produced by `generate.ts` from a fixed seed so
 * the same entities exist on every load; only dates float with "today".
 */

export type ISODate = string; // "2026-10-02"
export type ISODateTime = string; // "2026-10-02T08:30:00.000Z"

export type PlantId = "P1" | "P2" | "P3" | "P4";

export interface Plant {
  id: PlantId;
  code: string; // "SLV-1"
  name: string; // "Plant 1 · Exhaust Systems"
  nameTr: string;
  focus: string;
  focusTr: string;
  areaM2: number;
  headcount: number;
  lines: string[]; // "Line A"
  dailyTarget: number;
}

export type ProductCategory =
  | "muffler"
  | "scr_muffler"
  | "dpf"
  | "manifold"
  | "air_tank"
  | "fuel_tank"
  | "insulated_pipe"
  | "generator_exhaust"
  | "brake_valve"
  | "nox_sensor";

export type Oem = "MAN" | "Mercedes-Benz" | "Scania" | "Volvo" | "DAF" | "Iveco" | "Renault" | "Universal";

export type OperationType =
  | "laser_cutting"
  | "press_forming"
  | "sheet_rolling"
  | "tube_cutting"
  | "tube_bending"
  | "cnc_machining"
  | "robotic_welding"
  | "manual_welding"
  | "seam_welding"
  | "canning"
  | "assembly"
  | "leak_test"
  | "pressure_test"
  | "painting"
  | "insulation"
  | "final_inspection"
  | "packing";

export type WorkCenterType =
  | "laser"
  | "press"
  | "roller"
  | "tube_cutter"
  | "tube_bender"
  | "cnc"
  | "weld_robot"
  | "weld_station"
  | "seam_welder"
  | "canning"
  | "assembly"
  | "test_bench"
  | "paint_line"
  | "insulation"
  | "inspection"
  | "packing";

export interface RoutingStep {
  seq: number; // 10, 20, 30 ...
  operation: OperationType;
  workCenterType: WorkCenterType;
  setupMin: number;
  cycleMin: number; // standard minutes per unit
}

export interface BomLine {
  materialId: string;
  qtyPerUnit: number;
}

export interface Product {
  id: string;
  sku: string; // "HBX-MF-1042"
  name: string;
  category: ProductCategory;
  oem: Oem;
  model: string; // "TGX" / "Actros MP4" / "R-Series"
  oemRef: string; // synthetic cross reference
  euroNorm: "Euro 3" | "Euro 4" | "Euro 5" | "Euro 6" | "Stage V" | "—";
  weightKg: number;
  unitCostEur: number;
  listPriceEur: number;
  plantId: PlantId;
  image: string;
  routing: RoutingStep[];
  bom: BomLine[];
  stockQty: number;
  safetyStock: number;
  monthlyDemand: number;
  drawingRev: string; // "Rev C"
  active: boolean;
}

export type MachineStatus = "running" | "idle" | "setup" | "down" | "maintenance";

export interface Machine {
  id: string; // "LSR-01"
  name: string;
  model: string;
  type: WorkCenterType;
  plantId: PlantId;
  line: string;
  status: MachineStatus;
  statusSince: ISODateTime;
  downReason?: string;
  downReasonTr?: string;
  currentWoId?: string;
  currentOpId?: string;
  operatorId?: string;
  availability: number; // 0..1
  performance: number;
  quality: number;
  oee: number;
  outputToday: number;
  targetToday: number;
  runtimeHoursTotal: number;
  installedYear: number;
  mtbfHours: number;
  mttrHours: number;
  lastPm: ISODate;
  nextPm: ISODate;
  /** last 14 days OEE, oldest first */
  oeeTrend: number[];
  /** Live sensor readings (synthetic) */
  sensors: { label: string; value: number; unit: string; warn?: boolean }[];
}

export type EmployeeRole =
  | "operator"
  | "welder"
  | "team_lead"
  | "qc_inspector"
  | "maintenance_tech"
  | "planner"
  | "supervisor"
  | "warehouse";

export type ShiftId = "A" | "B" | "C"; // A 06-14, B 14-22, C 22-06

export interface Employee {
  id: string; // "E1043"
  name: string;
  role: EmployeeRole;
  plantId: PlantId;
  shift: ShiftId;
  /** skill level 0-4 per operation (0 = none, 4 = trainer) */
  skills: Partial<Record<OperationType, number>>;
  certifications: string[];
  hireDate: ISODate;
  status: "on_shift" | "off_shift" | "leave" | "sick";
  efficiency: number; // 0..1.3
  phone: string;
  avatarHue: number;
}

export type Channel = "b2b_portal" | "edi" | "email" | "sales_rep";

export interface Customer {
  id: string;
  name: string;
  country: string;
  countryTr: string;
  countryCode: string; // ISO-2
  city: string;
  segment: "distributor" | "oem" | "fleet" | "aftermarket" | "genset";
  channel: Channel;
  creditLimitEur: number;
  since: number;
}

export type SalesOrderStatus = "new" | "confirmed" | "in_production" | "ready" | "shipped" | "delivered";

export interface SalesOrderLine {
  productId: string;
  qty: number;
  unitPriceEur: number;
  qtyProduced: number;
}

export interface SalesOrder {
  id: string; // "SO-26-04512"
  customerId: string;
  channel: Channel;
  orderDate: ISODate;
  requestedDate: ISODate;
  promisedDate: ISODate;
  status: SalesOrderStatus;
  priority: Priority;
  lines: SalesOrderLine[];
  totalEur: number;
  workOrderIds: string[];
  incoterm: "EXW" | "FCA" | "FOB" | "CIF" | "DAP";
  shipment?: {
    mode: "truck" | "sea" | "air";
    carrier: string;
    tracking: string;
    shippedAt: ISODate;
    eta: ISODate;
  };
  b2bRef?: string; // reference from the Hobiex B2B portal
}

export type Priority = "low" | "normal" | "high" | "urgent";

export type WorkOrderStatus = "planned" | "released" | "in_progress" | "on_hold" | "quality_check" | "completed";

export type OperationStatus = "pending" | "ready" | "running" | "paused" | "done";

export interface WorkOrderOperation {
  id: string; // "WO-26-10234-20"
  seq: number;
  operation: OperationType;
  machineId: string;
  status: OperationStatus;
  plannedStart: ISODateTime;
  plannedEnd: ISODateTime;
  actualStart?: ISODateTime;
  actualEnd?: ISODateTime;
  stdMinutes: number; // setup + cycle * qty
  actualMinutes: number;
  qtyDone: number;
  qtyScrap: number;
  operatorId?: string;
}

export interface WorkOrder {
  id: string; // "WO-26-10234"
  productId: string;
  qty: number;
  qtyDone: number;
  qtyScrap: number;
  salesOrderId?: string;
  customerId?: string; // undefined = make-to-stock
  plantId: PlantId;
  status: WorkOrderStatus;
  priority: Priority;
  createdAt: ISODateTime;
  plannedStart: ISODateTime;
  plannedEnd: ISODateTime;
  dueDate: ISODate;
  actualStart?: ISODateTime;
  actualEnd?: ISODateTime;
  operations: WorkOrderOperation[];
  lotNo: string; // "L2610-0234"
  plannerId: string;
  holdReason?: string;
  notes?: string;
  materialStatus: "available" | "partial" | "short";
}

export type TaskType = "production" | "setup" | "quality" | "maintenance" | "material" | "logistics" | "engineering";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "review" | "done";

export interface TaskComment {
  id: string;
  authorId: string;
  at: ISODateTime;
  text: string;
}

export interface Task {
  id: string; // "TSK-5012"
  title: string;
  titleTr: string;
  description?: string;
  type: TaskType;
  status: TaskStatus;
  priority: Priority;
  assigneeId?: string;
  reporterId: string;
  plantId: PlantId;
  machineId?: string;
  workOrderId?: string;
  createdAt: ISODateTime;
  dueAt: ISODateTime;
  estimateHours: number;
  loggedHours: number;
  checklist: { label: string; labelTr: string; done: boolean }[];
  comments: TaskComment[];
  tags: string[];
  blockedReason?: string;
}

export type InspectionType = "incoming" | "first_article" | "in_process" | "leak_test" | "final";
export type InspectionResult = "pass" | "fail" | "conditional";

export interface Measurement {
  name: string;
  nominal: number;
  tolMinus: number;
  tolPlus: number;
  value: number;
  unit: string;
}

export interface Inspection {
  id: string; // "QI-26-08812"
  type: InspectionType;
  workOrderId?: string;
  productId?: string;
  materialId?: string;
  inspectorId: string;
  at: ISODateTime;
  result: InspectionResult;
  sampleSize: number;
  defectsFound: number;
  measurements: Measurement[];
  plantId: PlantId;
}

export type DefectType =
  | "weld_porosity"
  | "weld_crack"
  | "leak"
  | "dimensional"
  | "paint_defect"
  | "burr_sharp_edge"
  | "wrong_marking"
  | "dent_scratch"
  | "missing_part"
  | "material_defect";

export type NcrStatus = "open" | "containment" | "root_cause" | "corrective_action" | "verification" | "closed";

export interface Ncr {
  id: string; // "NCR-26-0142"
  title: string;
  titleTr: string;
  source: "internal" | "customer" | "supplier";
  defectType: DefectType;
  severity: "minor" | "major" | "critical";
  productId: string;
  workOrderId?: string;
  customerId?: string;
  qtyAffected: number;
  status: NcrStatus;
  disposition: "rework" | "scrap" | "use_as_is" | "return_to_supplier" | "pending";
  ownerId: string;
  openedAt: ISODate;
  targetDate: ISODate;
  closedAt?: ISODate;
  rootCause?: string;
  costEur: number;
  method: "8D" | "5 Why" | "Ishikawa";
  plantId: PlantId;
}

export type MaintenanceType = "preventive" | "corrective" | "predictive" | "calibration";
export type MaintenanceStatus = "scheduled" | "in_progress" | "waiting_parts" | "completed" | "overdue";

export interface MaintenanceOrder {
  id: string; // "MO-26-0731"
  machineId: string;
  type: MaintenanceType;
  title: string;
  titleTr: string;
  status: MaintenanceStatus;
  priority: Priority;
  scheduledDate: ISODate;
  completedDate?: ISODate;
  technicianId: string;
  estHours: number;
  downtimeHours: number;
  parts: { name: string; qty: number; costEur: number }[];
  costEur: number;
  plantId: PlantId;
  checklist: { label: string; labelTr: string; done: boolean }[];
}

export type MaterialCategory =
  | "sheet_metal"
  | "tube"
  | "flange_clamp"
  | "substrate"
  | "insulation"
  | "consumable"
  | "paint"
  | "packaging"
  | "component";

export interface MaterialLot {
  lotNo: string;
  heatNo?: string;
  qty: number;
  receivedAt: ISODate;
  certificate: string; // "EN 10204 3.1"
}

export interface Material {
  id: string; // "RM-1001"
  code: string;
  name: string;
  nameTr: string;
  category: MaterialCategory;
  unit: "kg" | "m" | "pcs" | "sheet" | "L" | "roll" | "set";
  onHand: number;
  reserved: number;
  onOrder: number;
  reorderPoint: number;
  safetyStock: number;
  leadTimeDays: number;
  unitCostEur: number;
  supplier: string;
  location: string;
  dailyUsage: number;
  lots: MaterialLot[];
  /** on-hand level for the last 30 days, oldest first */
  history: number[];
}

export interface StockMovement {
  id: string;
  materialId: string;
  type: "receipt" | "issue" | "adjustment" | "transfer";
  qty: number;
  at: ISODateTime;
  ref: string; // WO / PO number
  userId: string;
}

export interface DailyProduction {
  date: ISODate;
  plantId: PlantId;
  produced: number;
  target: number;
  scrap: number;
  oee: number;
  downtimeMin: number;
  onTimePct: number;
}

export interface HourlyProduction {
  hour: number; // 0..23 (local)
  plantId: PlantId;
  produced: number;
  target: number;
}

export interface DowntimeEvent {
  id: string;
  machineId: string;
  start: ISODateTime;
  minutes: number;
  reason:
    | "breakdown"
    | "no_material"
    | "setup_changeover"
    | "no_operator"
    | "quality_hold"
    | "planned_maintenance"
    | "tool_change";
  note?: string;
}

export interface Insight {
  id: string;
  severity: "info" | "warning" | "critical";
  kind: "bottleneck" | "late_risk" | "material" | "maintenance" | "quality" | "capacity";
  title: string;
  titleTr: string;
  detail: string;
  detailTr: string;
  href: string;
  impact?: string;
}

export interface Dataset {
  generatedAt: ISODateTime;
  today: ISODate;
  plants: Plant[];
  products: Product[];
  machines: Machine[];
  employees: Employee[];
  customers: Customer[];
  salesOrders: SalesOrder[];
  workOrders: WorkOrder[];
  tasks: Task[];
  inspections: Inspection[];
  ncrs: Ncr[];
  maintenance: MaintenanceOrder[];
  materials: Material[];
  stockMovements: StockMovement[];
  dailyProduction: DailyProduction[];
  hourlyProduction: HourlyProduction[];
  downtime: DowntimeEvent[];
}
