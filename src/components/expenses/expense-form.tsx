"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { FormStickyActions } from "@/components/ui/form-sticky-actions";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { EXPENSE_CATEGORIES } from "@/lib/expenses/categories";
import { mileageAmountPence } from "@/lib/expenses/mileage";
import {
  createExpense,
  updateExpense,
  deleteExpense,
  uploadReceipt,
  approveExpense,
  rejectExpense,
} from "@/actions/expenses";
import { formatGBP, penceToPounds } from "@/lib/money";
import { clientDisplayName } from "@/lib/clients/display";
import { ReceiptUploadField } from "@/components/expenses/receipt-upload-field";
import type { ReceiptExtraction } from "@/lib/expenses/receipt-parse";
import {
  VatRateField,
  choiceFromVatRate,
  vatRateFromChoice,
} from "@/components/documents/vat-rate-field";
import { vatFromInclusiveGross } from "@/lib/vat";
import {
  expenseRawFromFormData,
  normalizeExpensePaymentFields,
  parseExpenseInput,
} from "@/lib/expenses/schema";

type ExpenseStatusOption = "" | "recorded" | "reimbursable" | "company_paid";

export function ExpenseForm({
  mode,
  expense,
  founders,
  clients,
  canWrite,
  defaultPaidByUserId,
  defaultMileageRatePence,
  receiptOcrProvider = "local",
  receiptOcrModel,
  vatRegistered = false,
  defaultVatRate = 0,
}: {
  mode: "create" | "edit";
  expense?: {
    id: string;
    description: string;
    category: string | null;
    spentAt: string | null;
    amountPence: number;
    vatRate?: number;
    vatPence?: number;
    status: string;
    source?: string;
    billable: boolean;
    billableClientId: string | null;
    paidByUserId: string | null;
    submittedByUserId?: string | null;
    mileageMiles?: number | null;
    mileageRatePence?: number | null;
  };
  founders: { id: string; name: string | null; email: string }[];
  clients: { id: string; name: string; companyName?: string | null }[];
  canWrite: boolean;
  defaultPaidByUserId?: string | null;
  defaultMileageRatePence: number;
  receiptOcrProvider?: string;
  receiptOcrModel?: string;
  vatRegistered?: boolean;
  defaultVatRate?: number;
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const {
    fieldErrors,
    error,
    clearAll,
    clearField,
    applyFail,
  } = useFieldErrors();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  const [description, setDescription] = useState(expense?.description ?? "");
  const [spentAt, setSpentAt] = useState(expense?.spentAt ?? today);
  const [pendingReceipt, setPendingReceipt] = useState<File | null>(null);
  const [billable, setBillable] = useState(expense?.billable ?? false);
  const [category, setCategory] = useState(expense?.category ?? "");
  const [useMileage, setUseMileage] = useState(Boolean(expense?.mileageMiles));
  const [mileageMiles, setMileageMiles] = useState(
    expense?.mileageMiles != null ? String(expense.mileageMiles) : "",
  );
  const [mileageRatePence, setMileageRatePence] = useState(
    String(expense?.mileageRatePence ?? defaultMileageRatePence),
  );
  const [amountPounds, setAmountPounds] = useState(
    expense ? String(penceToPounds(expense.amountPence)) : "",
  );
  const [vatRate, setVatRate] = useState(
    expense?.vatRate ?? (vatRegistered ? defaultVatRate : 0),
  );
  const initialPaidBy =
    expense?.paidByUserId ??
    expense?.submittedByUserId ??
    defaultPaidByUserId ??
    founders[0]?.id ??
    "";
  const [paidByUserId, setPaidByUserId] = useState(initialPaidBy);
  const isPending = expense?.status === "pending";
  const isEmailSubmission = expense?.source === "email";
  const [approveStatus, setApproveStatus] = useState<ExpenseStatusOption>(() => {
    if (expense?.submittedByUserId) return "reimbursable";
    return "recorded";
  });
  const [status, setStatus] = useState<ExpenseStatusOption>(() => {
    if (expense?.status === "reimbursed") return "reimbursable";
    if (
      expense?.status === "recorded" ||
      expense?.status === "reimbursable" ||
      expense?.status === "company_paid"
    ) {
      return expense.status;
    }
    return "";
  });

  const computedMileagePence = useMemo(() => {
    if (!useMileage) return null;
    const miles = Number(mileageMiles);
    const rate = Number(mileageRatePence);
    if (!Number.isFinite(miles) || miles <= 0 || !Number.isFinite(rate) || rate <= 0) {
      return null;
    }
    try {
      return mileageAmountPence(miles, rate);
    } catch {
      return null;
    }
  }, [useMileage, mileageMiles, mileageRatePence]);

  if (!canWrite && mode === "create") {
    return <p className="text-sm text-muted">You do not have permission to create expenses.</p>;
  }

  function applyExtraction(extraction: ReceiptExtraction | null) {
    if (!extraction) return;
    if (extraction.description && !description.trim()) {
      setDescription(extraction.description);
    }
    if (extraction.spentAt && spentAt === today) {
      setSpentAt(extraction.spentAt);
    }
    if (extraction.amountPounds && !amountPounds.trim()) {
      setAmountPounds(extraction.amountPounds);
    }
    if (extraction.category && !category) {
      setCategory(extraction.category);
    }
  }

  function buildFormData(targetStatus: ExpenseStatusOption): FormData {
    const formData = new FormData();
    formData.set("description", description);
    formData.set("spentAt", spentAt);
    formData.set("category", category);
    formData.set("status", targetStatus);
    formData.set(
      "paidByUserId",
      targetStatus === "company_paid" ? "" : paidByUserId,
    );
    if (billable) {
      formData.set("billable", "true");
      const clientEl = document.getElementById("billableClientId") as HTMLSelectElement | null;
      if (clientEl?.value) formData.set("billableClientId", clientEl.value);
    }
    if (useMileage && !isEmailSubmission) {
      formData.set("useMileage", "true");
      formData.set("mileageMiles", mileageMiles);
      formData.set("mileageRatePence", mileageRatePence);
      formData.set(
        "amountPounds",
        computedMileagePence != null ? String(penceToPounds(computedMileagePence)) : "",
      );
    } else {
      formData.set("amountPounds", amountPounds);
    }
    formData.set(
      "vatRate",
      String(useMileage || !vatRegistered ? 0 : vatRate),
    );
    return formData;
  }

  function validateClient(
    formData: FormData,
    opts: { allowZeroAmount?: boolean; checkPayment?: boolean } = {},
  ) {
    const parsed = parseExpenseInput(expenseRawFromFormData(formData), {
      allowZeroAmount: opts.allowZeroAmount ?? isPending,
    });
    if (!parsed.ok) {
      applyFail(parsed);
      scheduleFocusFirstFieldError(formRef.current, parsed.fieldErrors);
      return false;
    }
    if (opts.checkPayment !== false && !isPending) {
      const payment = normalizeExpensePaymentFields({
        status: parsed.data.status,
        paidByUserId: parsed.data.paidByUserId,
      });
      if (!payment.ok) {
        applyFail(payment);
        scheduleFocusFirstFieldError(formRef.current, payment.fieldErrors);
        return false;
      }
    }
    return true;
  }

  function onSubmit(formData: FormData) {
    formData.set("description", description);
    formData.set("spentAt", spentAt);
    formData.set("status", status);
    formData.set("paidByUserId", status === "company_paid" ? "" : paidByUserId);
    if (useMileage) {
      formData.set("useMileage", "true");
      formData.set("mileageMiles", mileageMiles);
      formData.set("mileageRatePence", mileageRatePence);
      formData.set(
        "amountPounds",
        computedMileagePence != null ? String(penceToPounds(computedMileagePence)) : "",
      );
    } else {
      formData.delete("useMileage");
      formData.set("amountPounds", amountPounds);
    }
    formData.set(
      "vatRate",
      String(useMileage || !vatRegistered ? 0 : vatRate),
    );
    clearAll();
    if (!validateClient(formData)) return;
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createExpense(formData)
          : await updateExpense(expense!.id, formData);
      if (!result.ok) {
        applyFail(result);
        scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
        return;
      }
      clearAll();

      let targetUrl = `/expenses/${result.id}`;
      if (mode === "create" && pendingReceipt && result.id) {
        const receiptForm = new FormData();
        receiptForm.set("receipt", pendingReceipt);
        const uploadResult = await uploadReceipt(result.id, receiptForm);
        if (!uploadResult.ok) {
          targetUrl = `/expenses/${result.id}?receiptUploadFailed=${encodeURIComponent(uploadResult.error)}`;
        }
      }

      router.push(targetUrl);
      router.refresh();
    });
  }

  function onSaveDraft() {
    if (!expense) return;
    const formData = buildFormData("recorded");
    clearAll();
    if (!validateClient(formData, { allowZeroAmount: true, checkPayment: false })) {
      return;
    }
    startTransition(async () => {
      const result = await updateExpense(expense.id, formData);
      if (!result.ok) {
        applyFail(result);
        scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
        return;
      }
      clearAll();
      router.refresh();
    });
  }

  function onApprove() {
    if (!expense || !approveStatus) return;
    const formData = buildFormData(approveStatus);
    clearAll();
    if (!validateClient(formData, { allowZeroAmount: false })) return;
    startTransition(async () => {
      const result = await approveExpense(expense.id, formData);
      if (!result.ok) {
        applyFail(result);
        scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
        return;
      }
      clearAll();
      router.push(`/expenses/${result.id}`);
      router.refresh();
    });
  }

  function onReject() {
    if (!expense) return;
    clearAll();
    void (async () => {
      const ok = await confirm({
        title: "Reject expense",
        message: "Reject and delete this pending expense?",
        confirmLabel: "Reject",
        variant: "destructive",
      });
      if (!ok) return;
      startTransition(async () => {
        const result = await rejectExpense(expense.id);
        if (!result.ok) {
          applyFail(result);
          scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
          return;
        }
        clearAll();
        router.push("/expenses");
        router.refresh();
      });
    })();
  }

  return (
    <form ref={formRef} noValidate onSubmit={preventResetSubmit(onSubmit)} className="mx-auto max-w-xl space-y-4">
      {mode === "create" && (
        <ReceiptUploadField
          disabled={!canWrite || pending}
          receiptOcrProvider={receiptOcrProvider}
          receiptOcrModel={receiptOcrModel}
          onFileChange={setPendingReceipt}
          onExtraction={applyExtraction}
        />
      )}
      <div>
        <Label htmlFor="description" required>
          Description
        </Label>
        <Textarea
          id="description"
          name="description"
          required
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            clearField("description");
          }}
          disabled={!canWrite || pending}
          aria-invalid={Boolean(fieldErrors.description)}
          aria-describedby={
            fieldErrors.description ? "description-error" : undefined
          }
        />
        <FieldError id="description-error">{fieldErrors.description}</FieldError>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="category">Category (optional)</Label>
          <Select
            id="category"
            name="category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              clearField("category");
            }}
            disabled={!canWrite || pending}
            aria-invalid={Boolean(fieldErrors.category)}
            aria-describedby={fieldErrors.category ? "category-error" : undefined}
          >
            <option value="">Select…</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <FieldError id="category-error">{fieldErrors.category}</FieldError>
        </div>
        <div>
          <Label htmlFor="spentAt">Date (optional)</Label>
          <Input
            id="spentAt"
            name="spentAt"
            type="date"
            value={spentAt}
            onChange={(e) => {
              setSpentAt(e.target.value);
              clearField("spentAt");
            }}
            disabled={!canWrite || pending}
            aria-invalid={Boolean(fieldErrors.spentAt)}
            aria-describedby={fieldErrors.spentAt ? "spentAt-error" : undefined}
          />
          <FieldError id="spentAt-error">{fieldErrors.spentAt}</FieldError>
        </div>
      </div>

      {category === "Travel" && !isEmailSubmission && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex items-center gap-2">
            <input
              id="useMileage"
              type="checkbox"
              checked={useMileage}
              onChange={(e) => setUseMileage(e.target.checked)}
              disabled={!canWrite || pending}
              className="h-4 w-4"
            />
            <Label htmlFor="useMileage" className="mb-0">
              Log as mileage allowance
            </Label>
          </div>
          {useMileage && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="mileageMiles" required>
                  Miles
                </Label>
                <Input
                  id="mileageMiles"
                  name="mileageMiles"
                  type="number"
                  min={1}
                  step={1}
                  value={mileageMiles}
                  onChange={(e) => {
                    setMileageMiles(e.target.value);
                    clearField("mileageMiles");
                  }}
                  disabled={!canWrite || pending}
                  required
                  aria-invalid={Boolean(fieldErrors.mileageMiles)}
                  aria-describedby={
                    fieldErrors.mileageMiles ? "mileageMiles-error" : undefined
                  }
                />
                <FieldError id="mileageMiles-error">
                  {fieldErrors.mileageMiles}
                </FieldError>
              </div>
              <div>
                <Label htmlFor="mileageRatePence" required>
                  Rate (pence per mile)
                </Label>
                <Input
                  id="mileageRatePence"
                  name="mileageRatePence"
                  type="number"
                  min={1}
                  step={1}
                  value={mileageRatePence}
                  onChange={(e) => {
                    setMileageRatePence(e.target.value);
                    clearField("mileageRatePence");
                  }}
                  disabled={!canWrite || pending}
                  required
                  aria-invalid={Boolean(fieldErrors.mileageRatePence)}
                  aria-describedby={
                    fieldErrors.mileageRatePence
                      ? "mileageRatePence-error"
                      : undefined
                  }
                />
                <FieldError id="mileageRatePence-error">
                  {fieldErrors.mileageRatePence}
                </FieldError>
              </div>
            </div>
          )}
          {useMileage && computedMileagePence != null && (
            <p className="text-sm text-muted">
              Calculated amount:{" "}
              <span className="font-medium text-foreground">
                {formatGBP(computedMileagePence)}
              </span>
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {!useMileage && (
          <div>
            <Label htmlFor="amountPounds" required={!isPending}>
              Amount (£){vatRegistered ? " (inc. VAT)" : ""}
            </Label>
            <Input
              id="amountPounds"
              name="amountPounds"
              required={!isPending}
              value={amountPounds}
              onChange={(e) => {
                setAmountPounds(e.target.value);
                clearField("amountPounds");
              }}
              disabled={!canWrite || pending}
              aria-invalid={Boolean(fieldErrors.amountPounds)}
              aria-describedby={
                fieldErrors.amountPounds ? "amountPounds-error" : undefined
              }
            />
            <FieldError id="amountPounds-error">
              {fieldErrors.amountPounds}
            </FieldError>
          </div>
        )}
        {vatRegistered && !useMileage ? (
          <div>
            <VatRateField
              id="expense-vat"
              label="VAT rate"
              required
              value={choiceFromVatRate(vatRate)}
              onChange={(v) => {
                setVatRate(vatRateFromChoice(v));
                clearField("vatRate");
              }}
              disabled={!canWrite || pending}
              invalid={Boolean(fieldErrors.vatRate)}
              describedBy={fieldErrors.vatRate ? "vatRate-error" : undefined}
            />
            <input type="hidden" name="vatRate" value={vatRate} />
            <FieldError id="vatRate-error">{fieldErrors.vatRate}</FieldError>
          </div>
        ) : null}
        {vatRegistered && !useMileage && amountPounds.trim() ? (
          <p className="text-sm text-muted sm:col-span-2">
            Of which VAT:{" "}
            {formatGBP(
              vatFromInclusiveGross(
                Math.round(Number(amountPounds.replace(/[£,\s]/g, "")) * 100) ||
                  0,
                vatRate,
              ),
            )}
          </p>
        ) : null}
        <div className={useMileage ? "sm:col-span-2" : ""}>
          {isPending ? (
            <>
              <Label htmlFor="approve-status" required>
                Approve as
              </Label>
              <Select
                id="approve-status"
                value={approveStatus}
                required
                onChange={(e) => {
                  const next = e.target.value as ExpenseStatusOption;
                  setApproveStatus(next);
                  clearField("status");
                  if (next === "company_paid") setPaidByUserId("");
                  else if (next === "reimbursable" && !paidByUserId) {
                    setPaidByUserId(
                      expense?.submittedByUserId ??
                        defaultPaidByUserId ??
                        founders[0]?.id ??
                        "",
                    );
                  }
                }}
                disabled={!canWrite || pending}
                aria-invalid={Boolean(fieldErrors.status)}
                aria-describedby={fieldErrors.status ? "status-error" : undefined}
              >
                <option value="recorded">Recorded</option>
                <option value="reimbursable">Reimbursable</option>
                <option value="company_paid">Company paid</option>
              </Select>
              <p className="mt-1 text-xs text-muted">
                Current status: Pending review — choose the final status when approving.
              </p>
              <FieldError id="status-error">{fieldErrors.status}</FieldError>
            </>
          ) : (
            <>
              <Label htmlFor="status" required>
                Status
              </Label>
              <Select
                id="status"
                name="status"
                value={status}
                required={mode === "create"}
                onChange={(e) => {
                  const next = e.target.value as ExpenseStatusOption;
                  setStatus(next);
                  clearField("status");
                  if (next === "company_paid") setPaidByUserId("");
                  else if (next === "reimbursable" && !paidByUserId) {
                    setPaidByUserId(defaultPaidByUserId ?? founders[0]?.id ?? "");
                  }
                }}
                disabled={!canWrite || pending || expense?.status === "reimbursed"}
                aria-invalid={Boolean(fieldErrors.status)}
                aria-describedby={fieldErrors.status ? "status-error" : undefined}
              >
                {mode === "create" && <option value="">Select status…</option>}
                <option value="recorded">Recorded</option>
                <option value="reimbursable">Reimbursable</option>
                <option value="company_paid">Company paid</option>
              </Select>
              <p className="mt-1 text-xs text-muted">
                Reimbursable = you paid personally; the company owes you back.
              </p>
              <FieldError id="status-error">{fieldErrors.status}</FieldError>
            </>
          )}
        </div>
      </div>
      {(isPending ? approveStatus !== "company_paid" : status !== "company_paid") && (
        <div>
          <Label
            htmlFor="paidByUserId"
            required={
              (isPending ? approveStatus : status) === "reimbursable"
            }
          >
            Paid by
          </Label>
          <Select
            id="paidByUserId"
            name="paidByUserId"
            value={paidByUserId}
            onChange={(e) => {
              setPaidByUserId(e.target.value);
              clearField("paidByUserId");
            }}
            disabled={!canWrite || pending}
            aria-invalid={Boolean(fieldErrors.paidByUserId)}
            aria-describedby={
              fieldErrors.paidByUserId ? "paidByUserId-error" : undefined
            }
          >
            <option value="">Select founder…</option>
            {founders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name || f.email}
              </option>
            ))}
          </Select>
          <FieldError id="paidByUserId-error">
            {fieldErrors.paidByUserId}
          </FieldError>
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          id="billable"
          name="billable"
          type="checkbox"
          value="true"
          checked={billable}
          onChange={(e) => setBillable(e.target.checked)}
          disabled={!canWrite || pending}
          className="h-4 w-4"
        />
        <Label htmlFor="billable" className="mb-0">
          Billable to client
        </Label>
      </div>
      {billable && (
        <div>
          <Label htmlFor="billableClientId">Client (optional)</Label>
          <Select
            id="billableClientId"
            name="billableClientId"
            defaultValue={expense?.billableClientId ?? ""}
            disabled={!canWrite || pending}
            aria-invalid={Boolean(fieldErrors.billableClientId)}
            aria-describedby={
              fieldErrors.billableClientId ? "billableClientId-error" : undefined
            }
            onChange={() => clearField("billableClientId")}
          >
            <option value="">Select client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {clientDisplayName(c)}
              </option>
            ))}
          </Select>
          <FieldError id="billableClientId-error">
            {fieldErrors.billableClientId}
          </FieldError>
        </div>
      )}
      {canWrite && (
        <FormStickyActions error={error}>
          {isPending ? (
            <>
              <Button type="button" disabled={pending} onClick={onApprove}>
                {pending ? "Approving…" : "Approve"}
              </Button>
              <Button type="button" variant="secondary" disabled={pending} onClick={onSaveDraft}>
                {pending ? "Saving…" : "Save draft"}
              </Button>
              <Button type="button" variant="ghost" disabled={pending} onClick={onReject}>
                Reject
              </Button>
            </>
          ) : (
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : mode === "create" ? "Create expense" : "Save changes"}
            </Button>
          )}
          {mode === "edit" && expense?.status !== "reimbursed" && !isPending && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={async () => {
                const ok = await confirm({
                  title: "Delete expense",
                  message: "Delete this expense?",
                  confirmLabel: "Delete",
                  variant: "destructive",
                });
                if (!ok) return;
                startTransition(async () => {
                  const result = await deleteExpense(expense!.id);
                  if (!result.ok) {
                    applyFail(result);
                    scheduleFocusFirstFieldError(
                      formRef.current,
                      result.fieldErrors,
                    );
                    return;
                  }
                  clearAll();
                  router.push("/expenses");
                  router.refresh();
                });
              }}
            >
              Delete
            </Button>
          )}
        </FormStickyActions>
      )}
    </form>
  );
}
