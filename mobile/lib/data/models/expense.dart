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
    required this.billable,
    this.vatRate = 0,
    this.clientId,
    this.clientName,
    this.paidByUserId,
    this.paidByName,
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
  final bool billable;
  final int vatRate;
  final String? clientId;
  final String? clientName;
  final String? paidByUserId;
  final String? paidByName;
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

  String get statusLabel => expenseStatusLabel(status);

  factory Expense.fromJson(Map<String, dynamic> json) {
    return Expense(
      id: asString(json['id']),
      companyId: asString(json['companyId']),
      description: asString(json['description']),
      amountPence: asInt(json['amountPence']),
      category: asString(json['category'], 'Other'),
      expenseDate: asDateTime(json['expenseDate'] ?? json['spentAt']),
      status: asString(json['status'], 'recorded'),
      billable: json['billable'] == true,
      vatRate: asInt(json['vatRate']),
      clientId: json['clientId'] as String?,
      clientName: json['clientName'] as String?,
      paidByUserId: json['paidByUserId'] as String?,
      paidByName: json['paidByName'] as String?,
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
    required this.status,
    this.paidByUserId,
    this.billable = false,
    this.clientId,
    this.orderId,
    this.vatRate = 0,
    this.mileageMiles,
    this.mileageRatePence,
  });

  final String description;
  final int amountPence;
  final String category;
  final DateTime expenseDate;

  /// One of [expensePaymentStatuses].
  final String status;
  final String? paidByUserId;
  final bool billable;
  final String? clientId;
  final String? orderId;
  final int vatRate;

  /// Set both to log a mileage allowance; the server works out the amount.
  final num? mileageMiles;
  final int? mileageRatePence;

  bool get isMileage => mileageMiles != null;

  Map<String, dynamic> toJson() => {
        'description': description,
        'amountPence': amountPence,
        'category': category,
        'expenseDate': expenseDate.toIso8601String().split('T').first,
        'status': status,
        'paidByUserId': paidByUserId,
        'billable': billable,
        'clientId': clientId,
        'orderId': orderId,
        'vatRate': vatRate,
        if (isMileage) ...{
          'useMileage': true,
          'mileageMiles': mileageMiles,
          'mileageRatePence': mileageRatePence,
        },
      };
}

/// What the server read from a receipt photo.
class ReceiptExtraction {
  ReceiptExtraction({
    this.description,
    this.amountPounds,
    this.spentAt,
    this.category,
    this.currency,
    required this.confidence,
  });

  final String? description;
  final String? amountPounds;
  final DateTime? spentAt;
  final String? category;

  /// e.g. GBP, USD; null when not detected.
  final String? currency;

  /// `high`, `partial` or `none`.
  final String confidence;

  bool get isForeignCurrency =>
      currency != null && currency!.toUpperCase() != 'GBP';

  /// Same wording as the web receipt field.
  String get summary {
    final parts = [
      if (description != null) 'description',
      if (amountPounds != null) 'amount',
      if (spentAt != null) 'date',
      if (category != null) 'category',
    ];
    if (parts.isEmpty) return 'No fields could be read — fill in the details manually.';
    return 'Filled: ${parts.join(', ')}';
  }

  factory ReceiptExtraction.fromJson(Map<String, dynamic> json) {
    String? text(String key) {
      final value = json[key];
      return value is String && value.trim().isNotEmpty ? value.trim() : null;
    }

    final date = text('spentAt');
    return ReceiptExtraction(
      description: text('description'),
      amountPounds: text('amountPounds'),
      spentAt: date == null ? null : DateTime.tryParse(date),
      category: text('category'),
      currency: text('currency'),
      confidence: text('confidence') ?? 'none',
    );
  }
}

/// Choices for the capture and approve forms, loaded from the server.
class ExpenseOptions {
  ExpenseOptions({
    required this.categories,
    required this.payers,
    this.defaultPayerId,
    required this.clients,
    required this.orders,
    required this.vatRegistered,
    required this.defaultVatRate,
    this.defaultMileageRatePence = 45,
  });

  final List<String> categories;
  final List<ExpenseChoice> payers;
  final String? defaultPayerId;
  final List<ExpenseChoice> clients;
  final List<ExpenseOrderChoice> orders;
  final bool vatRegistered;
  final int defaultVatRate;
  final int defaultMileageRatePence;

  factory ExpenseOptions.fromJson(Map<String, dynamic> json) {
    List<ExpenseChoice> choices(dynamic value) => asList(value)
        .whereType<Map>()
        .map((e) => ExpenseChoice.fromJson(asMap(e)))
        .toList();
    final categories = asList(json['categories']).map(asString).toList();
    return ExpenseOptions(
      categories: categories.isEmpty ? expenseCategories : categories,
      payers: choices(json['payers']),
      defaultPayerId: json['defaultPayerId'] as String?,
      clients: choices(json['clients']),
      orders: asList(json['orders'])
          .whereType<Map>()
          .map((e) => ExpenseOrderChoice.fromJson(asMap(e)))
          .toList(),
      vatRegistered: json['vatRegistered'] == true,
      defaultVatRate: asInt(json['defaultVatRate']),
      defaultMileageRatePence: asInt(json['defaultMileageRatePence'], 45),
    );
  }
}

class ExpenseChoice {
  ExpenseChoice({required this.id, required this.name});

  final String id;
  final String name;

  factory ExpenseChoice.fromJson(Map<String, dynamic> json) =>
      ExpenseChoice(id: asString(json['id']), name: asString(json['name']));
}

class ExpenseOrderChoice {
  ExpenseOrderChoice({
    required this.id,
    required this.number,
    required this.clientId,
    required this.clientName,
  });

  final String id;
  final String number;
  final String clientId;
  final String clientName;

  factory ExpenseOrderChoice.fromJson(Map<String, dynamic> json) =>
      ExpenseOrderChoice(
        id: asString(json['id']),
        number: asString(json['number']),
        clientId: asString(json['clientId']),
        clientName: asString(json['clientName']),
      );
}

/// Fallback when the options endpoint is unavailable; matches the web list.
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

/// How an expense was paid, as chosen on the web form and review.
const expensePaymentStatuses = ['recorded', 'reimbursable', 'company_paid'];

/// Every status an expense can have, for the list filter.
const expenseStatuses = [
  'pending',
  'recorded',
  'reimbursable',
  'reimbursed',
  'company_paid',
];

/// Same labels as the web (`expenseStatusLabel`).
String expenseStatusLabel(String status) {
  switch (status) {
    case 'pending':
      return 'Pending review';
    case 'recorded':
      return 'Recorded';
    case 'reimbursable':
      return 'Reimbursable';
    case 'reimbursed':
      return 'Reimbursed';
    case 'company_paid':
      return 'Company paid';
    default:
      return status;
  }
}
