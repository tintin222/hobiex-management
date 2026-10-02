/**
 * Bilingual labels for enum-like domain values. Used by the generator (for
 * bilingual task titles) and by the UI via `useT()`/`label()`.
 */
import type {
  DefectType,
  EmployeeRole,
  InspectionResult,
  InspectionType,
  MachineStatus,
  MaintenanceStatus,
  MaintenanceType,
  MaterialCategory,
  NcrStatus,
  OperationStatus,
  OperationType,
  Priority,
  ProductCategory,
  SalesOrderStatus,
  TaskStatus,
  TaskType,
  WorkCenterType,
  WorkOrderStatus,
  Channel,
  DowntimeEvent,
} from "./types";

type L = { en: string; tr: string };

export const OP_LABELS: Record<OperationType, L> = {
  laser_cutting: { en: "Laser cutting", tr: "Lazer kesim" },
  press_forming: { en: "Press forming", tr: "Pres şekillendirme" },
  sheet_rolling: { en: "Sheet rolling", tr: "Sac bükme (silindir)" },
  tube_cutting: { en: "Tube cutting", tr: "Boru kesim" },
  tube_bending: { en: "Tube bending", tr: "Boru bükme" },
  cnc_machining: { en: "CNC machining", tr: "CNC işleme" },
  robotic_welding: { en: "Robotic welding", tr: "Robotik kaynak" },
  manual_welding: { en: "Manual welding", tr: "Manuel kaynak" },
  seam_welding: { en: "Seam welding", tr: "Dikiş kaynağı" },
  canning: { en: "Substrate canning", tr: "Substrat kanning" },
  assembly: { en: "Assembly", tr: "Montaj" },
  leak_test: { en: "Leak test", tr: "Sızdırmazlık testi" },
  pressure_test: { en: "Pressure test", tr: "Basınç testi" },
  painting: { en: "Painting", tr: "Boya" },
  insulation: { en: "Insulation", tr: "İzolasyon" },
  final_inspection: { en: "Final inspection", tr: "Son kontrol" },
  packing: { en: "Packing", tr: "Paketleme" },
};

export const WORK_CENTER_LABELS: Record<WorkCenterType, L> = {
  laser: { en: "Laser cutting", tr: "Lazer kesim" },
  press: { en: "Presses", tr: "Presler" },
  roller: { en: "Plate rolling", tr: "Silindir bükme" },
  tube_cutter: { en: "Tube cutting", tr: "Boru kesim" },
  tube_bender: { en: "Tube bending", tr: "Boru bükme" },
  cnc: { en: "CNC machining", tr: "CNC işleme" },
  weld_robot: { en: "Welding robots", tr: "Kaynak robotları" },
  weld_station: { en: "Manual welding", tr: "Manuel kaynak" },
  seam_welder: { en: "Seam welding", tr: "Dikiş kaynağı" },
  canning: { en: "Canning", tr: "Kanning" },
  assembly: { en: "Assembly", tr: "Montaj" },
  test_bench: { en: "Test benches", tr: "Test tezgâhları" },
  paint_line: { en: "Paint lines", tr: "Boya hatları" },
  insulation: { en: "Insulation", tr: "İzolasyon" },
  inspection: { en: "Inspection", tr: "Kontrol" },
  packing: { en: "Packing", tr: "Paketleme" },
};

export const CATEGORY_LABELS: Record<ProductCategory, L> = {
  muffler: { en: "Exhaust mufflers", tr: "Egzoz susturucuları" },
  scr_muffler: { en: "SCR mufflers", tr: "SCR susturucuları" },
  dpf: { en: "DPF filters", tr: "DPF filtreleri" },
  manifold: { en: "Exhaust manifolds", tr: "Egzoz manifoldları" },
  air_tank: { en: "Air tanks", tr: "Hava tankları" },
  fuel_tank: { en: "Fuel tanks", tr: "Yakıt depoları" },
  insulated_pipe: { en: "Insulated pipes", tr: "İzoleli borular" },
  generator_exhaust: { en: "Generator exhaust", tr: "Jeneratör egzozları" },
  brake_valve: { en: "Exhaust brake valves", tr: "Egzoz freni valfleri" },
  nox_sensor: { en: "NOx sensors", tr: "NOx sensörleri" },
};

export const WO_STATUS_LABELS: Record<WorkOrderStatus, L> = {
  planned: { en: "Planned", tr: "Planlandı" },
  released: { en: "Released", tr: "Serbest bırakıldı" },
  in_progress: { en: "In progress", tr: "Üretimde" },
  on_hold: { en: "On hold", tr: "Beklemede" },
  quality_check: { en: "Quality check", tr: "Kalite kontrol" },
  completed: { en: "Completed", tr: "Tamamlandı" },
};

