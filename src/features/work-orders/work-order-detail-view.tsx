"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarCheck2,
  CalendarClock,
  ClipboardList,
  GitBranch,
  Package,
  PauseCircle,
  Play,
  Printer,
  SearchX,
  Send,
} from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { MIN } from "@/lib/data/clock";
import type { Priority, WorkOrder } from "@/lib/data/types";
import { isLate, useLookups } from "@/lib/hooks";
import { toast, useClock } from "@/lib/store";
import { cn } from "@/lib/cn";
import { PageContainer } from "@/components/layout/app-shell";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  IdLink,
  KeyValue,
  PageHeader,
  PersonChip,
  PriorityBadge,
  Progress,
  Select,
  StatusBadge,
} from "@/components/ui";
import { woActions } from "./actions";
import { HoldModal } from "./hold-modal";
import { messages } from "./messages";
import { useReasonTx } from "./reasons";
import { MaterialStatusBadge } from "./ui";
import { WoActivity } from "./wo-activity";
import { WoMaterials } from "./wo-materials";
import { WoOperations } from "./wo-operations";
import { WoQuality } from "./wo-quality";
import { WoTraveler } from "./wo-traveler";
import { currentOp, goodOutput, workProgress } from "./wo-utils";

const PRIORITIES: Priority[] = ["urgent", "high", "normal", "low"];
const linkBtn =
  "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium whitespace-nowrap text-ink shadow-sm transition-colors hover:bg-surface-2";

export function WorkOrderDetailView({ id }: { id: string }) {
  const lk = useLookups();
  const wo = lk.workOrder.get(id);
  return wo ? <Detail wo={wo} /> : <NotFound id={id} />;
}

function NotFound({ id }: { id: string }) {
  const t = useT(messages);
  return (
    <PageContainer>
      <PageHeader breadcrumbs={[{ label: t("nav.workOrders"), href: "/work-orders" }, { label: id }]} title={id} />
      <Card>
        <EmptyState
          icon={<SearchX className="size-5" />}
          title={t("detail.notFound")}
          hint={t("detail.notFoundHint", { id })}
          action={
            <Link href="/work-orders" className={linkBtn}>
              <ClipboardList className="size-4" />
              {t("detail.back")}
            </Link>
          }
        />
      </Card>
    </PageContainer>
  );
}

