"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { FormStickyActions } from "@/components/ui/form-sticky-actions";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { useUnsavedChangesGuard } from "@/components/ui/use-unsaved-changes-guard";
import { EXPENSE_CATEGORIES } from "@/lib/expenses/categories";
import { mileageAmountPence } from "@/lib/expenses/mileage";
import {
  createExpense,
  updateExpense,
  deleteExpense,
  uploadReceipt,
  approveExpense,
  rejectExpense,
  fetchExpenseExchangeRate,
  type CreateExpenseResult,
} from "@/actions/expenses";
import { expenseCurrencySymbol, formatGBP, penceToPounds, poundsToPence } from "@/lib/money";
import { useReportExpenseSummary } from "@/components/expenses/expense-summary";
import { clientDisplayName } from "@/lib/clients/display";
import { ReceiptUploadField } from "@/components/expenses/receipt-upload-field";
import { isForeignCurrency, type ReceiptExtraction } from "@/lib/expenses/receipt-parse";
import {
  EXPENSE_CURRENCIES,
  expectedGbpPenceFromForeign,
  expenseOriginalAmount,
  needsAmountCheck,
} from "@/lib/expenses/currency";
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
  defaultStatus = "",
  defaultMileageRatePence,
  receiptOcrProvider = "local",
  receiptOcrModel,
  vatRegistered = false,
  orders = [],
  defaultClientId,
  defaultOrderId,
  rebilledOn,
  defaultVatRate = 0,
  fromBankTransaction,
  linkedToBank = false,
  listHref = "/expenses",
  receiptCount,
  suggestedApproveStatus = null,
}: {
  mode: "create" | "edit";
  expense?: {
    id: string;
    description: string;
    category: string | null;
    spentAt: string | null;
    amountPence: number;
    detectedCurrency?: string | null;
    originalAmountMinor?: number | null;
    vatRate?: number;
    vatPence?: number;
    status: string;
    source?: string;
    billable: boolean;
    clientId: string | null;
    orderId?: string | null;
    paidByUserId: string | null;
    submittedByUserId?: string | null;
    mileageMiles?: number | null;
    mileageRatePence?: number | null;
  };
  founders: { id: string; name: string | null; email: string }[];
  clients: { id: string; name: string; companyName?: string | null }[];
  /** Orders the expense can be tagged to. */
  orders?: { id: string; number: string; clientId: string; clientName: string }[];
  /** Pre-selected tags for a new expense, e.g. from an order page. */
  defaultClientId?: string | null;
  defaultOrderId?: string | null;
  /** The invoice that recharges this expense, if any. */
  rebilledOn?: { invoiceId: string; number: string } | null;
  canWrite: boolean;
  /** Pre-selected status for a new expense, e.g. "reimbursable" when a founder paid. */
  defaultStatus?: ExpenseStatusOption;
  defaultMileageRatePence: number;
  receiptOcrProvider?: string;
  receiptOcrModel?: string;
  vatRegistered?: boolean;
  defaultVatRate?: number;
  /** New expense for a bank debit: pre-filled from it and linked on save. */
  fromBankTransaction?: {
    id: string;
    description: string;
    bookedAt: string;
    amountPence: number;
    summary: string;
  } | null;
  /** Settled by a confirmed bank match: amount, date and status are fixed. */
  linkedToBank?: boolean;
  /** The remembered (filtered) expenses list to return to after delete or reject. */
  listHref?: string;
  /** Receipts on the expense; approving one with none asks for confirmation. */
  receiptCount?: number;
  /** How a pending emailed expense was probably paid, to pre-select on approval. */
  suggestedApproveStatus?: "reimbursable" | "company_paid" | null;
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
  const [description, setDescription] = useState(
    expense?.description ?? fromBankTransaction?.description ?? "",
  );
  const [spentAt, setSpentAt] = useState(
    expense?.spentAt ?? fromBankTransaction?.bookedAt ?? today,
  );
  const [pendingReceipt, setPendingReceipt] = useState<File | null>(null);
  const [billable, setBillable] = useState(expense?.billable ?? false);
  const [projectClientId, setProjectClientId] = useState(
    expense?.clientId ?? defaultClientId ?? "",
  );
  const [projectOrderId, setProjectOrderId] = useState(
    expense?.orderId ?? defaultOrderId ?? "",
  );
  const orderChoices = projectClientId
    ? orders.filter((o) => o.clientId === projectClientId)
    : orders;
  const [category, setCategory] = useState(expense?.category ?? "");
  const [useMileage, setUseMileage] = useState(Boolean(expense?.mileageMiles));
  const [mileageMiles, setMileageMiles] = useState(
    expense?.mileageMiles != null ? String(expense.mileageMiles) : "",
  );
  const [mileageRatePence, setMileageRatePence] = useState(
    String(expense?.mileageRatePence ?? defaultMileageRatePence),
  );
  const [amountPounds, setAmountPounds] = useState(() => {
    if (expense) return String(penceToPounds(expense.amountPence));
    if (fromBankTransaction) return String(penceToPounds(fromBankTransaction.amountPence));
    return "";
  });
  const [vatRate, setVatRate] = useState(
    expense?.vatRate ?? (vatRegistered ? defaultVatRate : 0),
  );
  // Only guess who paid when there's a single founder to choose from;
  // otherwise the reviewer must pick, so a wrong payee isn't reimbursed.
  const defaultPayee = founders.length === 1 ? founders[0].id : "";
  const [paidByUserId, setPaidByUserId] = useState(() => {
    if (expense?.status === "pending" && suggestedApproveStatus === "company_paid") return "";
    // The sender says they paid, so they are the one to pay back.
    if (expense?.status === "pending" && suggestedApproveStatus === "reimbursable") {
      return expense.paidByUserId ?? expense.submittedByUserId ?? defaultPayee;
    }
    return expense?.paidByUserId ?? defaultPayee;
  });
  const isPending = expense?.status === "pending";
  const isEmailSubmission = expense?.source === "email";
  const savedOriginal = expense
    ? expenseOriginalAmount({
        detectedCurrency: expense.detectedCurrency ?? null,
        originalAmountMinor: expense.originalAmountMinor ?? null,
      })
    : null;
  const [currency, setCurrency] = useState(savedOriginal?.currency ?? "GBP");
  const [originalAmount, setOriginalAmount] = useState(
    savedOriginal ? String(penceToPounds(savedOriginal.amountMinor)) : "",
  );
  // For a foreign expense the GBP amount follows the exchange rate until it's
  // typed over; changing the foreign amount, currency or date recalculates it.
  const [gbpFollowsRate, setGbpFollowsRate] = useState(
    !expense || expense.amountPence === 0,
  );
  const [rate, setRate] = useState<{
    key: string;
    foreignPerGbp: number | null;
    observationDate: string | null;
  } | null>(null);
  const currencySymbol = expenseCurrencySymbol(currency);
  const [approveStatus, setApproveStatus] = useState<ExpenseStatusOption>(() => {
    if (suggestedApproveStatus) return suggestedApproveStatus;
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
    if (expense) return "";
    return fromBankTransaction ? "company_paid" : defaultStatus;
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

  const foreign = currency !== "GBP" && !useMileage;
  const rateKey = `${currency}:${spentAt}`;
  useEffect(() => {
    if (!foreign) return;
    let cancelled = false;
    void fetchExpenseExchangeRate(currency, spentAt).then((r) => {
      if (cancelled) return;
      setRate({
        key: rateKey,
        foreignPerGbp: r.ok ? r.foreignPerGbp : null,
        observationDate: r.ok ? r.observationDate : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [foreign, currency, spentAt, rateKey]);
  const currentRate = foreign && rate?.key === rateKey ? rate : null;

  const originalMinor = foreign ? parsePence(originalAmount) : null;
  const convertedPence =
    currentRate?.foreignPerGbp && originalMinor && originalMinor > 0
      ? expectedGbpPenceFromForeign(originalMinor, currentRate.foreignPerGbp)
      : null;
  // The GBP amount the form saves.
  const sterlingPounds =
    foreign && gbpFollowsRate
      ? convertedPence != null
        ? String(penceToPounds(convertedPence))
        : ""
      : amountPounds;

  useReportExpenseSummary(
    description,
    useMileage ? computedMileagePence : parsePence(sterlingPounds),
    foreign ? currency : null,
    originalMinor,
  );

  // Everything a save sends, so the form can tell when it differs from what
  // was loaded (or last saved). The approve-as choice is excluded: it only
  // applies on Approve, which is always available.
  const snapshot = JSON.stringify([
    description,
    spentAt,
    category,
    status,
    paidByUserId,
    billable,
    projectClientId,
    projectOrderId,
    useMileage,
    mileageMiles,
    mileageRatePence,
    sterlingPounds,
    vatRate,
    currency,
    originalAmount,
    pendingReceipt !== null,
  ]);
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const dirty = canWrite && snapshot !== savedSnapshot;
  useUnsavedChangesGuard(dirty);

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
    if (
      extraction.amountPounds &&
      !amountPounds.trim() &&
      !originalAmount.trim()
    ) {
      if (isForeignCurrency(extraction.currency)) {
        setCurrency(extraction.currency!.toUpperCase());
        setOriginalAmount(extraction.amountPounds);
        setGbpFollowsRate(true);
      } else {
        setAmountPounds(extraction.amountPounds);
      }
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
    if (billable) formData.set("billable", "true");
    formData.set("clientId", projectClientId);
    formData.set("orderId", projectOrderId);
    setCurrencyFields(formData);
    if (useMileage && !isEmailSubmission) {
      formData.set("useMileage", "true");
      formData.set("mileageMiles", mileageMiles);
      formData.set("mileageRatePence", mileageRatePence);
      formData.set(
        "amountPounds",
        computedMileagePence != null ? String(penceToPounds(computedMileagePence)) : "",
      );
    } else {
      formData.set("amountPounds", sterlingPounds);
    }
    formData.set(
      "vatRate",
      String(useMileage || !vatRegistered ? 0 : vatRate),
    );
    return formData;
  }

  function setCurrencyFields(formData: FormData) {
    formData.set("currency", foreign ? currency : "GBP");
    if (foreign) formData.set("originalAmount", originalAmount);
    else formData.delete("originalAmount");
  }

  function changeCurrency(next: string) {
    // Carry the amount across: it was typed before the currency was picked,
    // or a receipt was wrongly read as foreign.
    if (currency === "GBP" && next !== "GBP" && !originalAmount.trim()) {
      setOriginalAmount(amountPounds);
    } else if (currency !== "GBP" && next === "GBP" && originalAmount.trim()) {
      setAmountPounds(originalAmount);
    }
    setCurrency(next);
    setGbpFollowsRate(true);
    clearField("originalAmount");
    clearField("amountPounds");
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
    // Enter in a field submits even while the save button is disabled.
    if (mode === "edit" && !dirty) return;
    formData.set("description", description);
    formData.set("spentAt", spentAt);
    formData.set("status", status);
    formData.set("paidByUserId", status === "company_paid" ? "" : paidByUserId);
    setCurrencyFields(formData);
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
      formData.set("amountPounds", sterlingPounds);
    }
    formData.set(
      "vatRate",
      String(useMileage || !vatRegistered ? 0 : vatRate),
    );
    if (mode === "create" && fromBankTransaction) {
      formData.set("bankTransactionId", fromBankTransaction.id);
    }
    clearAll();
    if (!validateClient(formData)) return;
    startTransition(async () => {
      const result: CreateExpenseResult =
        mode === "create"
          ? await createExpense(formData)
          : await updateExpense(expense!.id, formData);
      if (!result.ok) {
        applyFail(result);
        scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
        return;
      }
      clearAll();
      setSavedSnapshot(snapshot);

      let targetUrl = `/expenses/${result.id}`;
      if (result.bankLinkError) {
        targetUrl = `/expenses/${result.id}?bankLinkFailed=${encodeURIComponent(result.bankLinkError)}`;
      }
      if (mode === "create" && pendingReceipt && result.id) {
        const receiptForm = new FormData();
        receiptForm.set("receipt", pendingReceipt);
        const uploadResult = await uploadReceipt(result.id, receiptForm);
        if (!uploadResult.ok) {
          const sep = targetUrl.includes("?") ? "&" : "?";
          targetUrl = `${targetUrl}${sep}receiptUploadFailed=${encodeURIComponent(uploadResult.error)}`;
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
      setSavedSnapshot(snapshot);
      router.refresh();
    });
  }

  function onApprove() {
    if (!expense || !approveStatus) return;
    const formData = buildFormData(approveStatus);
    clearAll();
    if (!validateClient(formData, { allowZeroAmount: false })) return;
    void (async () => {
      if (receiptCount === 0) {
        const ok = await confirm({
          title: "No receipt attached",
          message:
            "This expense has no receipt. You may need one to claim VAT or to back up the cost if HMRC asks. Approve it anyway?",
          confirmLabel: "Approve without receipt",
        });
        if (!ok) return;
      }
      startTransition(async () => {
        const result = await approveExpense(expense.id, formData);
        if (!result.ok) {
          applyFail(result);
          scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
          return;
        }
        clearAll();
        setSavedSnapshot(snapshot);
        router.push(`/expenses/${result.id}`);
        router.refresh();
      });
    })();
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
        router.push(listHref);
        router.refresh();
      });
    })();
  }

  // Saved before receipt and GBP amounts were separate, and still unchanged.
  const checkAmounts =
    foreign &&
    expense != null &&
    needsAmountCheck({
      status: expense.status,
      amountPence: expense.amountPence,
      detectedCurrency: expense.detectedCurrency ?? null,
      originalAmountMinor: expense.originalAmountMinor ?? null,
    }) &&
    parsePence(sterlingPounds) === originalMinor;

  // An email receipt can be in a currency the form doesn't otherwise offer.
  const receiptCurrency = isEmailSubmission ? (savedOriginal?.currency ?? null) : null;
  const currencyOptions = EXPENSE_CURRENCIES.includes(currency)
    ? EXPENSE_CURRENCIES
    : [...EXPENSE_CURRENCIES, currency];
  let rateHint: string;
  if (!currentRate) {
    rateHint = "Getting the Bank of England exchange rate…";
  } else if (currentRate.foreignPerGbp == null) {
    rateHint = `No ${currency} exchange rate is available, so enter the amount in GBP.`;
  } else {
    const rateText = `£1 = ${currentRate.foreignPerGbp} ${currency} (Bank of England, ${currentRate.observationDate})`;
    rateHint = gbpFollowsRate
      ? `Converted at ${rateText}. Change it to what your bank charged if you know it.`
      : `The Bank of England rate is ${rateText}.`;
  }

  return (
    <form ref={formRef} noValidate onSubmit={preventResetSubmit(onSubmit)} className="mx-auto max-w-xl space-y-4">
      {mode === "create" && fromBankTransaction && (
        <div className="rounded-lg border border-border bg-wash/50 px-4 py-3 text-sm">
          <p className="font-medium">From bank transaction</p>
          <p className="mt-0.5 text-muted">
            {fromBankTransaction.summary}. Saving links the expense to this payment.
          </p>
        </div>
      )}
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
              setGbpFollowsRate(true);
              clearField("spentAt");
            }}
            disabled={!canWrite || pending || linkedToBank}
            aria-invalid={Boolean(fieldErrors.spentAt)}
            aria-describedby={fieldErrors.spentAt ? "spentAt-error" : undefined}
          />
          <FieldError id="spentAt-error">{fieldErrors.spentAt}</FieldError>
        </div>
      </div>

      {category === "Travel" && !isEmailSubmission && !fromBankTransaction && !linkedToBank && (
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
          <>
            <div>
              <Label htmlFor="currency">Currency</Label>
              <Select
                id="currency"
                name="currency"
                value={currency}
                onChange={(e) => changeCurrency(e.target.value)}
                disabled={!canWrite || pending || linkedToBank}
                aria-invalid={Boolean(fieldErrors.currency)}
                aria-describedby={fieldErrors.currency ? "currency-error" : undefined}
              >
                {currencyOptions.map((code) => (
                  <option key={code} value={code}>
                    {code}
                    {code === receiptCurrency ? " (on receipt)" : ""}
                  </option>
                ))}
              </Select>
              {receiptCurrency ? (
                <p className="mt-1 text-xs text-muted">
                  Choose GBP if the receipt was wrongly read as foreign currency.
                </p>
              ) : null}
              <FieldError id="currency-error">{fieldErrors.currency}</FieldError>
            </div>
            {foreign ? (
              <div>
                <Label htmlFor="originalAmount" required={!isPending}>
                  Amount ({currencySymbol})
                </Label>
                <Input
                  id="originalAmount"
                  name="originalAmount"
                  inputMode="decimal"
                  required={!isPending}
                  value={originalAmount}
                  onChange={(e) => {
                    setOriginalAmount(e.target.value);
                    setGbpFollowsRate(true);
                    clearField("originalAmount");
                    clearField("amountPounds");
                  }}
                  disabled={!canWrite || pending || linkedToBank}
                  aria-invalid={Boolean(fieldErrors.originalAmount)}
                  aria-describedby={
                    fieldErrors.originalAmount ? "originalAmount-error" : undefined
                  }
                />
                <FieldError id="originalAmount-error">
                  {fieldErrors.originalAmount}
                </FieldError>
              </div>
            ) : null}
            <div className={foreign ? "sm:col-span-2" : ""}>
              <Label htmlFor="amountPounds" required={!isPending}>
                {foreign ? "Amount in GBP (£)" : "Amount (£)"}
                {vatRegistered ? " (inc. VAT)" : ""}
              </Label>
              <Input
                id="amountPounds"
                name="amountPounds"
                inputMode="decimal"
                required={!isPending}
                value={sterlingPounds}
                onChange={(e) => {
                  setAmountPounds(e.target.value);
                  setGbpFollowsRate(false);
                  clearField("amountPounds");
                }}
                disabled={!canWrite || pending || linkedToBank}
                aria-invalid={Boolean(fieldErrors.amountPounds)}
                aria-describedby={
                  [
                    fieldErrors.amountPounds ? "amountPounds-error" : null,
                    foreign ? "amountPounds-rate" : null,
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
              />
              {foreign ? (
                <p id="amountPounds-rate" className="mt-1 text-xs text-muted">
                  {rateHint}
                </p>
              ) : null}
              {checkAmounts ? (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  This expense was saved with one amount for both. Check the receipt
                  amount and the GBP amount before approving.
                </p>
              ) : null}
              <FieldError id="amountPounds-error">
                {fieldErrors.amountPounds}
              </FieldError>
            </div>
          </>
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
        {vatRegistered && !useMileage && sterlingPounds.trim() ? (
          <p className="text-sm text-muted sm:col-span-2">
            Of which VAT:{" "}
            {formatGBP(vatFromInclusiveGross(parsePence(sterlingPounds) ?? 0, vatRate))}
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
                    setPaidByUserId(defaultPayee);
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
                    setPaidByUserId(defaultPayee);
                  }
                }}
                disabled={
                  !canWrite || pending || expense?.status === "reimbursed" || linkedToBank
                }
                aria-invalid={Boolean(fieldErrors.status)}
                aria-describedby={fieldErrors.status ? "status-error" : undefined}
              >
                {mode === "create" && <option value="">Select status…</option>}
                <option value="recorded">Recorded</option>
                {fromBankTransaction ? null : (
                  <option value="reimbursable">Reimbursable</option>
                )}
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="clientId">Client</Label>
          <Select
            id="clientId"
            name="clientId"
            value={projectClientId}
            disabled={!canWrite || pending}
            aria-invalid={Boolean(fieldErrors.clientId)}
            aria-describedby={fieldErrors.clientId ? "clientId-error" : undefined}
            onChange={(e) => {
              clearField("clientId");
              setProjectClientId(e.target.value);
              const order = orders.find((o) => o.id === projectOrderId);
              if (order && order.clientId !== e.target.value) setProjectOrderId("");
            }}
          >
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {clientDisplayName(c)}
              </option>
            ))}
          </Select>
          <FieldError id="clientId-error">{fieldErrors.clientId}</FieldError>
        </div>
        <div>
          <Label htmlFor="orderId">Order</Label>
          <Select
            id="orderId"
            name="orderId"
            value={projectOrderId}
            disabled={!canWrite || pending || orders.length === 0}
            aria-invalid={Boolean(fieldErrors.orderId)}
            aria-describedby={fieldErrors.orderId ? "orderId-error" : undefined}
            onChange={(e) => {
              clearField("orderId");
              setProjectOrderId(e.target.value);
              const order = orders.find((o) => o.id === e.target.value);
              if (order) setProjectClientId(order.clientId);
            }}
          >
            <option value="">No order</option>
            {orderChoices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.number} · {o.clientName}
              </option>
            ))}
          </Select>
          <FieldError id="orderId-error">{fieldErrors.orderId}</FieldError>
        </div>
        <p className="text-xs text-muted sm:col-span-2">
          Tag a cost to a client or order to see the margin on that work.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          id="billable"
          name="billable"
          type="checkbox"
          value="true"
          checked={billable}
          onChange={(e) => setBillable(e.target.checked)}
          disabled={!canWrite || pending || Boolean(rebilledOn)}
          className="h-4 w-4"
        />
        <Label htmlFor="billable" className="mb-0">
          Rebillable: recharge this to the client on their next invoice
        </Label>
      </div>
      {rebilledOn ? (
        <p className="text-sm text-muted">
          Recharged on{" "}
          <Link
            href={`/invoices/${rebilledOn.invoiceId}`}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            invoice {rebilledOn.number}
          </Link>
          . Remove it from that invoice to change the amount or client.
        </p>
      ) : null}
      {linkedToBank ? (
        <p className="text-sm text-muted">
          Linked to a bank transaction. Unlink it to change the amount, date or status, or
          to delete the expense.
        </p>
      ) : null}
      {canWrite && (
        <FormStickyActions error={error}>
          {isPending ? (
            <>
              <Button type="button" disabled={pending} onClick={onApprove}>
                {pending ? "Approving…" : "Approve"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending || !dirty}
                onClick={onSaveDraft}
              >
                {pending ? "Saving…" : "Save draft"}
              </Button>
              <Button type="button" variant="ghost" disabled={pending} onClick={onReject}>
                Reject
              </Button>
            </>
          ) : (
            <Button type="submit" disabled={pending || (mode === "edit" && !dirty)}>
              {pending ? "Saving…" : mode === "create" ? "Create expense" : "Save changes"}
            </Button>
          )}
          {mode === "edit" && expense?.status !== "reimbursed" && !isPending && !linkedToBank && (
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
                  router.push(listHref);
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

/** Pence for a typed amount, or null when it's blank or not a number. */
function parsePence(value: string): number | null {
  if (!value.trim()) return null;
  try {
    return poundsToPence(value);
  } catch {
    return null;
  }
}
