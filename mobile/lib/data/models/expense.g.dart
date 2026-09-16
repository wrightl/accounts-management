// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'expense.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Expense _$ExpenseFromJson(Map<String, dynamic> json) => Expense(
  id: json['id'] as String,
  companyId: json['companyId'] as String,
  description: json['description'] as String,
  amountPence: (json['amountPence'] as num).toInt(),
  category: json['category'] as String,
  expenseDate: DateTime.parse(json['expenseDate'] as String),
  status: json['status'] as String,
  notes: json['notes'] as String?,
  billable: json['billable'] as bool,
  source: json['source'] as String,
  receipts: (json['receipts'] as List<dynamic>)
      .map((e) => ExpenseReceipt.fromJson(e as Map<String, dynamic>))
      .toList(),
  createdByName: json['createdByName'] as String?,
  createdAt: DateTime.parse(json['createdAt'] as String),
  updatedAt: DateTime.parse(json['updatedAt'] as String),
);

Map<String, dynamic> _$ExpenseToJson(Expense instance) => <String, dynamic>{
  'id': instance.id,
  'companyId': instance.companyId,
  'description': instance.description,
  'amountPence': instance.amountPence,
  'category': instance.category,
  'expenseDate': instance.expenseDate.toIso8601String(),
  'status': instance.status,
  'notes': instance.notes,
  'billable': instance.billable,
  'source': instance.source,
  'receipts': instance.receipts,
  'createdByName': instance.createdByName,
  'createdAt': instance.createdAt.toIso8601String(),
  'updatedAt': instance.updatedAt.toIso8601String(),
};

ExpenseReceipt _$ExpenseReceiptFromJson(Map<String, dynamic> json) =>
    ExpenseReceipt(
      id: json['id'] as String,
      filename: json['filename'] as String,
      url: json['url'] as String?,
      fileSizeBytes: (json['fileSizeBytes'] as num?)?.toInt(),
      uploadedAt: DateTime.parse(json['uploadedAt'] as String),
    );

Map<String, dynamic> _$ExpenseReceiptToJson(ExpenseReceipt instance) =>
    <String, dynamic>{
      'id': instance.id,
      'filename': instance.filename,
      'url': instance.url,
      'fileSizeBytes': instance.fileSizeBytes,
      'uploadedAt': instance.uploadedAt.toIso8601String(),
    };

CreateExpenseRequest _$CreateExpenseRequestFromJson(
  Map<String, dynamic> json,
) => CreateExpenseRequest(
  description: json['description'] as String,
  amountPence: (json['amountPence'] as num).toInt(),
  category: json['category'] as String,
  expenseDate: DateTime.parse(json['expenseDate'] as String),
  notes: json['notes'] as String?,
  billable: json['billable'] as bool? ?? false,
);

Map<String, dynamic> _$CreateExpenseRequestToJson(
  CreateExpenseRequest instance,
) => <String, dynamic>{
  'description': instance.description,
  'amountPence': instance.amountPence,
  'category': instance.category,
  'expenseDate': instance.expenseDate.toIso8601String(),
  'notes': instance.notes,
  'billable': instance.billable,
};
