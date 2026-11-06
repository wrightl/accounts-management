import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

/// A fictional consultancy for the store screenshots. Same JSON as the
/// `/api/mobile/*` routes, so the real screens and models render it.
const _companyId = 'demo-company';

final Map<String, dynamic> demoUser = {
  'id': 'demo-user',
  'clerkUserId': 'user_demo',
  'role': 'admin',
  'name': 'Alex Morgan',
  'email': 'alex@northwindstudio.example',
  'companyId': _companyId,
  'entityType': 'limited_company',
  'permissions': [
    'accounts:read',
    'accounts:write',
    'reports:read',
    'queries:read',
  ],
  'menuFeatures': null,
  'billing': {'plan': 'pro', 'status': 'active', 'readOnly': false},
};

Map<String, dynamic> _hero(
  String key,
  String title,
  String value,
  int pence,
  String delta,
  String direction,
  List<num> sparkline,
) =>
    {
      'key': key,
      'title': title,
      'value': value,
      'valuePence': pence,
      'accent': 'default',
      'delta': {
        'percent': int.tryParse(delta.replaceAll(RegExp(r'[^0-9-]'), '')),
        'label': delta,
        'direction': direction,
        'caption': 'vs October 2026',
      },
      'sparkline': sparkline,
    };

final Map<String, dynamic> demoDashboard = {
  'role': 'admin',
  'firstName': 'Alex',
  'periodKey': 'this-month',
  'periodLabel': 'November 2026',
  'compareLabel': 'October 2026',
  'todayLabel': 'Friday 6 November 2026',
  'heroes': [
    _hero('collected', 'Collected', '£18,450.00', 1845000, '+12%', 'up',
        [9, 11, 10, 14, 13, 16, 18]),
    _hero('outstanding', 'Outstanding', '£7,200.00', 720000, 'Open', 'flat',
        [6, 7, 5, 8, 7, 7, 7]),
    _hero('expenses', 'Expenses', '£1,284.60', 128460, '-8%', 'down',
        [14, 12, 13, 11, 12, 13, 12]),
    _hero('profit', 'Profit', '£11,920.00', 1192000, '+15%', 'up',
        [6, 8, 7, 9, 10, 11, 12]),
  ],
  'cashSeries': [
    for (final (month, label, invoiced, collected, spent) in [
      ('2026-06', 'Jun', 1520000, 1380000, 140000),
      ('2026-07', 'Jul', 1610000, 1500000, 152000),
      ('2026-08', 'Aug', 1390000, 1450000, 118000),
      ('2026-09', 'Sep', 1780000, 1620000, 131000),
      ('2026-10', 'Oct', 1690000, 1650000, 139500),
      ('2026-11', 'Nov', 1840000, 1845000, 128460),
    ])
      {
        'month': month,
        'label': label,
        'invoicedPence': invoiced,
        'collectedPence': collected,
        'incomePence': collected,
        'expensePence': spent,
        'profitPence': collected - spent,
        'invoicedFormatted': '£${invoiced ~/ 100}',
        'collectedFormatted': '£${collected ~/ 100}',
        'incomeFormatted': '£${collected ~/ 100}',
        'expenseFormatted': '£${spent ~/ 100}',
        'profitFormatted': '£${(collected - spent) ~/ 100}',
      },
  ],
  'funnel': [
    {'key': 'quotes', 'label': 'Open quotes', 'valuePence': 960000, 'valueFormatted': '£9,600.00'},
    {'key': 'invoiced', 'label': 'Invoiced', 'valuePence': 1840000, 'valueFormatted': '£18,400.00'},
    {'key': 'collected', 'label': 'Collected', 'valuePence': 1845000, 'valueFormatted': '£18,450.00'},
  ],
  'agedReceivables': {
    'current': '£4,800.00',
    'd30': '£2,400.00',
    'd60': '£0.00',
    'd90': '£0.00',
    'raw': {'current': 480000, 'd30': 240000, 'd60': 0, 'd90': 0},
    'overduePercent': 33,
  },
  'topClients': [
    {'name': 'Harbour Lane Architects', 'totalPence': 840000, 'totalFormatted': '£8,400.00', 'percent': 46},
    {'name': 'Fernhill Foods', 'totalPence': 600000, 'totalFormatted': '£6,000.00', 'percent': 33},
    {'name': 'Kestrel Analytics', 'totalPence': 400000, 'totalFormatted': '£4,000.00', 'percent': 21},
  ],
  'expenseMix': [
    {'category': 'Software', 'totalPence': 52000, 'totalFormatted': '£520.00', 'percent': 40},
    {'category': 'Travel', 'totalPence': 41260, 'totalFormatted': '£412.60', 'percent': 32},
    {'category': 'Meals', 'totalPence': 21200, 'totalFormatted': '£212.00', 'percent': 17},
    {'category': 'Office', 'totalPence': 14000, 'totalFormatted': '£140.00', 'percent': 11},
  ],
  'spending': {
    'summary': {
      'totalFormatted': '£1,284.60',
      'compareTotalFormatted': '£1,395.00',
      'trend': 'down',
    },
    'series': [
      for (final (now, before) in [(0, 0), (21000, 30000), (52000, 61000), (90000, 99000), (128460, 139500)])
        {'currentPence': now, 'previousPence': before},
    ],
    'periodLabel': 'This month',
    'compareLabel': 'Last month',
  },
  'attention': {
    'overdueInvoices': [
      {
        'id': 'inv-1042',
        'number': 'INV-1042',
        'clientName': 'Fernhill Foods',
        'dueDate': '2026-10-24',
        'balanceFormatted': '£2,400.00',
      },
    ],
    'expiringQuotes': [
      {
        'id': 'q-77',
        'number': 'Q-077',
        'clientName': 'Kestrel Analytics',
        'validUntil': '2026-11-12',
        'grossFormatted': '£4,800.00',
      },
    ],
    'unreconciledCount': 6,
    'pendingExpenses': [
      {
        'id': 'exp-1',
        'description': 'Train to Manchester',
        'submitterLabel': 'Emailed by Jordan',
        'amountFormatted': '£86.40',
      },
    ],
    'inboundEmailIssues': [],
    'reimbursableFormatted': '£212.40',
    'owedToMeFormatted': '£7,200.00',
    'winRatePercent': 62,
    'unbilledFormatted': '£1,950.00',
    'recurringUpcomingFormatted': '£3,000.00',
    'dsoDays': 21,
  },
  'safeToPay': {
    'safeNowFormatted': '£6,350.00',
    'safeLaterFormatted': '£8,900.00',
    'cashKnown': true,
  },
  'nextDeadline': {
    'kind': 'vat_return',
    'label': 'VAT return',
    'dueDate': '2026-12-07',
    'period': 'Jul–Sep 2026',
    'detail': 'Submit through your accountant or Making Tax Digital software.',
    'status': 'upcoming',
    'daysLeft': 31,
  },
};

