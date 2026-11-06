import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';
import '../../../data/repositories/expense_repository.dart';
import '../../../data/models/expense.dart';
import 'offline_expense_queue.dart';

class ExpenseProvider with ChangeNotifier {
  final ExpenseRepository _repository;
  final ImagePicker _imagePicker;
  
  /// Expenses fetched per page; more load as the list scrolls.
  static const pageSize = 50;

  List<Expense> _expenses = [];
  String? _status;
  String? _labelId;
  bool _hasMore = false;
  bool _isLoadingMore = false;
  List<ExpenseLabel> _labels = [];
  List<String> _labelColors = [];
  ExpenseOptions? _options;
  Expense? _selectedExpense;
  bool _isLoading = false;
  bool _isUploading = false;
  String? _error;
  double _uploadProgress = 0.0;
  
  ExpenseProvider({
    ExpenseRepository? repository,
    ImagePicker? imagePicker,
    OfflineExpenseQueue? offlineQueue,
  })  : _repository = repository ?? ExpenseRepository(),
        _imagePicker = imagePicker ?? ImagePicker(),
        _queue = offlineQueue ?? OfflineExpenseQueue();

  final OfflineExpenseQueue _queue;
  List<QueuedExpense> _queued = [];
  bool _lastFailureOffline = false;

  /// Expenses saved on this phone while offline, oldest first.
  List<QueuedExpense> get queued => _queued;

  /// Whether the last create failed for want of a connection.
  bool get lastFailureOffline => _lastFailureOffline;

  /// Keep an expense (and its receipt) on the phone until it can be sent.
  Future<void> queueExpense(CreateExpenseRequest request, {String? receiptPath}) async {
    await _queue.add(request.toJson(), receiptPath: receiptPath);
    _queued = await _queue.items();
    notifyListeners();
  }

  /// Send what's waiting; reloads the list if anything went.
  Future<int> sendQueued() async {
    final sent = await _queue.flush(_repository);
    _queued = await _queue.items();
    notifyListeners();
    if (sent > 0) await loadExpenses();
    return sent;
  }

  Future<void> retryQueued(String clientRequestId) async {
    await _queue.retry(clientRequestId);
    await sendQueued();
  }

  Future<void> discardQueued(String clientRequestId) async {
    await _queue.remove(clientRequestId);
    _queued = await _queue.items();
    notifyListeners();
  }
  
  List<Expense> get expenses => _expenses;
  bool get hasMore => _hasMore;
  bool get isLoadingMore => _isLoadingMore;
  String? get statusFilter => _status;
  String? get labelFilter => _labelId;
  List<ExpenseLabel> get labels => _labels;
  List<String> get labelColors => _labelColors;
  ExpenseOptions? get options => _options;
  Expense? get selectedExpense => _selectedExpense;
  bool get isLoading => _isLoading;
  bool get isUploading => _isUploading;
  String? get error => _error;
  double get uploadProgress => _uploadProgress;
  
  List<Expense> get pendingExpenses => 
      _expenses.where((e) => e.isPending).toList();
  
  /// Filter by status and/or label (null for all) and load the first page.
  Future<void> applyFilters({String? status, String? labelId}) {
    _status = status;
    _labelId = labelId;
    return loadExpenses();
  }

  /// The first page, with the filters already chosen.
  Future<void> loadExpenses() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    final response = await _repository.getExpenses(
      status: _status,
      labelId: _labelId,
      limit: pageSize,
      offset: 0,
    );

    if (response.success && response.data != null) {
      _expenses = response.data!.items;
      _hasMore = response.data!.hasMore;
      _error = null;
    } else {
      _error = response.error;
    }

    _isLoading = false;
    notifyListeners();
  }

  /// The next page, appended. Does nothing while loading or at the end.
  Future<void> loadMore() async {
    if (!_hasMore || _isLoadingMore || _isLoading) return;
    _isLoadingMore = true;
    notifyListeners();

    final response = await _repository.getExpenses(
      status: _status,
      labelId: _labelId,
      limit: pageSize,
      offset: _expenses.length,
    );
    if (response.success && response.data != null) {
      final seen = _expenses.map((e) => e.id).toSet();
      _expenses = [
        ..._expenses,
        ...response.data!.items.where((e) => !seen.contains(e.id)),
      ];
      _hasMore = response.data!.hasMore;
    } else {
      _error = response.error;
    }
    _isLoadingMore = false;
    notifyListeners();
  }

  Future<void> loadLabels() async {
    final response = await _repository.getLabels();
    if (response.success && response.data != null) {
      _labels = response.data!.labels;
      _labelColors = response.data!.colors;
      notifyListeners();
    }
  }

  Future<String?> createLabel(String name, String color) async {
    final response = await _repository.createLabel(name, color);
    if (!response.success) {
      _error = response.error;
      notifyListeners();
      return null;
    }
    await loadLabels();
    return response.data;
  }

  /// Save an expense's labels and note, and update it in the list.
  Future<bool> annotateExpense(
    String id, {
    required List<String> labelIds,
    required String? note,
  }) async {
    final response = await _repository.annotateExpense(
      id,
      labelIds: labelIds,
      note: note,
      setNote: true,
    );
    if (!response.success || response.data == null) {
      _error = response.error;
      notifyListeners();
      return false;
    }
    final updated = response.data!;
    _expenses = [for (final e in _expenses) e.id == id ? updated : e];
    if (_selectedExpense?.id == id) _selectedExpense = updated;
    notifyListeners();
    return true;
  }
  
  /// Read a receipt photo; null (with [error] set) when it can't be read.
  Future<ReceiptExtraction?> readReceipt(XFile file) async {
    final response = await _repository.extractReceipt(file.path);
    if (response.success) return response.data;
    _error = response.error;
    notifyListeners();
    return null;
  }

  /// Payers, clients, orders and VAT for the capture and approve forms.
  Future<ExpenseOptions?> loadOptions() async {
    final response = await _repository.getOptions();
    if (response.success && response.data != null) {
      _options = response.data;
      notifyListeners();
    }
    return _options;
  }

  Future<bool> createExpense(CreateExpenseRequest request) async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    
    final response = await _repository.createExpense(request);
    _lastFailureOffline = response.isOffline;
    
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
  
  /// A PDF or image receipt from Files, e.g. one saved from an email.
  Future<XFile?> pickReceiptFile() async {
    try {
      final file = await FilePicker.pickFile(
        type: FileType.custom,
        allowedExtensions: receiptFileExtensions,
      );
      final path = file?.path;
      return path == null ? null : XFile(path, name: file!.name);
    } catch (e) {
      _error = 'Failed to pick file: $e';
      notifyListeners();
      return null;
    }
  }

  Future<bool> approveExpense(
    String id, {
    required String approvalType,
    String? paidByUserId,
  }) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    final response = await _repository.approveExpense(
      id,
      approvalType: approvalType,
      paidByUserId: paidByUserId,
    );
    
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

    if (response.success) {
      // Rejecting deletes the expense, so drop it from the list.
      _expenses.removeWhere((e) => e.id == id);
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
