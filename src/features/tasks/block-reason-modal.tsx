"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { useT, useTx } from "@/i18n";
import { cn } from "@/lib/cn";
import { Button, Field, Modal, Textarea } from "@/components/ui";
import { BLOCK_PRESETS, composeReason } from "@/features/work-orders/reasons";
import { messages } from "./messages";

/** Asks why a task is blocked. Mount only while open; returns the canonical (English) reason. */
export function BlockReasonModal({ taskId, onClose, onConfirm }: { taskId: string; onClose: () => void; onConfirm: (reason: string) => void }) {
  const t = useT(messages);
  const tx = useTx();
  const [preset, setPreset] = useState(0);
  const [note, setNote] = useState("");

  return (
    <Modal
      open
      onClose={onClose}
      title={t("block.title", { id: taskId })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" onClick={() => onConfirm(composeReason(BLOCK_PRESETS[preset], note))}>
            {t("block.confirm")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-ink-2">{t("block.reason")}</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {BLOCK_PRESETS.map((p, i) => (
              <label
                key={p.en}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition-colors",
                  preset === i ? "border-critical bg-critical-soft text-critical-ink" : "border-line text-ink-2 hover:bg-surface-2",
                )}
              >
                <input type="radio" name="block-reason" checked={preset === i} onChange={() => setPreset(i)} className="accent-critical" />
                {tx(p.en, p.tr)}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={t("block.note")}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("block.notePh")} className="min-h-16" />
        </Field>
        <p className="flex items-start gap-2 text-xs text-ink-3">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {t("block.hint")}
        </p>
      </div>
    </Modal>
  );
}
