import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:ddapp_mobile/data/models/api_response.dart';
import 'package:ddapp_mobile/data/models/dashboard.dart';
import 'package:ddapp_mobile/data/repositories/dashboard_repository.dart';
import 'package:ddapp_mobile/features/dashboard/dashboard_provider.dart';

@GenerateMocks([DashboardRepository])
import 'dashboard_provider_test.mocks.dart';

void main() {
  test('loadDashboard stores overview data', () async {
    final repository = MockDashboardRepository();
    final provider = DashboardProvider(repository: repository);
    when(repository.getDashboardData(period: 'this-month')).thenAnswer(
      (_) async => ApiResponse.success(
        DashboardData.pending(firstName: 'Lee'),
      ),
    );

    await provider.loadDashboard();

    expect(provider.dashboardData?.firstName, 'Lee');
    expect(provider.dashboardData?.isPending, isTrue);
    expect(provider.isLoading, isFalse);
    expect(provider.error, isNull);
  });

  test('setPeriod requests the new period', () async {
    final repository = MockDashboardRepository();
    final provider = DashboardProvider(repository: repository);
    when(repository.getDashboardData(period: anyNamed('period'))).thenAnswer(
      (_) async => ApiResponse.success(
        DashboardData.pending(firstName: 'Lee'),
      ),
    );

    await provider.setPeriod('fy');

    verify(repository.getDashboardData(period: 'fy')).called(1);
    expect(provider.period, 'fy');
  });
}
