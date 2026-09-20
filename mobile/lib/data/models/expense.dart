import '../../core/utils/json.dart';

class Expense {
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

  bool get isPending => status == 'pending';
  bool get isRecorded => status == 'recorded';
  bool get isReimbursable => status == 'reimbursable';
  bool get isReimbursed => status == 'reimbursed';
  bool get isCompanyPaid => status == 'company_paid';
  bool get isRejected => status == 'rejected';

  factory Expense.fromJson(Map<String, dynamic> json) {
    return Expense(
      id: asString(json['id']),
      companyId: asString(json['companyId']),
      description: asString(json['description']),
      amountPence: asInt(json['amountPence']),
      category: asString(json['category'], 'Other'),
      expenseDate: asDateTime(json['expenseDate'] ?? json['spentAt']),
      status: asString(json['status'], 'recorded'),
      notes: json['notes'] as String?,
      billable: json['billable'] == true,
      source: asString(json['source'], 'manual'),
      receipts: asList(json['receipts'])
          .whereType<Map>()
          .map((e) => ExpenseReceipt.fromJson(asMap(e)))
          .toList(),
      createdByName: json['createdByName'] as String?,
      createdAt: asDateTime(json['createdAt']),
      updatedAt: asDateTime(json['updatedAt'] ?? json['createdAt']),
    );
  }
}

class ExpenseReceipt {
  ExpenseReceipt({
    required this.id,
    required this.filename,
    this.url,
    this.fileSizeBytes,
    required this.uploadedAt,
  });

  final String id;
  final String filename;
  final String? url;
  final int? fileSizeBytes;
  final DateTime uploadedAt;

  factory ExpenseReceipt.fromJson(Map<String, dynamic> json) {
    return ExpenseReceipt(
      id: asString(json['id']),
      filename: asString(json['filename'], 'receipt'),
      url: json['url'] as String?,
      fileSizeBytes: json['fileSizeBytes'] == null
          ? null
          : asInt(json['fileSizeBytes']),
      uploadedAt: asDateTime(json['uploadedAt']),
    );
  }
}

class CreateExpenseRequest {
  CreateExpenseRequest({
    required this.description,
    required this.amountPence,
    required this.category,
    required this.expenseDate,
    this.notes,
    this.billable = false,
  });

  final String description;
  final int amountPence;
  final String category;
  final DateTime expenseDate;
  final String? notes;
  final bool billable;

  Map<String, dynamic> toJson() => {
        'description': description,
        'amountPence': amountPence,
        'category': category,
        'expenseDate': expenseDate.toIso8601String().split('T').first,
        'notes': notes,
        'billable': billable,
      };
}

const expenseCategories = [
  'Travel',
  'Meals',
  'Software',
  'Office',
  'Marketing',
  'Professional fees',
  'Equipment',
  'Training',
  'Other',
];
