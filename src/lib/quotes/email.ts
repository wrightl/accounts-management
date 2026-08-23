export function defaultQuoteEmailMessage(params: {
  number: string;
  version: number;
  grossFormatted: string;
  companyName: string;
}): string {
  const reference = `${params.number} (v${params.version})`;
  return `Hi,

Please find attached quote ${reference} for ${params.grossFormatted}.

Kind regards,
${params.companyName}`;
}
