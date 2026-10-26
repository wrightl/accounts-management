import "server-only";
import { getDb } from "@/db";
import { expenses } from "@/db/schema";
import { refreshExpenseBankSuggestion } from "@/lib/bank/expense-match";
import { withSterlingAmount } from "@/lib/expenses/convert";
import { appendMileageDescription } from "@/lib/expenses/mileage";
import { resolveExpenseProject } from "@/lib/expenses/project";
import type { ReviewContext } from "@/lib/expenses/review";
import {
  normalizeExpensePaymentFields,
  type ExpenseParsed,
} from "@/lib/expenses/schema";
import { periodLockError } from "@/lib/period-lock";
import { checkPayerInCompany } from "@/lib/expenses/payer";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { parseVatRate, resolveLineVatRate, vatFromInclusiveGross } from "@/lib/vat";
import type { ActionResult } from "@/actions/result";

/**
 * Create an expense from validated input. Shared by the web action and the
 * mobile API so both apply the same period lock, payer, project and VAT
 * rules. Callers handle authz and the audit entry.
 */
export async function createExpenseRecord(
  ctx: ReviewContext,
  input: ExpenseParsed,
): Promise<ActionResult> {
  const { companyId, localUserId } = ctx;
  const converted = await withSterlingAmount(input, { required: true });
  if (!converted.ok) return converted;
  const data = converted.data;
  const {
    amountPence,
    resolvedMileageMiles: mileageMiles,
    resolvedMileageRatePence: mileageRatePence,
  } = data;

  let description = data.description;
  if (mileageMiles != null && mileageRatePence != null) {
    description = appendMileageDescription(description, mileageMiles, mileageRatePence);
  }

  const company = await getOrCreateCompanySettings(companyId);
  const locked = periodLockError(company.booksLockedThrough, data.spentAt);
  if (locked) return { ok: false, error: locked };
  const paidByDefault =
    data.status === "reimbursable"
      ? (data.paidByUserId ?? localUserId)
      : data.paidByUserId;
  const normalized = normalizeExpensePaymentFields({
    status: data.status,
    paidByUserId: paidByDefault,
  });
  if (!normalized.ok) {
    return {
      ok: false,
      error: normalized.error,
      fieldErrors: normalized.fieldErrors,
    };
  }

  const payer = await checkPayerInCompany(companyId, normalized.paidByUserId);
  if (!payer.ok) return payer;

  const project = await resolveExpenseProject(companyId, data);
  if (!project.ok) return project;

  // Mileage is always 0% VAT; otherwise use posted rate when registered.
  const vatRate = data.useMileage
    ? 0
    : resolveLineVatRate(company, parseVatRate(data.vatRate));
  const vatPence = vatFromInclusiveGross(amountPence, vatRate);

  const [row] = await getDb()
    .insert(expenses)
    .values({
      companyId,
      description,
      category: data.category || null,
      spentAt: data.spentAt || null,
      amountPence,
      vatRate,
      vatPence,
      status: normalized.status,
      billable: data.billable,
      clientId: project.clientId,
      orderId: project.orderId,
      paidByUserId: normalized.paidByUserId,
      mileageMiles,
      mileageRatePence,
      detectedCurrency: data.foreignCurrency,
      originalAmountMinor: data.originalAmountMinor,
      createdByUserId: localUserId,
    })
    .returning({ id: expenses.id });

  await refreshExpenseBankSuggestion(companyId, row.id);

  return { ok: true, id: row.id };
}
