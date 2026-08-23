export type ReimbursementStatus = "pending" | "paid";

export function canEditReimbursement(status: string): boolean {
  return status === "pending";
}
