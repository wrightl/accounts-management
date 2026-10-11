export type CreditNoteStatus = "issued" | "void";

export function creditNoteStatusLabel(status: CreditNoteStatus): string {
  return status === "void" ? "Void" : "Issued";
}

/** Void is only allowed before the note reaches the client and before any refund. */
export function canVoidCreditNote(note: {
  status: string;
  sentAt: Date | null;
  refundedPence: number;
}): boolean {
  return note.status === "issued" && note.sentAt == null && note.refundedPence === 0;
}
