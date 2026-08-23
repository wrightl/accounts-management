export interface BankSummaryPieSlice {
  name: string;
  pence: number;
  formatted: string;
  percent: number;
}

export interface BankTransactionSummaryData {
  periodLabel: string;
  incomingPence: number;
  outgoingPence: number;
  netPence: number;
  incomingFormatted: string;
  outgoingFormatted: string;
  netFormatted: string;
  totalCount: number;
  incomingCount: number;
  outgoingCount: number;
  matchedCount: number;
  unreconciledCount: number;
  reconciledPercent: number;
  largestIncomingPence: number | null;
  largestOutgoingPence: number | null;
  largestIncomingFormatted: string | null;
  largestOutgoingFormatted: string | null;
  statementBalancePence: number | null;
  statementBalanceFormatted: string | null;
  statementBalanceDate: string | null;
  pieSlices: BankSummaryPieSlice[];
}