const _labels = [
  {'id': 'lbl-client', 'name': 'Rebill client', 'color': 'amber'},
  {'id': 'lbl-trip', 'name': 'Manchester trip', 'color': 'blue'},
  {'id': 'lbl-tools', 'name': 'Tools', 'color': 'teal'},
];

Map<String, dynamic> _label(String id) => _labels.firstWhere((l) => l['id'] == id);

Map<String, dynamic> _expense(
  String id,
  String description,
  int pence,
  String category,
  String date,
  String status, {
  List<String> labels = const [],
  bool receipt = false,
  String? clientName,
  String? paidByName,
  String? notes,
  String source = 'manual',
}) =>
    {
      'id': id,
      'companyId': _companyId,
      'description': description,
      'amountPence': pence,
      'amountFormatted': '£${(pence / 100).toStringAsFixed(2)}',
      'category': category,
      'expenseDate': date,
      'status': status,
      'billable': clientName != null,
      'vatRate': 20,
      'clientName': clientName,
      'paidByName': paidByName,
      'createdByName': 'Alex Morgan',
      'source': source,
      'notes': notes,
      'labels': [for (final l in labels) _label(l)],
      'receipts': [
        if (receipt)
          {
            'id': 'rcpt-$id',
            'filename': 'receipt-$id.png',
            'url': '/api/receipts/rcpt-$id',
            'fileSizeBytes': 182000,
            'uploadedAt': '${date}T09:30:00Z',
          },
      ],
      'createdAt': '${date}T09:30:00Z',
    };

