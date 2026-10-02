"use client";

import Image from "next/image";
import { cn } from "@/lib/cn";
import type { Product } from "@/lib/data/types";

/** Small 4:3 product photo used in tables and lists across supply-chain screens. */
export function ProductThumb({ product, width = 44, className }: { product: Pick<Product, "image" | "name">; width?: number; className?: string }) {
  return (
    <span
      className={cn("relative inline-block shrink-0 overflow-hidden rounded-md bg-surface-3 ring-1 ring-line", className)}
      style={{ width, height: Math.round(width * 0.75) }}
    >
      <Image src={product.image} alt={product.name} fill sizes={`${width * 2}px`} className="object-cover" />
    </span>
  );
}
