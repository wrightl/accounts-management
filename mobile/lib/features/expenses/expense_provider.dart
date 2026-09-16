import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';
import '../../../data/repositories/expense_repository.dart';
import '../../../data/models/expense.dart';

class ExpenseProvider with ChangeNotifier {
  final ExpenseRepository _repository;
  final ImagePicker _imagePicker;
  
  List<Expense> _expenses = [];
  Expense? _selectedExpense;
  bool _isLoading = false;
  bool _isUploading = false;
  String? _error;
  double _uploadProgress = 0.0;
  
  ExpenseProvider({
    ExpenseRepository? repository,
    ImagePicker? imagePicker,
  })  : _repository = repository ?? ExpenseRepository(),
        _imagePicker = imagePicker ?? ImagePicker();
  
  List<Expense> get expenses => _expenses;
  Expense? get selectedExpense => _selectedExpense;
  bool get isLoading => _isLoading;
  bool get isUploading => _isUploading;
  String? get error => _error;
  double get uploadProgress => _uploadProgress;
  
  List<Expense> get pendingExpenses => 
      _expenses.where((e) => e.isPending).toList();
  
  Future<void> loadExpenses({String? status}) async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    
    final response = await _repository.getExpenses(status: status);
    
    if (response.success && response.data != null) {
      _expenses = response.data!;
      _error = null;
    } else {
      _error = response.error;
    }
    
    _isLoading = false;
    notifyListeners();
  }
  
  Future<bool> createExpense(CreateExpenseRequest request) async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    
    final response = await _repository.createExpense(request);
    
    if (response.success && response.data != null) {
      _expenses.insert(0, response.data!);
      _selectedExpense = response.data;
      _error = null;
      _isLoading = false;
      notifyListeners();
      return true;
    } else {
      _error = response.error;
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }
  
  Future<bool> uploadReceipt(String expenseId, XFile file) async {
    _isUploading = true;
    _uploadProgress = 0.0;
    _error = null;
    notifyListeners();
    
    final response = await _repository.uploadReceipt(
      expenseId,
      file.path,
      onProgress: (sent, total) {
        _uploadProgress = sent / total;
        notifyListeners();
      },
    );
    
    if (response.success) {
      await loadExpenses();
      _error = null;
      _isUploading = false;
      _uploadProgress = 0.0;
      notifyListeners();
      return true;
    } else {
      _error = response.error;
      _isUploading = false;
      _uploadProgress = 0.0;
      notifyListeners();
      return false;
    }
  }
  
  Future<XFile?> captureReceipt() async {
    try {
      return await _imagePicker.pickImage(
        source: ImageSource.camera,
        maxWidth: 1920,
        maxHeight: 1920,
        imageQuality: 85,
      );
    } catch (e) {
      _error = 'Failed to capture image: $e';
      notifyListeners();
      return null;
    }
  }
  
  Future<XFile?> pickReceiptFromGallery() async {
    try {
      return await _imagePicker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1920,
        maxHeight: 1920,
        imageQuality: 85,
      );
    } catch (e) {
      _error = 'Failed to pick image: $e';
      notifyListeners();
      return null;
    }
  }
  
  Future<bool> approveExpense(String id, {String approvalType = 'recorded'}) async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    
    final response = await _repository.approveExpense(id, approvalType: approvalType);
    
    if (response.success && response.data != null) {
      final index = _expenses.indexWhere((e) => e.id == id);
      if (index != -1) {
        _expenses[index] = response.data!;
      }
      _error = null;
      _isLoading = false;
      notifyListeners();
      return true;
    } else {
      _error = response.error;
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }
  
  Future<bool> rejectExpense(String id, {String? reason}) async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    
    final response = await _repository.rejectExpense(id, reason: reason);
    
    if (response.success && response.data != null) {
      final index = _expenses.indexWhere((e) => e.id == id);
      if (index != -1) {
        _expenses[index] = response.data!;
      }
      _error = null;
      _isLoading = false;
      notifyListeners();
      return true;
    } else {
      _error = response.error;
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }
  
  void setSelectedExpense(Expense? expense) {
    _selectedExpense = expense;
    notifyListeners();
  }
  
  void clearError() {
    _error = null;
    notifyListeners();
  }
}
