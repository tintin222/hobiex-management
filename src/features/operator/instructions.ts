/**
 * Work-instruction content shown on the operator terminal: quality
 * checkpoints and PPE / safety notes per operation type, breakdown reasons,
 * and the defects most likely at each operation. Bilingual data, rendered
 * through `useTx()`.
 */
import type { DefectType, Machine, MaintenanceOrder, OperationType } from "@/lib/data/types";

export type L = { en: string; tr: string };

const GAS: L = { en: "Check shielding gas flow 14–16 L/min at shift start", tr: "Vardiya başında koruyucu gaz debisini kontrol et: 14–16 L/dk" };
const WELD_VISUAL: L = { en: "Visual weld check every 10 pcs — no porosity, undercut or spatter", tr: "Her 10 parçada gözle kaynak kontrolü — gözenek, yanma oluğu, sıçrantı yok" };

export const CHECKPOINTS: Record<OperationType, L[]> = {
  laser_cutting: [
    { en: "First piece: check contour against drawing (±0.2 mm)", tr: "İlk parça: konturu teknik resme göre kontrol et (±0,2 mm)" },
    { en: "Verify sheet grade and thickness on the material label", tr: "Sac kalitesini ve kalınlığını malzeme etiketinden doğrula" },
    { en: "Cut edges free of dross and burrs", tr: "Kesim kenarlarında cüruf ve çapak olmamalı" },
  ],
  press_forming: [
    { en: "First piece: check draw depth and flange flatness", tr: "İlk parça: çekme derinliği ve flanş düzlüğünü kontrol et" },
    { en: "Inspect radii for cracks or wrinkles every 20 pcs", tr: "Her 20 parçada radyüslerde çatlak veya kırışma kontrolü" },
    { en: "Confirm die lubrication before each batch", tr: "Her partiden önce kalıp yağlamasını teyit et" },
  ],
  sheet_rolling: [
    { en: "Check diameter and roundness with the template", tr: "Çap ve yuvarlaklığı şablonla kontrol et" },
    { en: "Seam gap ≤ 0.5 mm before welding", tr: "Kaynak öncesi ağız aralığı ≤ 0,5 mm" },
    { en: "No surface scratches or roll marks", tr: "Yüzeyde çizik veya merdane izi olmamalı" },
  ],
  tube_cutting: [
    { en: "Cut length ±0.5 mm — measure every 10 pcs", tr: "Kesim boyu ±0,5 mm — her 10 parçada ölç" },
    { en: "Check squareness of the cut face", tr: "Kesim yüzeyinin dikliğini kontrol et" },
    { en: "Deburr inside and outside", tr: "İç ve dış çapağı al" },
  ],
  tube_bending: [
    { en: "Check bend angles on the gauge fixture (first piece + every 15)", tr: "Büküm açılarını mastar fikstüründe kontrol et (ilk parça + her 15 parçada)" },
    { en: "Ovality at bends ≤ 8 %", tr: "Büküm bölgesinde ovallik ≤ %8" },
    { en: "No wrinkles on the inner radius", tr: "İç radyüste buruşma olmamalı" },
  ],
  cnc_machining: [
    { en: "Measure critical bores with plug gauge (first piece + every 10)", tr: "Kritik delikleri tampon mastarla ölç (ilk parça + her 10 parçada)" },
    { en: "Sealing faces Ra ≤ 1.6 µm", tr: "Sızdırmazlık yüzeylerinde Ra ≤ 1,6 µm" },
    { en: "Check tool-life counter before each batch", tr: "Her partiden önce takım ömrü sayacını kontrol et" },
  ],
  robotic_welding: [
    GAS,
    WELD_VISUAL,
    { en: "Robot program number must match the work order", tr: "Robot program numarası iş emriyle eşleşmeli" },
    { en: "Clean torch nozzle every 50 cycles", tr: "Her 50 çevrimde torç nozulunu temizle" },
  ],
  manual_welding: [
    GAS,
    WELD_VISUAL,
    { en: "Follow WPS-135-07 parameters (current, voltage, travel speed)", tr: "WPS-135-07 parametrelerine uy (akım, gerilim, ilerleme hızı)" },
  ],
  seam_welding: [
    GAS,
    { en: "Check seam-tracking sensor alignment at start", tr: "Başlangıçta dikiş takip sensörünün hizasını kontrol et" },
    { en: "Visual check of full seam length every 10 pcs", tr: "Her 10 parçada dikişin tüm boyunu gözle kontrol et" },
  ],
  canning: [
    { en: "Mat density (GBD) 0.40–0.45 g/cm³ — weigh each mat", tr: "Mat yoğunluğu (GBD) 0,40–0,45 g/cm³ — her matı tart" },
    { en: "Scan substrate serial numbers into the lot", tr: "Substrat seri numaralarını lota okut" },
    { en: "Push-out force test on first piece", tr: "İlk parçada itme kuvveti testi" },
  ],
  assembly: [
    { en: "Poka-yoke fixture must confirm all components", tr: "Poka-yoke fikstürü tüm parçaları doğrulamalı" },
    { en: "Torque clamps to 45 Nm with the controlled tool", tr: "Kelepçeleri kontrollü anahtarla 45 Nm torkla sık" },
    { en: "Check part marking and label", tr: "Parça markalaması ve etiketi kontrol et" },
  ],
  leak_test: [
    { en: "Daily master-part check passed before testing", tr: "Testten önce günlük master parça kontrolü yapılmış olmalı" },
    { en: "Test at 1.5 bar — leak rate < 3 cm³/min", tr: "1,5 bar'da test — kaçak oranı < 3 cm³/dk" },
    { en: "Mark passed parts with a green paint dot", tr: "Uygun parçaları yeşil boya noktasıyla işaretle" },
  ],
  pressure_test: [
    { en: "Hydrostatic test at 1.5× working pressure, hold 60 s", tr: "Çalışma basıncının 1,5 katında hidrostatik test, 60 sn bekle" },
    { en: "No visible deformation or weeping", tr: "Görünür deformasyon veya terleme olmamalı" },
    { en: "Record test pressure per serial number", tr: "Seri numarası bazında test basıncını kaydet" },
  ],
  painting: [
    { en: "Dry film thickness 60–90 µm — measure every 20 pcs", tr: "Kuru film kalınlığı 60–90 µm — her 20 parçada ölç" },
    { en: "Oven at 190 °C ± 5 °C", tr: "Fırın sıcaklığı 190 °C ± 5 °C" },
    { en: "No runs, orange peel or uncoated spots", tr: "Akma, portakal kabuğu veya boyasız bölge olmamalı" },
  ],
  insulation: [
    { en: "Wrap overlap ≥ 30 mm", tr: "Sarma bindirmesi ≥ 30 mm" },
    { en: "Cladding seams closed and riveted", tr: "Kaplama ek yerleri kapatılmış ve perçinlenmiş olmalı" },
    { en: "Surface temperature test on first piece", tr: "İlk parçada yüzey sıcaklığı testi" },
  ],
  final_inspection: [
    { en: "Check dimensions on the gauge per control plan", tr: "Kontrol planına göre mastarda ölçü kontrolü" },
    { en: "Verify marking: part number, lot, date code", tr: "Markalamayı doğrula: parça no, lot, tarih kodu" },
    { en: "Visual: no dents, scratches or paint defects", tr: "Görsel: ezik, çizik veya boya hatası olmamalı" },
  ],
  packing: [
    { en: "Pack per the customer packing instruction", tr: "Müşteri ambalaj talimatına göre paketle" },
    { en: "Label every box with lot and quantity", tr: "Her kutuyu lot ve miktarla etiketle" },
    { en: "Scan the pallet label to close the lot", tr: "Lotu kapatmak için palet etiketini okut" },
  ],
};

