import 'package:flutter/foundation.dart';
import '../../../data/repositories/dashboard_repository.dart';
import '../../../data/models/dashboard.dart';

class DashboardProvider with ChangeNotifier {
  final DashboardRepository _repository;
  DashboardData? _dashboardData;
  bool _isLoading = false;
  String? _error;
  
  DashboardProvider({DashboardRepository? repository})
      : _repository = repository ?? DashboardRepository();
  
  DashboardData? get dashboardData => _dashboardData;
  bool get isLoading => _isLoading;
  String? get error => _error;
  
  Future<void> loadDashboard() async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    
    final response = await _repository.getDashboardData();
    
    if (response.success && response.data != null) {
      _dashboardData = response.data;
      _error = null;
    } else {
      _error = response.error;
    }
    
    _isLoading = false;
    notifyListeners();
  }
  
  Future<void> refresh() async {
    await loadDashboard();
  }
}