final List<Map<String, dynamic>> demoExpenses = [
  _expense('exp-1', 'Train to Manchester', 8640, 'Travel', '2026-11-05', 'pending',
      labels: ['lbl-client', 'lbl-trip'],
      receipt: true,
      clientName: 'Harbour Lane Architects',
      source: 'email',
      notes: 'Site visit for the Ancoats project.'),
  _expense('exp-2', 'Figma Professional', 4500, 'Software', '2026-11-04', 'company_paid',
      labels: ['lbl-tools'], receipt: true),
  _expense('exp-3', 'Lunch with Fernhill Foods', 6420, 'Meals', '2026-11-03', 'reimbursable',
      receipt: true, paidByName: 'Alex Morgan'),
  _expense('exp-4', 'Hotel, Manchester', 14800, 'Travel', '2026-11-03', 'reimbursable',
      labels: ['lbl-trip'], receipt: true, paidByName: 'Alex Morgan'),
  _expense('exp-5', 'Notion Plus', 1600, 'Software', '2026-11-01', 'company_paid',
      labels: ['lbl-tools']),
  _expense('exp-6', 'Printer ink', 3299, 'Office', '2026-10-29', 'recorded', receipt: true),
  _expense('exp-7', 'Mileage: client workshop, 42 miles', 1890, 'Travel', '2026-10-27',
      'reimbursed', paidByName: 'Alex Morgan'),
  _expense('exp-8', 'Coffee for workshop', 1850, 'Meals', '2026-10-27', 'recorded',
      labels: ['lbl-client']),
  _expense('exp-9', 'Domain renewal', 1499, 'Software', '2026-10-22', 'company_paid'),
];

final Map<String, dynamic> demoOptions = {
  'categories': ['Travel', 'Meals', 'Software', 'Office', 'Equipment', 'Training', 'Other'],
  'currencies': ['GBP', 'EUR', 'USD'],
  'payers': [
    {'id': 'demo-user', 'name': 'Alex Morgan'},
    {'id': 'demo-user-2', 'name': 'Jordan Lee'},
  ],
  'defaultPayerId': 'demo-user',
  'clients': [
    {'id': 'c1', 'name': 'Harbour Lane Architects'},
    {'id': 'c2', 'name': 'Fernhill Foods'},
    {'id': 'c3', 'name': 'Kestrel Analytics'},
  ],
  'orders': [
    {'id': 'o1', 'number': 'ORD-014', 'clientId': 'c1', 'clientName': 'Harbour Lane Architects'},
  ],
  'vatRegistered': true,
  'defaultVatRate': 20,
  'defaultMileageRatePence': 45,
};

const demoExtraction = {
  'description': 'Pret A Manger, King\'s Cross',
  'amountPounds': '14.85',
  'spentAt': '2026-11-06',
  'category': 'Meals',
  'currency': 'GBP',
  'confidence': 'high',
};

Map<String, dynamic> _record(
  String id,
  String title,
  String subtitle,
  String amount,
  String status,
  String date, {
  Map<String, String> details = const {},
  int? amountDuePence,
}) =>
    {
      'id': id,
      'title': title,
      'subtitle': subtitle,
      'amount': amount,
      'status': status,
      'date': date,
      'details': details,
      'actions': {
        if (amountDuePence != null) 'recordPayment': {'amountDuePence': amountDuePence},
      },
    };