export const OP_STATUS_LABELS: Record<OperationStatus, L> = {
  pending: { en: "Pending", tr: "Bekliyor" },
  ready: { en: "Ready", tr: "Hazır" },
  running: { en: "Running", tr: "Çalışıyor" },
  paused: { en: "Paused", tr: "Duraklatıldı" },
  done: { en: "Done", tr: "Bitti" },
};

export const MACHINE_STATUS_LABELS: Record<MachineStatus, L> = {
  running: { en: "Running", tr: "Çalışıyor" },
  idle: { en: "Idle", tr: "Boşta" },
  setup: { en: "Setup", tr: "Ayar" },
  down: { en: "Down", tr: "Arızalı" },
  maintenance: { en: "Maintenance", tr: "Bakımda" },
};

export const PRIORITY_LABELS: Record<Priority, L> = {
  low: { en: "Low", tr: "Düşük" },
  normal: { en: "Normal", tr: "Normal" },
  high: { en: "High", tr: "Yüksek" },
  urgent: { en: "Urgent", tr: "Acil" },
};

export const TASK_STATUS_LABELS: Record<TaskStatus, L> = {
  todo: { en: "To do", tr: "Yapılacak" },
  in_progress: { en: "In progress", tr: "Devam ediyor" },
  blocked: { en: "Blocked", tr: "Engellendi" },
  review: { en: "Review", tr: "Onayda" },
  done: { en: "Done", tr: "Tamamlandı" },
};

export const TASK_TYPE_LABELS: Record<TaskType, L> = {
  production: { en: "Production", tr: "Üretim" },
  setup: { en: "Setup / changeover", tr: "Ayar / model değişimi" },
  quality: { en: "Quality", tr: "Kalite" },
  maintenance: { en: "Maintenance", tr: "Bakım" },
  material: { en: "Material", tr: "Malzeme" },
  logistics: { en: "Logistics", tr: "Lojistik" },
  engineering: { en: "Engineering", tr: "Mühendislik" },
};

export const ROLE_LABELS: Record<EmployeeRole, L> = {
  operator: { en: "Machine operator", tr: "Makine operatörü" },
  welder: { en: "Welder", tr: "Kaynakçı" },
  team_lead: { en: "Team lead", tr: "Takım lideri" },
  qc_inspector: { en: "QC inspector", tr: "Kalite kontrolör" },
  maintenance_tech: { en: "Maintenance technician", tr: "Bakım teknisyeni" },
  planner: { en: "Production planner", tr: "Üretim planlamacı" },
  supervisor: { en: "Shift supervisor", tr: "Vardiya amiri" },
  warehouse: { en: "Warehouse operator", tr: "Depo operatörü" },
};

export const SO_STATUS_LABELS: Record<SalesOrderStatus, L> = {
  new: { en: "New", tr: "Yeni" },
  confirmed: { en: "Confirmed", tr: "Onaylandı" },
  in_production: { en: "In production", tr: "Üretimde" },
  ready: { en: "Ready to ship", tr: "Sevke hazır" },
  shipped: { en: "Shipped", tr: "Sevk edildi" },
  delivered: { en: "Delivered", tr: "Teslim edildi" },
};

export const CHANNEL_LABELS: Record<Channel, L> = {
  b2b_portal: { en: "B2B portal", tr: "B2B portal" },
  edi: { en: "EDI", tr: "EDI" },
  email: { en: "E-mail", tr: "E-posta" },
  sales_rep: { en: "Sales rep", tr: "Satış temsilcisi" },
};

export const INSPECTION_TYPE_LABELS: Record<InspectionType, L> = {
  incoming: { en: "Incoming", tr: "Giriş kontrol" },
  first_article: { en: "First article", tr: "İlk parça" },
  in_process: { en: "In-process", tr: "Proses içi" },
  leak_test: { en: "Leak test", tr: "Sızdırmazlık" },
  final: { en: "Final", tr: "Son kontrol" },
};

export const INSPECTION_RESULT_LABELS: Record<InspectionResult, L> = {
  pass: { en: "Pass", tr: "Uygun" },
  fail: { en: "Fail", tr: "Red" },
  conditional: { en: "Conditional", tr: "Şartlı kabul" },
};

export const DEFECT_LABELS: Record<DefectType, L> = {
  weld_porosity: { en: "Weld porosity", tr: "Kaynak gözeneği" },
  weld_crack: { en: "Weld crack", tr: "Kaynak çatlağı" },
  leak: { en: "Leak", tr: "Kaçak" },
  dimensional: { en: "Dimensional", tr: "Ölçüsel" },
  paint_defect: { en: "Paint defect", tr: "Boya hatası" },
  burr_sharp_edge: { en: "Burr / sharp edge", tr: "Çapak / keskin kenar" },
  wrong_marking: { en: "Wrong marking", tr: "Yanlış markalama" },
  dent_scratch: { en: "Dent / scratch", tr: "Ezik / çizik" },
  missing_part: { en: "Missing part", tr: "Eksik parça" },
  material_defect: { en: "Material defect", tr: "Malzeme hatası" },
};

