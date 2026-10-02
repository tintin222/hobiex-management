import { DraftingCompass, Hammer, Package, Settings2, ShieldCheck, Truck, Wrench, type LucideIcon } from "lucide-react";
import type { Task, TaskStatus, TaskType } from "@/lib/data/types";

export const STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked", "review", "done"];
export const TASK_TYPES: TaskType[] = ["production", "setup", "quality", "maintenance", "material", "logistics", "engineering"];

export const TYPE_ICON: Record<TaskType, LucideIcon> = {
  production: Hammer,
  setup: Settings2,
  quality: ShieldCheck,
  maintenance: Wrench,
  material: Package,
  logistics: Truck,
  engineering: DraftingCompass,
};

export const PRIORITY_RANK: Record<Task["priority"], number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/** Standard checklist attached to new tasks of each type. */
export const DEFAULT_CHECKLIST: Record<TaskType, [string, string][]> = {
  production: [["Check work instruction", "İş talimatını kontrol et"], ["Verify material lots", "Malzeme lotlarını doğrula"], ["Report quantity", "Miktar bildir"], ["Clean workstation", "İstasyonu temizle"]],
  setup: [["Remove previous fixture", "Önceki fikstürü sök"], ["Load CNC / robot program", "CNC / robot programını yükle"], ["Mount fixture & tools", "Fikstür ve takımları bağla"], ["First-off check", "İlk parça kontrolü"], ["Release to production", "Üretime serbest bırak"]],
  quality: [["Collect samples", "Numune al"], ["Measure critical dimensions", "Kritik ölçüleri ölç"], ["Record results in control plan", "Sonuçları kontrol planına gir"], ["Sign off", "Onayla"]],
  maintenance: [["Lock-out / tag-out", "Kilitle / etiketle (LOTO)"], ["Replace worn parts", "Aşınan parçaları değiştir"], ["Test run", "Test çalıştırması"], ["Update maintenance log", "Bakım kaydını güncelle"]],
  material: [["Print pick list", "Toplama listesini yazdır"], ["Pick materials", "Malzemeleri topla"], ["Scan lot numbers", "Lot numaralarını okut"], ["Deliver to line", "Hatta teslim et"]],
  logistics: [["Packing list", "Çeki listesi"], ["Commercial invoice", "Ticari fatura"], ["Certificate of origin (EUR.1 / A.TR)", "Menşe belgesi (EUR.1 / A.TR)"], ["Loading photos", "Yükleme fotoğrafları"]],
  engineering: [["Draft", "Taslak"], ["Peer review", "Gözden geçirme"], ["Approve", "Onay"], ["Publish to shop floor", "Atölyeye yayınla"]],
};

/** Turkish versions of the generated shop-floor comments. */
export const COMMENT_TR: Record<string, string> = {
  "Started, first pieces look good.": "Başladık, ilk parçalar iyi görünüyor.",
  "Fixture clamps worn — requested spares.": "Fikstür bağlama elemanları aşınmış — yedek talep edildi.",
  "Waiting on forklift, will continue after break.": "Forklift bekleniyor, moladan sonra devam edilecek.",
  "Checked with QC, OK to proceed.": "Kalite ile kontrol edildi, devam edilebilir.",
  "Material lot scanned and verified.": "Malzeme lotu okutuldu ve doğrulandı.",
  "Customer asked for photos before loading.": "Müşteri yükleme öncesi fotoğraf istedi.",
  "Program updated to v3, cycle time −8%.": "Program v3'e güncellendi, çevrim süresi −%8.",
  "Need second welder for this batch.": "Bu parti için ikinci kaynakçı gerekiyor.",
};

/**
 * Guard against records without a priority (the generator currently leaves
 * some maintenance tasks with `priority: undefined`); treat them as normal.
 */
export function normalizeTask(t: Task): Task {
  return t.priority ? t : { ...t, priority: "normal" };
}

export const isOverdue = (t: Task, now: number) => t.status !== "done" && Date.parse(t.dueAt) < now;

/**
 * Tasks carry no completion timestamp; for generated "done" tasks assume they
 * closed at 80 % of their planned window. Completions made in this session
 * are tracked exactly (see actions.ts).
 */
export function completedAt(t: Task, now: number, session: Record<string, number>): number {
  if (session[t.id]) return session[t.id];
  const c = Date.parse(t.createdAt);
  return Math.min(now, c + (Date.parse(t.dueAt) - c) * 0.8);
}
