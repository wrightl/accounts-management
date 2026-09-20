import 'package:flutter/foundation.dart';
import '../../../data/repositories/dashboard_repository.dart';
import '../../../data/models/dashboard.dart';

class DashboardProvider with ChangeNotifier {
  DashboardProvider({DashboardRepository? repository})
      : _repository = repository ?? DashboardRepository();

  final DashboardRepository _repository;
  DashboardData? _dashboardData;
  String _period = 'this-month';
  bool _isLoading = false;
  String? _error;

  DashboardData? get dashboardData => _dashboardData;
  String get period => _period;
  bool get isLoading => _isLoading;
  String? get error => _error;

  Future<void> loadDashboard({String? period}) async {
    if (period != null) _period = period;
    _isLoading = true;
    _error = null;
    notifyListeners();

    final response = await _repository.getDashboardData(period: _period);

    if (response.success && response.data != null) {
      _dashboardData = response.data;
      _error = null;
    } else {
      _error = response.error;
    }

    _isLoading = false;
    notifyListeners();
  }

  Future<void> setPeriod(String period) async {
    if (period == _period && _dashboardData != null) return;
    await loadDashboard(period: period);
  }

  Future<void> refresh() async {
    await loadDashboard();
  }
}
