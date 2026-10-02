/**
 * Rule-based "smart insights": scans the dataset for the things a production
 * director would want surfaced first — stopped machines, orders drifting
 * late, material that will run out, overdue maintenance, bottlenecks.
 */
import { DAY, HOUR, localDateOf, MIN } from "./data/clock";
import type { Dataset, Insight } from "./data/types";

export function computeInsights(db: Dataset, now: number): Insight[] {
  const out: Insight[] = [];
  const machineById = new Map(db.machines.map((m) => [m.id, m]));
  const productById = new Map(db.products.map((p) => [p.id, p]));

  // 1. machines down
  for (const m of db.machines.filter((x) => x.status === "down")) {
    const mins = Math.round((now - Date.parse(m.statusSince)) / MIN);
    const waiting = db.workOrders.filter((w) => w.status !== "completed" && w.operations.some((o) => o.machineId === m.id && o.status !== "done" && Date.parse(o.plannedStart) < now + 8 * HOUR)).length;
    out.push({
      id: `down-${m.id}`,
      severity: "critical",
      kind: "maintenance",
      title: `${m.id} down for ${mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}`,
      titleTr: `${m.id} ${mins >= 60 ? `${Math.floor(mins / 60)} sa ${mins % 60} dk` : `${mins} dk`}dır duruşta`,
      detail: `${m.downReason ?? "Breakdown"} · ${waiting} work orders queued on this machine in the next 8 h.`,
      detailTr: `${m.downReasonTr ?? m.downReason ?? "Arıza"} · Önümüzdeki 8 saatte bu makinede ${waiting} iş emri sırada.`,
      href: `/shop-floor?machine=${m.id}`,
      impact: `${waiting} WO`,
    });
  }

  // 2. late risk
  const today = localDateOf(now);
  const late = db.workOrders.filter((w) => w.status !== "completed" && (localDateOf(Date.parse(w.plannedEnd)) > w.dueDate || today > w.dueDate));
  if (late.length) {
    const custOrders = late.filter((w) => w.customerId);
    const value = custOrders.reduce((s, w) => s + w.qty * (productById.get(w.productId)?.listPriceEur ?? 0), 0);
    out.push({
      id: "late",
      severity: late.length > 8 ? "critical" : "warning",
      kind: "late_risk",
      title: `${late.length} work orders projected to miss their due date`,
      titleTr: `${late.length} iş emri termin tarihini kaçıracak`,
      detail: `${custOrders.length} are customer orders worth ≈ €${Math.round(value / 1000)}k. Re-sequence or add overtime on the bottleneck.`,
      detailTr: `${custOrders.length} tanesi müşteri siparişi, değeri ≈ €${Math.round(value / 1000)}k. Darboğazda sıralamayı değiştirin veya fazla mesai ekleyin.`,
      href: "/work-orders?view=late",
      impact: `€${Math.round(value / 1000)}k`,
    });
  }

  // 3. materials
  for (const mat of db.materials.filter((m) => m.onHand < m.reorderPoint).sort((a, b) => a.onHand / a.dailyUsage - b.onHand / b.dailyUsage)) {
    const cover = mat.onHand / Math.max(1, mat.dailyUsage);
    const affected = db.workOrders.filter((w) => (w.status === "planned" || w.status === "released") && productById.get(w.productId)?.bom.some((b) => b.materialId === mat.id)).length;
    const critical = mat.onHand < mat.safetyStock;
    out.push({
      id: `mat-${mat.id}`,
      severity: critical ? "critical" : "warning",
      kind: "material",
      title: `${mat.name}: ${cover.toFixed(1)} days of cover`,
      titleTr: `${mat.nameTr}: ${cover.toFixed(1)} günlük stok`,
      detail: `${critical ? "Below safety stock" : "Below reorder point"} · lead time ${mat.leadTimeDays} d · ${affected} upcoming work orders consume it.`,
      detailTr: `${critical ? "Emniyet stoğunun altında" : "Yeniden sipariş noktasının altında"} · tedarik süresi ${mat.leadTimeDays} g · ${affected} planlı iş emri kullanıyor.`,
      href: `/inventory?material=${mat.id}`,
      impact: `${affected} WO`,
    });
  }

  // 4. bottleneck next 72 h
  const horizon = now + 3 * DAY;
  const load = new Map<string, number>();
  for (const w of db.workOrders)
    for (const o of w.operations) {
      if (o.status === "done") continue;
      const s = Math.max(Date.parse(o.plannedStart), now);
      const e = Math.min(Date.parse(o.plannedEnd), horizon);
      if (e > s) load.set(o.machineId, (load.get(o.machineId) ?? 0) + (e - s));
    }
  const ranked = [...load.entries()].map(([id, ms]) => [id, ms / (3 * DAY)] as const).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (top && top[1] > 0.8) {
    const m = machineById.get(top[0])!;
    const alt = ranked.filter(([id]) => {
      const x = machineById.get(id)!;
      return id !== m.id && x.type === m.type && x.plantId === m.plantId;
    }).sort((a, b) => a[1] - b[1])[0];
    out.push({
      id: "bottleneck",
      severity: top[1] > 0.92 ? "warning" : "info",
      kind: "bottleneck",
      title: `Bottleneck: ${m.id} at ${Math.round(top[1] * 100)}% load for the next 72 h`,
      titleTr: `Darboğaz: ${m.id} önümüzdeki 72 saatte %${Math.round(top[1] * 100)} yüklü`,
      detail: alt ? `${alt[0]} (same work center) is at ${Math.round(alt[1] * 100)}% — move 1–2 operations to balance the line.` : `No alternative ${m.type} in this plant — consider a weekend shift.`,
      detailTr: alt ? `${alt[0]} (aynı iş merkezi) %${Math.round(alt[1] * 100)} yüklü — hattı dengelemek için 1–2 operasyonu taşıyın.` : `Bu fabrikada alternatif makine yok — hafta sonu vardiyası düşünün.`,
      href: `/planning?machine=${m.id}`,
      impact: `${Math.round(top[1] * 100)}%`,
    });
  }

  // 5. maintenance overdue
  const overdue = db.maintenance.filter((m) => m.status === "overdue");
  if (overdue.length)
    out.push({
      id: "pm-overdue",
      severity: "warning",
      kind: "maintenance",
      title: `${overdue.length} preventive maintenance jobs overdue`,
      titleTr: `${overdue.length} önleyici bakım işi gecikmiş`,
      detail: `Machines: ${overdue.map((m) => m.machineId).join(", ")}. Schedule them in the next planned changeover window.`,
      detailTr: `Makineler: ${overdue.map((m) => m.machineId).join(", ")}. Bir sonraki planlı model değişimi aralığına yerleştirin.`,
      href: "/maintenance?status=overdue",
    });

  // 6. quality
  const openCritical = db.ncrs.filter((n) => n.status !== "closed" && n.severity === "critical");
  const recent = db.inspections.filter((i) => Date.parse(i.at) > now - 7 * DAY && i.type !== "incoming");
  const fails = recent.filter((i) => i.result === "fail").length;
  if (openCritical.length || fails)
    out.push({
      id: "quality",
      severity: openCritical.length ? "warning" : "info",
      kind: "quality",
      title: openCritical.length ? `${openCritical.length} critical NCRs still open` : `${fails} failed inspections in the last 7 days`,
      titleTr: openCritical.length ? `${openCritical.length} kritik uygunsuzluk (NCR) açık` : `Son 7 günde ${fails} red muayene`,
      detail: `First-pass yield last 7 days: ${(((recent.length - fails) / Math.max(1, recent.length)) * 100).toFixed(1)}% over ${recent.length} inspections.`,
      detailTr: `Son 7 gün ilk seferde doğru oranı: %${(((recent.length - fails) / Math.max(1, recent.length)) * 100).toFixed(1)} (${recent.length} muayene).`,
      href: "/quality",
    });

  // 7. B2B orders waiting
  const fresh = db.salesOrders.filter((s) => s.status === "new");
  if (fresh.length)
    out.push({
      id: "b2b",
      severity: "info",
      kind: "capacity",
      title: `${fresh.length} new orders from the B2B portal awaiting release`,
      titleTr: `B2B portaldan gelen ${fresh.length} yeni sipariş üretime aktarılmayı bekliyor`,
      detail: `One click converts them into scheduled work orders with capacity-checked delivery dates.`,
      detailTr: `Tek tıkla kapasite kontrollü termin tarihleriyle planlanmış iş emirlerine dönüştürülür.`,
      href: "/orders?status=new",
      impact: `€${Math.round(fresh.reduce((s, o) => s + o.totalEur, 0) / 1000)}k`,
    });

  const rank = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
