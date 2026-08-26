"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { EXPENSE_CATEGORIES } from "@/lib/expenses/categories";
import { mileageAmountPence } from "@/lib/expenses/mileage";
import { createExpense, updateExpense, deleteExpense, uploadReceipt, approveExpense, rejectExpense } from "@/actions/expenses";
import { formatGBP, penceToPounds } from "@/lib/money";
import { clientDisplayName } from "@/lib/clients/display";
import { ReceiptUploadField } from "@/components/expenses/receipt-upload-field";
import type { ReceiptExtraction } from "@/lib/expenses/receipt-parse";

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
}: {
  mode: "create" | "edit";
  expense?: {
    id: string;
    description: string;
    category: string | null;
    spentAt: string | null;
    amountPence: number;
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
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const [error, setError] = useState<string | null>(null);
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
    return formData;
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
    setError(null);
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createExpense(formData)
          : await updateExpense(expense!.id, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      let targetUrl = `/dashboard/expenses/${result.id}`;
      if (mode === "create" && pendingReceipt && result.id) {
        const receiptForm = new FormData();
        receiptForm.set("receipt", pendingReceipt);
        const uploadResult = await uploadReceipt(result.id, receiptForm);
        if (!uploadResult.ok) {
          targetUrl = `/dashboard/expenses/${result.id}?receiptUploadFailed=${encodeURIComponent(uploadResult.error)}`;
        }
      }

      router.push(targetUrl);
      router.refresh();
    });
  }

  function onSaveDraft() {
    if (!expense) return;
    setError(null);
    startTransition(async () => {
      const result = await updateExpense(expense.id, buildFormData("recorded"));
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function onApprove() {
    if (!expense || !approveStatus) return;
    setError(null);
    startTransition(async () => {
      const result = await approveExpense(expense.id, buildFormData(approveStatus));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/dashboard/expenses/${result.id}`);
      router.refresh();
    });
  }

  function onReject() {
    if (!expense) return;
    setError(null);
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
          setError(result.error);
          return;
        }
        router.push("/dashboard/expenses");
        router.refresh();
      });
    })();
  }

  return (
    <form action={onSubmit} className="mx-auto max-w-xl space-y-4">
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
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!canWrite || pending}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="category">Category</Label>
          <Select
            id="category"
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={!canWrite || pending}
          >
            <option value="">Select…</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="spentAt">Date</Label>
          <Input
            id="spentAt"
            name="spentAt"
            type="date"
            value={spentAt}
            onChange={(e) => setSpentAt(e.target.value)}
            disabled={!canWrite || pending}
          />
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
                <Label htmlFor="mileageMiles">Miles</Label>
                <Input
                  id="mileageMiles"
                  name="mileageMiles"
                  type="number"
                  min={1}
                  step={1}
                  value={mileageMiles}
                  onChange={(e) => setMileageMiles(e.target.value)}
                  disabled={!canWrite || pending}
                  required
                />
              </div>
              <div>
                <Label htmlFor="mileageRatePence">Rate (pence per mile)</Label>
                <Input
                  id="mileageRatePence"
                  name="mileageRatePence"
                  type="number"
                  min={1}
                  step={1}
                  value={mileageRatePence}
                  onChange={(e) => setMileageRatePence(e.target.value)}
                  disabled={!canWrite || pending}
                  required
                />
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
            <Label htmlFor="amountPounds">Amount (£)</Label>
            <Input
              id="amountPounds"
              name="amountPounds"
              required={!isPending}
              value={amountPounds}
              onChange={(e) => setAmountPounds(e.target.value)}
              disabled={!canWrite || pending}
            />
          </div>
        )}
        <div className={useMileage ? "sm:col-span-2" : ""}>
          {isPending ? (
            <>
              <Label htmlFor="approve-status">Approve as</Label>
              <Select
                id="approve-status"
                value={approveStatus}
                required
                onChange={(e) => {
                  const next = e.target.value as ExpenseStatusOption;
                  setApproveStatus(next);
                  if (next === "company_paid") setPaidByUserId("");
                  else if (next === "reimbursable" && !paidByUserId) {
                    setPaidByUserId(
                      expense?.submittedByUserId ?? defaultPaidByUserId ?? founders[0]?.id ?? "",
                    );
                  }
                }}
                disabled={!canWrite || pending}
              >
                <option value="recorded">Recorded</option>
                <option value="reimbursable">Reimbursable</option>
                <option value="company_paid">Company paid</option>
              </Select>
              <p className="mt-1 text-xs text-muted">
                Current status: Pending review — choose the final status when approving.
              </p>
            </>
          ) : (
            <>
              <Label htmlFor="status">Status</Label>
              <Select
                id="status"
                name="status"
                value={status}
                required={mode === "create"}
                onChange={(e) => {
                  const next = e.target.value as ExpenseStatusOption;
                  setStatus(next);
                  if (next === "company_paid") setPaidByUserId("");
                  else if (next === "reimbursable" && !paidByUserId) {
                    setPaidByUserId(defaultPaidByUserId ?? founders[0]?.id ?? "");
                  }
                }}
                disabled={!canWrite || pending || expense?.status === "reimbursed"}
              >
                {mode === "create" && <option value="">Select status…</option>}
                <option value="recorded">Recorded</option>
                <option value="reimbursable">Reimbursable</option>
                <option value="company_paid">Company paid</option>
              </Select>
              <p className="mt-1 text-xs text-muted">
                Reimbursable = you paid personally; the company owes you back.
              </p>
            </>
          )}
        </div>
      </div>
      {(isPending ? approveStatus !== "company_paid" : status !== "company_paid") && (
        <div>
          <Label htmlFor="paidByUserId">Paid by</Label>
          <Select
            id="paidByUserId"
            name="paidByUserId"
            value={paidByUserId}
            onChange={(e) => setPaidByUserId(e.target.value)}
            disabled={!canWrite || pending}
          >
            <option value="">Select founder…</option>
            {founders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name || f.email}
              </option>
            ))}
          </Select>
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
          <Label htmlFor="billableClientId">Client</Label>
          <Select
            id="billableClientId"
            name="billableClientId"
            defaultValue={expense?.billableClientId ?? ""}
            disabled={!canWrite || pending}
          >
            <option value="">Select client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {clientDisplayName(c)}
              </option>
            ))}
          </Select>
        </div>
      )}
      <FieldError>{error}</FieldError>
      {canWrite && (
        <div className="flex flex-wrap gap-3">
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
                  if (!result.ok) setError(result.error);
                  else {
                    router.push("/dashboard/expenses");
                    router.refresh();
                  }
                });
              }}
            >
              Delete
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
