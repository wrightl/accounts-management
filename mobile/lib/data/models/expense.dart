import 'package:json_annotation/json_annotation.dart';

part 'expense.g.dart';

@JsonSerializable()
class Expense {
  final String id;
  final String companyId;
  final String description;
  final int amountPence;
  final String category;
  final DateTime expenseDate;
  final String status;
  final String? notes;
  final bool billable;
  final String source;
  final List<ExpenseReceipt> receipts;
  final String? createdByName;
  final DateTime createdAt;
  final DateTime updatedAt;
  
  Expense({
    required this.id,
    required this.companyId,
    required this.description,
    required this.amountPence,
    required this.category,
    required this.expenseDate,
    required this.status,
    this.notes,
    required this.billable,
    required this.source,
    required this.receipts,
    this.createdByName,
    required this.createdAt,
    required this.updatedAt,
  });
  
  factory Expense.fromJson(Map<String, dynamic> json) => _$ExpenseFromJson(json);
  Map<String, dynamic> toJson() => _$ExpenseToJson(this);
  
  bool get isPending => status == 'pending';
  bool get isRecorded => status == 'recorded';
  bool get isReimbursable => status == 'reimbursable';
  bool get isReimbursed => status == 'reimbursed';
  bool get isCompanyPaid => status == 'company_paid';
  bool get isRejected => status == 'rejected';
}

@JsonSerializable()
class ExpenseReceipt {
  final String id;
  final String filename;
  final String? url;
  final int? fileSizeBytes;
  final DateTime uploadedAt;
  
  ExpenseReceipt({
    required this.id,
    required this.filename,
    this.url,
    this.fileSizeBytes,
    required this.uploadedAt,
  });
  
  factory ExpenseReceipt.fromJson(Map<String, dynamic> json) => _$ExpenseReceiptFromJson(json);
  Map<String, dynamic> toJson() => _$ExpenseReceiptToJson(this);
}

@JsonSerializable()
class CreateExpenseRequest {
  final String description;
  final int amountPence;
  final String category;
  final DateTime expenseDate;
  final String? notes;
  final bool billable;
  
  CreateExpenseRequest({
    required this.description,
    required this.amountPence,
    required this.category,
    required this.expenseDate,
    this.notes,
    this.billable = false,
  });
  
  factory CreateExpenseRequest.fromJson(Map<String, dynamic> json) => 
      _$CreateExpenseRequestFromJson(json);
  Map<String, dynamic> toJson() => _$CreateExpenseRequestToJson(this);
}