final Map<String, Map<String, dynamic>> demoRecords = {
  'invoices': {
    'title': 'Invoices',
    'stats': [
      {'label': 'Owed to you', 'value': '£7,200.00'},
      {'label': 'Overdue', 'value': '£2,400.00'},
    ],
    'items': [
      _record('inv-1045', 'INV-1045', 'Harbour Lane Architects', '£4,800.00', 'sent', '2026-11-02',
          details: {'Due': '2 Dec 2026'}, amountDuePence: 480000),
      _record('inv-1042', 'INV-1042', 'Fernhill Foods', '£2,400.00', 'overdue', '2026-09-24',
          details: {'Due': '24 Oct 2026'}, amountDuePence: 240000),
      _record('inv-1041', 'INV-1041', 'Kestrel Analytics', '£4,000.00', 'paid', '2026-09-30'),
      _record('inv-1040', 'INV-1040', 'Harbour Lane Architects', '£3,600.00', 'paid', '2026-09-15'),
      _record('inv-1039', 'INV-1039', 'Fernhill Foods', '£6,000.00', 'paid', '2026-08-31'),
    ],
    'hasMore': false,
  },
  'quotes': {
    'title': 'Quotes',
    'items': [
      _record('q-77', 'Q-077', 'Kestrel Analytics', '£4,800.00', 'sent', '2026-10-29'),
      _record('q-76', 'Q-076', 'Harbour Lane Architects', '£4,800.00', 'accepted', '2026-10-12'),
    ],
    'hasMore': false,
  },
  'clients': {
    'title': 'Clients',
    'items': [
      _record('c1', 'Harbour Lane Architects', 'harbourlane.example', '£4,800.00 owed', 'active', '2026-11-02'),
      _record('c2', 'Fernhill Foods', 'fernhill.example', '£2,400.00 owed', 'active', '2026-09-24'),
      _record('c3', 'Kestrel Analytics', 'kestrel.example', 'Nothing owed', 'active', '2026-09-30'),
    ],
    'hasMore': false,
  },
};

const _deadlines = [
  {
    'kind': 'vat_return',
    'label': 'VAT return',
    'dueDate': '2026-12-07',
    'period': 'Jul–Sep 2026',
    'detail': 'Submit through Making Tax Digital software.',
    'status': 'upcoming',
    'daysLeft': 31,
  },
  {
    'kind': 'confirmation_statement',
    'label': 'Confirmation statement',
    'dueDate': '2026-11-20',
    'detail': 'File at Companies House.',
    'status': 'due_soon',
    'daysLeft': 14,
  },
  {
    'kind': 'corporation_tax',
    'label': 'Corporation Tax payment',
    'dueDate': '2027-01-01',
    'period': 'Year to 31 Mar 2026',
    'detail': 'Pay HMRC.',
    'status': 'upcoming',
    'daysLeft': 56,
  },
];

final Map<String, dynamic> demoWeeklyClose = {
  'outstanding': 3,
  'bankReconciledThrough': '2026-10-30',
  'items': [
    {'key': 'unreconciled', 'label': 'Bank rows to match', 'count': 6},
    {'key': 'pending_expenses', 'label': 'Emailed receipts to review', 'count': 1, 'amountFormatted': '£86.40'},
    {'key': 'missing_receipts', 'label': 'Expenses without a receipt', 'count': 2},
    {'key': 'overdue_invoices', 'label': 'Overdue invoices', 'count': 0},
  ],
  'lastClose': {'closedAt': '2026-10-30T16:45:00Z', 'closedByName': 'Alex Morgan'},
  'deadlines': [_deadlines[1]],
};

