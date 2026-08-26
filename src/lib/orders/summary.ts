import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, orders } from "@/db/schema";
import { formatGBP } from "@/lib/money";

export type OrderStatus = "draft" | "active" | "completed" | "cancelled";

const ORDER_STATUSES: OrderStatus[] = [
  "draft",
  "active",
  "completed",
  "cancelled",
];

export function orderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "active":
      return "Active";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
  }
}

export type OrdersSummaryData = {
  totalCount: number;
  totalGrossFormatted: string;
  activeCount: number;
  activeGrossFormatted: string;
  byStatus: Array<{
    status: OrderStatus;
    label: string;
    count: number;
    grossFormatted: string;
  }>;
};

export async function getOrdersSummary(companyId: string): Promise<OrdersSummaryData> {
  const db = getDb();
  const rows = await db
    .select({
      status: orders.status,
      grossPence: orders.grossPence,
    })
    .from(orders)
    .innerJoin(clients, eq(orders.clientId, clients.id))
    .where(eq(orders.companyId, companyId));

  let totalGrossPence = 0;
  let activeGrossPence = 0;
  let activeCount = 0;

  const statusTotals = new Map<OrderStatus, { count: number; grossPence: number }>();
  for (const status of ORDER_STATUSES) {
    statusTotals.set(status, { count: 0, grossPence: 0 });
  }

  for (const row of rows) {
    totalGrossPence += row.grossPence;
    const status = row.status as OrderStatus;
    const bucket = statusTotals.get(status);
    if (bucket) {
      bucket.count += 1;
      bucket.grossPence += row.grossPence;
    }
    if (status === "active") {
      activeCount += 1;
      activeGrossPence += row.grossPence;
    }
  }

  return {
    totalCount: rows.length,
    totalGrossFormatted: formatGBP(totalGrossPence),
    activeCount,
    activeGrossFormatted: formatGBP(activeGrossPence),
    byStatus: ORDER_STATUSES.map((status) => {
      const bucket = statusTotals.get(status)!;
      return {
        status,
        label: orderStatusLabel(status),
        count: bucket.count,
        grossFormatted: formatGBP(bucket.grossPence),
      };
    }).filter((row) => row.count > 0),
  };
}
