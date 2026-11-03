/**
 * Starter questions, so nobody has to work out what to ask. Served as MCP
 * prompts, and listed in Settings for assistants that don't show those.
 * Each is offered only to people with the tool it `needs`.
 */
export const STARTER_PROMPTS = [
  {
    name: "weekly_money_check_in",
    needs: "cash_forecast",
    title: "Weekly money check-in",
    text: "Give me a calm weekly money check-in: cash now and the lowest point coming up, who owes me money and how late they are, and any deadlines in the next month. Short bullet points, the most important thing first.",
  },
  {
    name: "who_owes_me",
    needs: "money_owed_by_clients",
    title: "Who owes me money?",
    text: "Who owes me money right now? List the overdue invoices first, with how many days late each one is, then the total.",
  },
  {
    name: "safe_to_pay_myself",
    needs: "safe_to_pay_yourself",
    title: "What can I safely pay myself?",
    text: "How much can I safely pay myself right now, and what's holding the figure back? Explain the workings simply.",
  },
  {
    name: "ready_for_accountant",
    needs: "accountant_queries",
    title: "Get ready for my accountant",
    text: "Help me get ready for my accountant: open accountant queries, overdue filing deadlines, and anything in this financial year's figures that looks unusual. Make it a short checklist.",
  },
  {
    name: "explain_my_numbers",
    needs: "profit_and_loss",
    title: "Explain my numbers simply",
    text: "Explain how the business is doing this financial year as if I'm new to accounting: income, spending, profit and VAT, in a few short sentences each. No jargon without a plain explanation.",
  },
  {
    name: "draft_an_invoice",
    needs: "create_draft_invoice",
    title: "Draft an invoice",
    text: "Help me draft an invoice. Ask me who it's for and what to bill, one question at a time, then show me the invoice before you create it as a draft in Alfa.",
  },
  {
    name: "draft_a_quote",
    needs: "create_draft_quote",
    title: "Draft a quote",
    text: "Help me draft a quote. Ask me who it's for and what the work is, one question at a time, then show me the quote before you create it as a draft in Alfa.",
  },
] as const;

/** A starter question worded to paste into any chat, so the assistant knows to use Alfa. */
export function pasteablePrompt(text: string): string {
  return `Using Alfa, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}
