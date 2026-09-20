import { describe, expect, it } from "vitest";
import { firstNameFrom, toMobileDashboard } from "@/lib/dashboard/mobile";
import type { DashboardOverviewData } from "@/lib/dashboard/queries";

function overviewFixture(): DashboardOverviewData {
  return {
    periodKey: "this-month",
    periodLabel: "September 2026",
    compareLabel: "August 2026",
    todayLabel: "Saturday 19 September 2026",
    heroes: [
      {
        key: "collected",
        title: "Collected",
        value: "£400.00",
        valuePence: 40_000,
        href: "/invoices",
        subtitle: "September 2026",
        insight: "£1,000.00 invoiced",
        delta: {
          percent: 10,
          label: "+10%",
          direction: "up",
          caption: "vs August 2026",
        },
        sparkline: [0, 10, 20],
      },
    ],
    cashSeries: [
      {
        month: "2026-09",
        label: "Sep 2026",
        invoicedPence: 100_000,
        collectedPence: 40_000,
        incomePence: 100_000,
        expensePence: 20_000,
        profitPence: 80_000,
        invoicedFormatted: "£1,000.00",
        collectedFormatted: "£400.00",
        incomeFormatted: "£1,000.00",
        expenseFormatted: "£200.00",
        profitFormatted: "£800.00",
      },
    ],
    incomeExpenseSeries: [],
    funnel: [
      {
        key: "quotes",
        label: "Open quotes",
        valuePence: 0,
        valueFormatted: "£0.00",
        href: "/quotes",
      },
    ],
    agedReceivables: {
      current: "£0.00",
      d30: "£0.00",
      d60: "£0.00",
      d90: "£0.00",
      raw: { current: 0, d30: 0, d60: 0, d90: 0 },
      overduePercent: null,
    },
    topClients: [
      {
        clientId: "c1",
        name: "Acme Ltd",
        grossPence: 100_000,
        grossFormatted: "£1,000.00",
        percent: 100,
      },
    ],
    expenseMix: [],
    spending: {
      summary: {
        totalPence: 5_000,
        compareTotalPence: 4_000,
        deltaPence: 1_000,
        totalFormatted: "£50.00",
        compareTotalFormatted: "£40.00",
        deltaFormatted: "+£10.00",
        trend: "up",
      },
      series: [],
      periodLabel: "This month",
      compareLabel: "Last month",
      buckets: "day",
    },
    attention: {
      overdueInvoices: [],
      expiringQuotes: [],
      unreconciledCount: 2,
      pendingExpenses: [
        {
          id: "e1",
          description: "Train",
          amountPence: 1200,
          createdAt: new Date("2026-09-01T00:00:00Z"),
          submitterName: "Lee",
          submitterEmail: "lee@test.com",
          amountFormatted: "£12.00",
          submitterLabel: "Lee",
        },
      ],
      inboundEmailIssues: [],
      reimbursableFormatted: "£0.00",
      owedToMeFormatted: "£0.00",
      owedToCofoundersFormatted: "£0.00",
      winRatePercent: 50,
      unbilledFormatted: "£1,000.00",
      recurringUpcomingFormatted: "£0.00",
      dsoDays: 12,
      overduePercentOfAr: null,
    },
    quotesSummary: {} as DashboardOverviewData["quotesSummary"],
    ordersSummary: {} as DashboardOverviewData["ordersSummary"],
    insights: {
      invoicedFormatted: "£1,000.00",
      collectedFormatted: "£400.00",
      winRatePercent: 50,
      unbilledFormatted: "£1,000.00",
      recurringUpcomingFormatted: "£0.00",
      dsoDays: 12,
    },
  };
}

describe("toMobileDashboard", () => {
  it("keeps first name and strips web-only hrefs / summaries", () => {
    const payload = toMobileDashboard(overviewFixture(), {
      role: "admin",
      firstName: "Lee",
    });

    expect(payload.role).toBe("admin");
    expect(payload.firstName).toBe("Lee");
    expect(payload.heroes[0]).toMatchObject({
      key: "collected",
      value: "£400.00",
      sparkline: [0, 10, 20],
    });
    expect(payload.heroes[0]).not.toHaveProperty("href");
    expect(payload.funnel[0]).not.toHaveProperty("href");
    expect(payload.attention.pendingExpenses).toEqual([
      {
        id: "e1",
        description: "Train",
        submitterLabel: "Lee",
        amountFormatted: "£12.00",
      },
    ]);
    expect(payload.attention.unreconciledCount).toBe(2);
    expect(payload).not.toHaveProperty("quotesSummary");
  });
});

describe("firstNameFrom", () => {
  it("returns the first token", () => {
    expect(firstNameFrom("Lee Wright")).toBe("Lee");
    expect(firstNameFrom("  ")).toBe("");
    expect(firstNameFrom(null)).toBe("");
  });
});