const WELD_PPE: L = {
  en: "Auto-darkening helmet, leather gloves, flame-retardant clothing. Fume extraction must be ON.",
  tr: "Otomatik kararan maske, deri eldiven, alev geciktirici kıyafet. Duman emişi AÇIK olmalı.",
};

export const SAFETY: Record<OperationType, L> = {
  laser_cutting: { en: "Safety glasses and cut-resistant gloves. Never open the enclosure while cutting.", tr: "Koruyucu gözlük ve kesilmeye dayanıklı eldiven. Kesim sırasında kabini asla açma." },
  press_forming: { en: "Test two-hand control and light curtain at shift start. Cut-resistant gloves, safety shoes.", tr: "Vardiya başında çift el kumandası ve ışık perdesini test et. Kesilmeye dayanıklı eldiven, iş ayakkabısı." },
  sheet_rolling: { en: "Keep hands clear of the rolls. Gloves and safety shoes.", tr: "Ellerini merdanelerden uzak tut. Eldiven ve iş ayakkabısı." },
  tube_cutting: { en: "Safety glasses and hearing protection. Never remove the blade guard.", tr: "Koruyucu gözlük ve kulaklık. Testere koruyucusunu asla çıkarma." },
  tube_bending: { en: "Stay outside the bending zone while the machine cycles. Gloves, safety shoes.", tr: "Makine çalışırken büküm alanının dışında kal. Eldiven, iş ayakkabısı." },
  cnc_machining: { en: "Safety glasses. Keep the door closed while the spindle is running.", tr: "Koruyucu gözlük. İş mili dönerken kapıyı kapalı tut." },
  robotic_welding: { en: "Load parts only with the cell door interlocked. Safety glasses and gloves.", tr: "Parçaları yalnızca hücre kapısı kilitliyken yükle. Koruyucu gözlük ve eldiven." },
  manual_welding: WELD_PPE,
  seam_welding: WELD_PPE,
  canning: { en: "Gloves and FFP2 mask when handling mats. Use two-hand control.", tr: "Mat taşırken eldiven ve FFP2 maske. Çift el kumandası kullan." },
  assembly: { en: "Gloves and safety shoes. Use the torque tool — no impact wrenches.", tr: "Eldiven ve iş ayakkabısı. Tork anahtarı kullan — darbeli anahtar yok." },
  leak_test: { en: "Stay behind the shield during pressurisation. Safety glasses.", tr: "Basınçlandırma sırasında koruyucu siperin arkasında dur. Koruyucu gözlük." },
  pressure_test: { en: "Stay behind the shield during pressurisation. Safety glasses.", tr: "Basınçlandırma sırasında koruyucu siperin arkasında dur. Koruyucu gözlük." },
  painting: { en: "Respirator, chemical gloves and antistatic shoes. No open flame in the booth.", tr: "Solunum maskesi, kimyasal eldiven ve antistatik ayakkabı. Kabinde açık ateş yok." },
  insulation: { en: "FFP2 mask, long sleeves and gloves when handling mineral wool.", tr: "Taş yünü ile çalışırken FFP2 maske, uzun kollu kıyafet ve eldiven." },
  final_inspection: { en: "Gloves for sharp edges, safety shoes.", tr: "Keskin kenarlar için eldiven, iş ayakkabısı." },
  packing: { en: "Safety shoes. Keep forklift lanes clear.", tr: "İş ayakkabısı. Forklift yollarını açık tut." },
};

