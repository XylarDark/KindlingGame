import type Phaser from "phaser";
import { RECEIPT_RAIL, receiptRailBox, receiptRowY } from "../maps/shopT0";
import type { ReceiptKind } from "../ui/receipts";
import { Pal } from "./palette";
import { fill } from "./px";

/** Danger cream-side tint; matches `Color.dangerHex` for the urgent rows. */
const DANGER = 0xff8a6a;

export interface RailRow {
  kind: ReceiptKind;
  urgent: boolean;
}

function tabColor(row: RailRow): number {
  if (row.kind === "more") return Pal.woodTrim;
  if (row.urgent) return DANGER;
  return row.kind === "delivery" ? Pal.leaf : Pal.gold;
}

/**
 * Paper spike on the counter face: slips printed oldest-first, each with a tab
 * that colour-codes delivery vs pickup. Same cream / rule / torn-edge language as
 * the baked `tex-receipt` slip standing above it.
 */
export function drawReceiptRail(g: Phaser.GameObjects.Graphics, rows: RailRow[]): void {
  g.clear();
  if (rows.length === 0) return;
  const box = receiptRailBox(rows.length);
  const { left, top, w, h } = box;

  fill(g, left + 4, top + 6, w, h, Pal.shadow, 0.3);
  fill(g, left, top, w, h, Pal.cream);
  fill(g, left, top, w, 4, Pal.creamSoft);
  fill(g, left, top, 4, h, Pal.creamSoft);
  fill(g, left + w - 4, top, 4, h, Pal.shadow, 0.16);

  rows.forEach((row, i) => {
    const rowTop = receiptRowY(i) - RECEIPT_RAIL.rowH / 2;
    if (i > 0) fill(g, left + 8, rowTop, w - 16, 2, Pal.woodTrim, 0.35);
    fill(g, left + 8, rowTop + 4, 8, RECEIPT_RAIL.rowH - 8, tabColor(row));
  });

  // Torn bottom edge — comb of paper teeth below the last row.
  for (let x = left; x < left + w; x += 16) {
    fill(g, x, top + h, 8, 4, Pal.cream);
  }

  // Steel clip holding the stack to the counter edge.
  const clipW = 40;
  const clipX = left + Math.floor((w - clipW) / 2);
  fill(g, clipX, top - 4, clipW, 10, Pal.curb);
  fill(g, clipX, top - 4, clipW, 3, Pal.creamSoft, 0.5);
  fill(g, clipX, top + 4, clipW, 2, Pal.shadow, 0.4);
}