final Map<String, dynamic> demoBookkeeper = {
  'aiReady': true,
  'uncategorised': 4,
  'categories': [
    {
      'id': 'sug-1',
      'bookedAt': '2026-11-04',
      'counterparty': 'GITHUB INC',
      'amountFormatted': '£16.00',
      'categoryLabel': 'Software',
      'reason': 'Monthly charges from GitHub were Software before.',
      'source': 'history',
    },
    {
      'id': 'sug-2',
      'bookedAt': '2026-11-03',
      'counterparty': 'TFL TRAVEL CH',
      'amountFormatted': '£7.80',
      'categoryLabel': 'Travel',
      'reason': 'Transport for London fares.',
      'source': 'ai',
    },
  ],
  'receipts': [
    {
      'matchId': 'm-1',
      'expenseDescription': 'Hotel, Manchester',
      'expenseAmountFormatted': '£148.00',
      'spentAt': '2026-11-03',
      'counterparty': 'PREMIER INN',
      'bankAmountFormatted': '£148.00',
      'bookedAt': '2026-11-04',
      'amountsDiffer': false,
    },
  ],
};

/// Serves the fixtures for every `/api/mobile/*` request the screens make.
class FixtureAdapter implements HttpClientAdapter {
  FixtureAdapter({required this.receiptImage});

  /// Returned for every receipt download.
  final Uint8List receiptImage;

  static const _json = {
    Headers.contentTypeHeader: [Headers.jsonContentType],
  };

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    await requestStream?.drain<void>();
    final path = options.uri.path;
    if (path.startsWith('/api/receipts/')) {
      return ResponseBody.fromBytes(receiptImage, 200, headers: {
        Headers.contentTypeHeader: ['image/png'],
      });
    }
    final body = _route(options.method, path, options.uri.queryParameters);
    if (body == null) {
      return ResponseBody.fromString(
        jsonEncode({'error': 'Not in the screenshot fixtures: ${options.method} $path'}),
        404,
        headers: _json,
      );
    }
    return ResponseBody.fromString(jsonEncode(body), 200, headers: _json);
  }

  Object? _route(String method, String path, Map<String, String> query) {
    const api = '/api/mobile';
    final expense = RegExp('^$api/expenses/([^/]+)\$').firstMatch(path);
    if (expense != null && expense[1] != 'options' && expense[1] != 'extract') {
      final found = demoExpenses.where((e) => e['id'] == expense[1]);
      return found.isEmpty ? null : {'data': found.first};
    }
    return switch ((method, path)) {
      ('POST', '$api/auth/validate') => {'user': demoUser},
      ('GET', '$api/dashboard') => {'data': demoDashboard},
      ('GET', '$api/expenses') => {
          'data': [
            for (final e in demoExpenses)
              if (query['status'] == null || e['status'] == query['status']) e,
          ],
          'hasMore': false,
        },
      ('GET', '$api/expenses/options') => {'data': demoOptions},
      ('POST', '$api/expenses/extract') => {'data': demoExtraction},
      ('GET', '$api/labels') => {
          'data': {
            'labels': _labels,
            'colors': ['slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink'],
          },
        },
      ('GET', '$api/records') => demoRecords[query['resource']] == null
          ? null
          : {'data': demoRecords[query['resource']]},
      ('GET', '$api/deadlines') => {
          'data': {'deadlines': _deadlines, 'missingCompaniesHouse': false},
        },
      ('GET', '$api/close') => {'data': demoWeeklyClose},
      ('GET', '$api/bookkeeper') => {'data': demoBookkeeper},
      ('GET', '$api/bookkeeper/ask') => {
          'data': {'remaining': 5},
        },
      ('GET', '$api/queries') => {'data': <Object>[]},
      ('GET', '$api/notifications/unread-count') => {
          'data': {'unreadCount': 2},
        },
      ('GET', '$api/notifications') => {
          'data': {'notifications': <Object>[], 'unreadCount': 2},
        },
      _ => null,
    };
  }

  @override
  void close({bool force = false}) {}
}
