import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';
import 'package:ddapp_mobile/core/theme/app_theme.dart';
import 'package:ddapp_mobile/data/models/api_response.dart';
import 'package:ddapp_mobile/data/models/dashboard.dart';
import 'package:ddapp_mobile/features/auth/auth_provider.dart';
import 'package:ddapp_mobile/features/dashboard/dashboard_provider.dart';
import 'package:ddapp_mobile/features/dashboard/screens/dashboard_screen.dart';
import '../unit/dashboard_provider_test.mocks.dart';

void main() {
  testWidgets('renders welcome, period chips, and hero KPIs', (tester) async {
    final repository = MockDashboardRepository();
    final overview = DashboardData.fromJson({
      'role': 'admin',
      'firstName': 'Lee',
      'periodKey': 'this-month',
      'periodLabel': 'September 2026',
      'compareLabel': 'August 2026',
      'todayLabel': 'Saturday 19 September 2026',
      'heroes': [
        {
          'key': 'collected',
          'title': 'Collected',
          'value': '£400.00',
          'valuePence': 40000,
          'accent': 'default',
          'delta': {
            'percent': 10,
            'label': '+10%',
            'direction': 'up',
            'caption': 'vs August 2026',
          },
          'sparkline': [0, 10, 20],
        },
        {
          'key': 'outstanding',
          'title': 'Outstanding',
          'value': '£0.00',
          'valuePence': 0,
          'accent': 'default',
          'delta': {
            'percent': null,
            'label': 'Open',
            'direction': 'flat',
            'caption': 'current balance',
          },
          'sparkline': [0, 0, 0],
        },
      ],
      'cashSeries': [],
      'funnel': [
        {
          'key': 'quotes',
          'label': 'Open quotes',
          'valuePence': 0,
          'valueFormatted': '£0.00',
        },
      ],
      'agedReceivables': {
        'current': '£0.00',
        'd30': '£0.00',
        'd60': '£0.00',
        'd90': '£0.00',
        'raw': {'current': 0, 'd30': 0, 'd60': 0, 'd90': 0},
        'overduePercent': null,
      },
      'topClients': [],
      'expenseMix': [],
      'spending': {
        'summary': {
          'totalFormatted': '£0.00',
          'compareTotalFormatted': '£0.00',
          'trend': 'same',
        },
        'series': [],
        'periodLabel': 'This month',
        'compareLabel': 'Last month',
      },
      'attention': {
        'overdueInvoices': [],
        'expiringQuotes': [],
        'unreconciledCount': 0,
        'pendingExpenses': [],
        'inboundEmailIssues': [],
        'reimbursableFormatted': '£0.00',
        'owedToMeFormatted': '£0.00',
        'unbilledFormatted': '£0.00',
        'recurringUpcomingFormatted': '£0.00',
      },
    });
    when(repository.getDashboardData(period: anyNamed('period')))
        .thenAnswer((_) async => ApiResponse.success(overview));

    final auth = AuthProvider();
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider.value(value: auth),
          ChangeNotifierProvider(
            create: (_) => DashboardProvider(repository: repository),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.lightTheme,
          home: const Scaffold(body: DashboardScreen()),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Welcome, Lee'), findsOneWidget);
    expect(find.text('Saturday 19 September 2026'), findsOneWidget);
    expect(find.text('This month'), findsWidgets);
    expect(find.text('Collected'), findsOneWidget);
    expect(find.text('£400.00'), findsOneWidget);
    expect(find.text('Needs attention'), findsOneWidget);
    expect(find.text('Quote → cash'), findsOneWidget);
  });
}
