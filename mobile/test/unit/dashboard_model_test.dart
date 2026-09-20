import 'package:flutter_test/flutter_test.dart';
import 'package:ddapp_mobile/data/models/dashboard.dart';

void main() {
  test('parses the mobile overview payload', () {
    final data = DashboardData.fromJson({
      'role': 'admin',
      'firstName': 'Lee',
      'periodKey': 'trailing-12',
      'periodLabel': 'Last 12 months',
      'compareLabel': 'Prior 12 months',
      'todayLabel': 'Saturday 19 September 2026',
      'heroes': [
        {
          'key': 'collected',
          'title': 'Collected',
          'value': '£400.00',
          'valuePence': 40000,
          'subtitle': 'Last 12 months',
          'insight': '£1,000.00 invoiced',
          'accent': 'default',
          'delta': {
            'percent': 10,
            'label': '+10%',
            'direction': 'up',
            'caption': 'vs prior',
          },
          'sparkline': [0, 10, 20],
        },
      ],
      'cashSeries': [
        {
          'month': '2026-09',
          'label': 'Sep 2026',
          'invoicedPence': 100000,
          'collectedPence': 40000,
          'incomePence': 100000,
          'expensePence': 20000,
          'profitPence': 80000,
          'invoicedFormatted': '£1,000.00',
          'collectedFormatted': '£400.00',
          'incomeFormatted': '£1,000.00',
          'expenseFormatted': '£200.00',
          'profitFormatted': '£800.00',
        },
      ],
      'funnel': [
        {
          'key': 'quotes',
          'label': 'Open quotes',
          'valuePence': 0,
          'valueFormatted': '£0.00',
        },
      ],
      'agedReceivables': {
        'current': '£10.00',
        'd30': '£0.00',
        'd60': '£0.00',
        'd90': '£20.00',
        'raw': {'current': 1000, 'd30': 0, 'd60': 0, 'd90': 2000},
        'overduePercent': 67,
      },
      'topClients': [
        {
          'clientId': 'c1',
          'name': 'Acme Ltd',
          'grossPence': 100000,
          'grossFormatted': '£1,000.00',
          'percent': 100,
        },
      ],
      'expenseMix': [
        {
          'category': 'Travel',
          'totalPence': 5000,
          'totalFormatted': '£50.00',
          'percent': 100,
        },
      ],
      'spending': {
        'summary': {
          'totalPence': 5000,
          'compareTotalPence': 4000,
          'totalFormatted': '£50.00',
          'compareTotalFormatted': '£40.00',
          'trend': 'up',
        },
        'series': [
          {'currentPence': 100, 'previousPence': 80},
          {'currentPence': 200, 'previousPence': 90},
        ],
        'periodLabel': 'This month',
        'compareLabel': 'Last month',
      },
      'attention': {
        'overdueInvoices': [
          {
            'id': 'i1',
            'number': 'INV-001',
            'clientName': 'Acme',
            'dueDate': '2026-09-01',
            'balanceFormatted': '£20.00',
          },
        ],
        'expiringQuotes': [],
        'unreconciledCount': 2,
        'pendingExpenses': [
          {
            'id': 'e1',
            'description': 'Train',
            'submitterLabel': 'Lee',
            'amountFormatted': '£12.00',
          },
        ],
        'inboundEmailIssues': [],
        'reimbursableFormatted': '£0.00',
        'owedToMeFormatted': '£5.00',
        'winRatePercent': 50,
        'unbilledFormatted': '£1,000.00',
        'recurringUpcomingFormatted': '£0.00',
        'dsoDays': 12,
      },
    });

    expect(data.firstName, 'Lee');
    expect(data.periodKey, 'trailing-12');
    expect(data.heroes.single.title, 'Collected');
    expect(data.heroes.single.sparkline, [0, 10, 20]);
    expect(data.topClients.single.name, 'Acme Ltd');
    expect(data.expenseMix.single.name, 'Travel');
    expect(data.agedReceivables.raw.total, 3000);
    expect(data.attention.urgentCount, 3);
    expect(data.spending.currentSeries, [100, 200]);
  });

  test('treats a pending payload as an empty overview', () {
    final data = DashboardData.fromJson({
      'role': 'pending',
      'firstName': 'Lee',
    });
    expect(data.isPending, isTrue);
    expect(data.heroes, isEmpty);
  });
}
