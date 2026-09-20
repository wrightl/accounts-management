import 'package:flutter/foundation.dart';
import '../../../data/repositories/auth_service.dart';
import '../../../data/models/user.dart';

class AuthProvider with ChangeNotifier {
  final AuthService _authService;
  User? _user;
  bool _isAuthenticated = false;
  bool _isLoading = false;
  String? _error;
  
  AuthProvider({AuthService? authService})
      : _authService = authService ?? AuthService();
  
  User? get user => _user;
  bool get isAuthenticated => _isAuthenticated;
  bool get isLoading => _isLoading;
  String? get error => _error;
  
  Future<void> checkAuth() async {
    _isLoading = true;
    notifyListeners();
    
    _isAuthenticated = await _authService.isAuthenticated();
    
    if (_isAuthenticated) {
      await validateToken();
    }
    
    _isLoading = false;
    notifyListeners();
  }
  
  Future<bool> syncWithBackend() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    final result = await validateToken();

    _isLoading = false;
    notifyListeners();
    return result;
  }
  
  Future<bool> validateToken() async {
    final response = await _authService.validateToken();
    
    if (response.success && response.data != null) {
      _user = response.data;
      _isAuthenticated = true;
      _error = null;
      notifyListeners();
      return true;
    } else {
      _error = response.error;
      _isAuthenticated = false;
      _user = null;
      notifyListeners();
      return false;
    }
  }
  
  Future<void> logout() async {
    await _authService.logout();
    _user = null;
    _isAuthenticated = false;
    _error = null;
    notifyListeners();
  }
}