function Detail({ wo }: { wo: WorkOrder }) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const label = useLabel();
  const reasonTx = useReasonTx();
  const clock = useClock();
  const lk = useLookups();
  const [holding, setHolding] = useState(false);

  const product = lk.product.get(wo.productId)!;
  const plant = lk.plant.get(wo.plantId)!;
  const customer = wo.customerId ? lk.customer.get(wo.customerId) : undefined;
  const late = isLate(wo, clock.today);
  const cur = wo.status === "completed" ? undefined : currentOp(wo);
  const good = goodOutput(wo);
  const work = workProgress(wo);
  const yieldPct = wo.qty ? (wo.status === "completed" ? wo.qtyDone / wo.qty : (wo.qty - wo.qtyScrap) / wo.qty) : 1;
  const finish = Date.parse(wo.actualEnd ?? wo.plannedEnd);
  const buffer = Date.parse(`${wo.dueDate}T23:59:59+03:00`) - finish;
  const leadMin = (finish - Date.parse(wo.createdAt)) / MIN;
  const actualStart = wo.actualStart ?? wo.operations[0].actualStart;

  const release = () => {
    woActions.release(wo.id);
    toast({ title: t("toast.released", { id: wo.id }), description: t("toast.releasedDesc", { machine: wo.operations[0].machineId }), tone: "good" });
  };
  const resume = () => {
    woActions.resume(wo.id);
    toast({ title: t("toast.resumed", { id: wo.id }), tone: "good" });
  };
  const hold = (reason: string) => {
    woActions.hold(wo.id, reason);
    setHolding(false);
    toast({ title: t("toast.held", { id: wo.id }), description: reasonTx(reason), tone: "warn" });
  };
  const setPriority = (p: Priority) => {
    woActions.setPriority(wo.id, p);
    toast({ title: t("toast.priority", { id: wo.id, p: label("priority", p) }), tone: "info" });
  };

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ label: t("nav.workOrders"), href: "/work-orders" }, { label: wo.id }]}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="tabular">{wo.id}</span>
            <span className="flex flex-wrap items-center gap-1.5">
              <StatusBadge kind="woStatus" value={wo.status} />
              {wo.priority !== "normal" && <PriorityBadge value={wo.priority} />}
              {late && (
                <Badge tone="critical" icon={<AlertTriangle className="size-3.5" />}>
                  {t("common.late")}
                </Badge>
              )}
            </span>
          </span>
        }
        subtitle={
          <>
            <span className="font-medium text-ink-2">{product.sku}</span> · {product.name} · {plant.code}
          </>
        }
        actions={
          <>
            <Select value={wo.priority} onChange={(e) => setPriority(e.target.value as Priority)} className="w-auto min-w-40" aria-label={t("common.priority")} disabled={wo.status === "completed"}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t("act.priorityOpt", { p: label("priority", p) })}
                </option>
              ))}
            </Select>
            {wo.status === "planned" && (
              <Button variant="primary" icon={<Send className="size-4" />} onClick={release}>
                {t("act.release")}
              </Button>
            )}
            {wo.status === "on_hold" ? (
              <Button variant="primary" icon={<Play className="size-4" />} onClick={resume}>
                {t("act.resume")}
              </Button>
            ) : (
              wo.status !== "completed" && (
                <Button icon={<PauseCircle className="size-4" />} onClick={() => setHolding(true)}>
                  {t("act.hold")}
                </Button>
              )
            )}
            <Link href={`/traceability?q=${encodeURIComponent(wo.lotNo)}`} className={linkBtn}>
              <GitBranch className="size-4" />
              {t("act.trace")}
            </Link>
            <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>
              {t("act.print")}
            </Button>
          </>
        }
      />

      {wo.status === "on_hold" && (
        <div role="alert" className="mb-4 flex flex-wrap items-start gap-3 rounded-xl border border-warn/50 bg-warn-soft px-4 py-3">
          <PauseCircle className="mt-0.5 size-5 shrink-0 text-warn-ink" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-warn-ink">{t("hold.banner")}</p>
            <p className="mt-0.5 text-[13px] text-ink">{reasonTx(wo.holdReason)}</p>
            <p className="mt-0.5 text-xs text-ink-3">{t("hold.bannerHint")}</p>
          </div>
          <Button size="sm" icon={<Play className="size-3.5" />} onClick={resume}>
            {t("act.resume")}
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Product */}
        <Card className="flex flex-col overflow-hidden">
          <div className="relative aspect-[16/7] bg-surface-3">
            <Image src={product.image} alt={product.name} fill sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw" className="object-cover" />
            <span className="absolute top-3 left-3">
              <Badge className="bg-black/55 text-white backdrop-blur-sm">{label("category", product.category)}</Badge>
            </span>
          </div>
          <div className="flex flex-1 flex-col p-4">
            <div className="text-xs text-ink-3">{t("card.product")}</div>
            <Link href={`/products/${product.id}`} className="mt-0.5 text-[15px] font-semibold text-ink hover:text-brand hover:underline">
              {product.sku}
            </Link>
            <p className="line-clamp-2 text-[13px] text-ink-2">{product.name}</p>
            <KeyValue
              className="mt-3"
              items={[
                { label: t("card.oem"), value: product.model ? `${product.oem} ${product.model}` : product.oem },
                { label: t("card.oemRef"), value: <span className="tabular">{product.oemRef}</span> },
                { label: t("card.drawing"), value: product.drawingRev },
                { label: t("card.norm"), value: product.euroNorm },
              ]}
            />
            <Link href={`/products/${product.id}`} className="mt-auto inline-flex items-center gap-1 pt-3 text-[13px] font-medium text-brand hover:underline">
              {t("card.viewProduct")}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </Card>

        {/* Quantities */}
        <Card className="flex flex-col">
          <CardHeader title={t("card.quantities")} subtitle={`${t("card.ordered")}: ${fmt.num(wo.qty)} ${t("common.pcs")}`} icon={<Boxes className="size-4" />} />
          <CardBody className="flex flex-1 flex-col gap-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-surface-2 py-2">
                <div className="font-display text-xl font-semibold text-ink tabular">{fmt.num(good)}</div>
                <div className="text-[11px] text-ink-3">{t("card.good")}</div>
              </div>
              <div className="rounded-lg bg-surface-2 py-2">
                <div className={cn("font-display text-xl font-semibold tabular", wo.qtyScrap ? "text-serious-ink" : "text-ink")}>{fmt.num(wo.qtyScrap)}</div>
                <div className="text-[11px] text-ink-3">{t("common.scrap")}</div>
              </div>
              <div className="rounded-lg bg-surface-2 py-2">
                <div className="font-display text-xl font-semibold text-ink tabular">{fmt.pct(yieldPct, 1)}</div>
                <div className="text-[11px] text-ink-3">{t("card.yield")}</div>
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-ink-2">{t("card.workDone")}</span>
                <span className="font-medium text-ink tabular">{fmt.pct(work)}</span>
              </div>
              <Progress value={work} tone={wo.status === "completed" ? "good" : wo.status === "on_hold" ? "warn" : late ? "critical" : "brand"} />
            </div>
            {cur && (
              <div className="mt-auto rounded-lg border border-line px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-ink">{t("card.atOp", { seq: cur.seq, op: label("op", cur.operation) })}</span>
                  <StatusBadge kind="opStatus" value={cur.status} />
                </div>
                <div className="mt-0.5 text-xs text-ink-3 tabular">
                  {cur.machineId} · {t("card.atOpQty", { n: fmt.num(cur.qtyDone), qty: fmt.num(wo.qty) })}
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Schedule */}
        <Card>
          <CardHeader
            title={t("card.schedule")}
            icon={<CalendarClock className="size-4" />}
            actions={
              late ? (
                <Badge tone="critical" icon={<AlertTriangle className="size-3.5" />}>
                  {t("common.late")}
                </Badge>
              ) : (
                <Badge tone="good" icon={<CalendarCheck2 className="size-3.5" />}>
                  {t("common.onTime")}
                </Badge>
              )
            }
          />
          <CardBody>
            <KeyValue
              items={[
                { label: t("card.plannedStart"), value: <span className="tabular">{fmt.dateTime(wo.plannedStart)}</span> },
                { label: t("card.plannedEnd"), value: <span className="tabular">{fmt.dateTime(wo.plannedEnd)}</span> },
                { label: t("card.actualStart"), value: <span className="tabular">{actualStart ? fmt.dateTime(actualStart) : "—"}</span> },
                { label: t("card.actualEnd"), value: <span className="tabular">{wo.actualEnd ? fmt.dateTime(wo.actualEnd) : "—"}</span> },
                {
                  label: t("common.dueDate"),
                  value: <span className={cn("tabular", late && "text-critical-ink")}>{fmt.dateLong(wo.dueDate)}</span>,
                },
                {
                  label: t("card.slack"),
                  value:
                    buffer >= 0 ? (
                      <span className="text-good-ink tabular">{fmt.duration(buffer / MIN)}</span>
                    ) : (
                      <span className="text-critical-ink tabular">{t("card.slackLate", { d: fmt.duration(-buffer / MIN) })}</span>
                    ),
                },
                { label: t("card.leadTime"), value: <span className="tabular">{fmt.duration(Math.max(0, leadMin))}</span> },
                { label: t("common.plant"), value: `${plant.code} · ${tx(plant.name, plant.nameTr).split("·")[1]?.trim() ?? ""}` },
              ]}
            />
          </CardBody>
        </Card>

        {/* Order */}
        <Card>
          <CardHeader title={t("card.order")} icon={<Package className="size-4" />} actions={wo.status !== "completed" ? <MaterialStatusBadge value={wo.materialStatus} /> : undefined} />
          <CardBody>
            <KeyValue
              cols={1}
              items={[
                {
                  label: t("common.customer"),
                  value: customer ? (
                    <span>
                      {customer.name}
                      <span className="font-normal text-ink-3">
                        {" "}
                        · {customer.city}, {tx(customer.country, customer.countryTr)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-ink-3 italic">{t("common.makeToStock")}</span>
                  ),
                },
              ]}
            />
            <KeyValue
              className="mt-3"
              items={[
                { label: t("common.salesOrder"), value: wo.salesOrderId ? <IdLink href={`/orders?id=${wo.salesOrderId}`}>{wo.salesOrderId}</IdLink> : "—" },
                { label: t("common.lot"), value: <span className="tabular">{wo.lotNo}</span> },
                { label: t("card.planner"), value: <PersonChip id={wo.plannerId} size={20} /> },
                { label: t("card.created"), value: <span className="tabular">{fmt.dateTime(wo.createdAt)}</span> },
              ]}
            />
            {wo.notes && <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-2">{wo.notes}</p>}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4">
        <WoOperations wo={wo} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
          <WoMaterials wo={wo} product={product} />
          <WoQuality wo={wo} />
        </div>
        <div className="min-w-0">
          <WoActivity wo={wo} />
        </div>
      </div>

      <WoTraveler wo={wo} product={product} />
      {holding && <HoldModal woId={wo.id} onClose={() => setHolding(false)} onConfirm={hold} />}
    </PageContainer>
  );
}