export const NCR_STATUS_LABELS: Record<NcrStatus, L> = {
  open: { en: "Open", tr: "Açık" },
  containment: { en: "Containment", tr: "Önleme (D3)" },
  root_cause: { en: "Root cause", tr: "Kök neden (D4)" },
  corrective_action: { en: "Corrective action", tr: "Düzeltici faaliyet (D5-6)" },
  verification: { en: "Verification", tr: "Doğrulama (D7)" },
  closed: { en: "Closed", tr: "Kapalı" },
};

export const MAINT_TYPE_LABELS: Record<MaintenanceType, L> = {
  preventive: { en: "Preventive", tr: "Önleyici" },
  corrective: { en: "Corrective", tr: "Düzeltici (arıza)" },
  predictive: { en: "Predictive", tr: "Kestirimci" },
  calibration: { en: "Calibration", tr: "Kalibrasyon" },
};

export const MAINT_STATUS_LABELS: Record<MaintenanceStatus, L> = {
  scheduled: { en: "Scheduled", tr: "Planlandı" },
  in_progress: { en: "In progress", tr: "Devam ediyor" },
  waiting_parts: { en: "Waiting for parts", tr: "Parça bekleniyor" },
  completed: { en: "Completed", tr: "Tamamlandı" },
  overdue: { en: "Overdue", tr: "Gecikmiş" },
};

export const MATERIAL_CATEGORY_LABELS: Record<MaterialCategory, L> = {
  sheet_metal: { en: "Sheet metal", tr: "Sac" },
  tube: { en: "Tubes & hoses", tr: "Boru ve hortum" },
  flange_clamp: { en: "Flanges, clamps & brackets", tr: "Flanş, kelepçe, braket" },
  substrate: { en: "Catalyst & DPF substrates", tr: "Katalizör ve DPF substratları" },
  insulation: { en: "Insulation", tr: "İzolasyon" },
  consumable: { en: "Welding consumables", tr: "Kaynak sarf malzemeleri" },
  paint: { en: "Paint & coatings", tr: "Boya ve kaplama" },
  packaging: { en: "Packaging", tr: "Ambalaj" },
  component: { en: "Bought-in components", tr: "Satın alınan komponentler" },
};

export const DOWNTIME_LABELS: Record<DowntimeEvent["reason"], L> = {
  breakdown: { en: "Breakdown", tr: "Arıza" },
  no_material: { en: "No material", tr: "Malzeme yok" },
  setup_changeover: { en: "Setup / changeover", tr: "Ayar / model değişimi" },
  no_operator: { en: "No operator", tr: "Operatör yok" },
  quality_hold: { en: "Quality hold", tr: "Kalite beklemesi" },
  planned_maintenance: { en: "Planned maintenance", tr: "Planlı bakım" },
  tool_change: { en: "Tool / consumable change", tr: "Takım / sarf değişimi" },
};

export const ALL_LABELS = {
  op: OP_LABELS,
  wc: WORK_CENTER_LABELS,
  category: CATEGORY_LABELS,
  woStatus: WO_STATUS_LABELS,
  opStatus: OP_STATUS_LABELS,
  machineStatus: MACHINE_STATUS_LABELS,
  priority: PRIORITY_LABELS,
  taskStatus: TASK_STATUS_LABELS,
  taskType: TASK_TYPE_LABELS,
  role: ROLE_LABELS,
  soStatus: SO_STATUS_LABELS,
  channel: CHANNEL_LABELS,
  inspectionType: INSPECTION_TYPE_LABELS,
  inspectionResult: INSPECTION_RESULT_LABELS,
  defect: DEFECT_LABELS,
  ncrStatus: NCR_STATUS_LABELS,
  maintType: MAINT_TYPE_LABELS,
  maintStatus: MAINT_STATUS_LABELS,
  materialCategory: MATERIAL_CATEGORY_LABELS,
  downtime: DOWNTIME_LABELS,
} as const;

export type LabelKind = keyof typeof ALL_LABELS;

/** Turkish versions of generated free-text reasons (work-order holds). */
export const HOLD_REASON_TR: Record<string, string> = {
  "Material shortage — SiC DPF core (RM-1303)": "Malzeme eksikliği — SiC DPF çekirdeği (RM-1303)",
  "Quality hold — weld porosity investigation": "Kalite beklemesi — kaynak gözeneği incelemesi",
  "Customer requested drawing change (Rev D)": "Müşteri çizim değişikliği talep etti (Rev D)",
  "Waiting for fixture repair": "Fikstür tamiri bekleniyor",
  "Put on hold": "Beklemeye alındı",
};