/** Defects to show first in the scrap dialog, by operation. */
export const LIKELY_DEFECTS: Partial<Record<OperationType, DefectType[]>> = {
  laser_cutting: ["dimensional", "burr_sharp_edge", "material_defect"],
  press_forming: ["dimensional", "material_defect", "dent_scratch"],
  sheet_rolling: ["dimensional", "dent_scratch"],
  tube_cutting: ["dimensional", "burr_sharp_edge"],
  tube_bending: ["dimensional", "dent_scratch"],
  cnc_machining: ["dimensional", "burr_sharp_edge"],
  robotic_welding: ["weld_porosity", "weld_crack"],
  manual_welding: ["weld_porosity", "weld_crack"],
  seam_welding: ["weld_porosity", "weld_crack", "leak"],
  canning: ["missing_part", "material_defect"],
  assembly: ["missing_part", "wrong_marking"],
  leak_test: ["leak", "weld_porosity"],
  pressure_test: ["leak", "weld_crack"],
  painting: ["paint_defect", "dent_scratch"],
  insulation: ["dent_scratch", "missing_part"],
  final_inspection: ["dimensional", "wrong_marking", "dent_scratch"],
  packing: ["dent_scratch", "wrong_marking"],
};

export type BreakdownKind = "electrical" | "hydraulic" | "mechanical" | "welding_source" | "sensor" | "tooling" | "supply" | "plc";

export const BREAKDOWN_REASONS: Record<BreakdownKind, L> = {
  electrical: { en: "Electrical fault", tr: "Elektrik arızası" },
  hydraulic: { en: "Hydraulic / pneumatic leak", tr: "Hidrolik / pnömatik kaçak" },
  mechanical: { en: "Mechanical jam", tr: "Mekanik sıkışma" },
  welding_source: { en: "Welding power source fault", tr: "Kaynak güç ünitesi arızası" },
  sensor: { en: "Sensor or safety device fault", tr: "Sensör veya emniyet cihazı arızası" },
  tooling: { en: "Fixture or tooling broken", tr: "Fikstür veya takım kırıldı" },
  supply: { en: "Gas / coolant supply problem", tr: "Gaz / soğutma sıvısı besleme sorunu" },
  plc: { en: "PLC / controller alarm", tr: "PLC / kontrol ünitesi alarmı" },
};

/** Translate a free-text machine down reason when it is one of ours. */
export function reasonTr(en: string): string | undefined {
  return Object.values(BREAKDOWN_REASONS).find((r) => r.en === en)?.tr;
}

/** Open corrective maintenance order for a machine (the one matching its down reason first). */
export function openCorrective(m: Machine, maintenance: MaintenanceOrder[]): MaintenanceOrder | undefined {
  const open = maintenance.filter((x) => x.machineId === m.id && x.type === "corrective" && x.status !== "completed");
  return open.find((x) => x.title === m.downReason) ?? open[0];
}

/** Bilingual down reason: from the corrective order when there is one. */
export function downReason(m: Machine, maintenance: MaintenanceOrder[]): L | undefined {
  if (!m.downReason) return undefined;
  const mo = openCorrective(m, maintenance);
  if (mo && mo.title === m.downReason) return { en: mo.title, tr: mo.titleTr };
  return { en: m.downReason, tr: reasonTr(m.downReason) ?? m.downReason };
}
