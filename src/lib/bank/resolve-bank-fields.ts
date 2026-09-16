import {
  bankLabel,
  isBankProviderId,
  resolveBankDisplayName,
  type BankProviderId,
} from "@/lib/bank/providers";

export type ResolvedBankFields = {
  bankProvider: BankProviderId | null;
  bankName: string | null;
};

/**
 * Parse bankProvider + bankName from form fields.
 * Known banks → catalog label; Other → required freetext; empty → nulls (optional).
 */
export function resolveBankFieldsFromForm(input: {
  bankProvider: unknown;
  bankName: unknown;
  required: boolean;
}): { ok: true; value: ResolvedBankFields } | { ok: false; error: string } {
  const rawProvider =
    typeof input.bankProvider === "string" ? input.bankProvider.trim() : "";
  const rawName =
    typeof input.bankName === "string" ? input.bankName.trim() : "";

  if (!rawProvider) {
    if (input.required) {
      return { ok: false, error: "Choose a bank" };
    }
    return { ok: true, value: { bankProvider: null, bankName: null } };
  }

  if (!isBankProviderId(rawProvider)) {
    return { ok: false, error: "Choose a bank from the list" };
  }

  if (rawProvider === "other") {
    if (!rawName) {
      return { ok: false, error: "Enter your bank name" };
    }
    if (rawName.length > 100) {
      return { ok: false, error: "Bank name must be 100 characters or fewer" };
    }
    return {
      ok: true,
      value: { bankProvider: "other", bankName: rawName },
    };
  }

  return {
    ok: true,
    value: {
      bankProvider: rawProvider,
      bankName: bankLabel(rawProvider),
    },
  };
}

export { resolveBankDisplayName };
