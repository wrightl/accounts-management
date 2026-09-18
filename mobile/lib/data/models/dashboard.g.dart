// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dashboard.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DashboardData _$DashboardDataFromJson(Map<String, dynamic> json) =>
    DashboardData(
      kpis: DashboardKpis.fromJson(json['kpis'] as Map<String, dynamic>),
      attentionItems: (json['attentionItems'] as List<dynamic>)
          .map((e) => AttentionItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      recentActivity: RecentActivity.fromJson(
        json['recentActivity'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$DashboardDataToJson(DashboardData instance) =>
    <String, dynamic>{
      'kpis': instance.kpis,
      'attentionItems': instance.attentionItems,
      'recentActivity': instance.recentActivity,
    };

DashboardKpis _$DashboardKpisFromJson(Map<String, dynamic> json) =>
    DashboardKpis(
      totalRevenuePence: (json['totalRevenuePence'] as num).toInt(),
      outstandingPence: (json['outstandingPence'] as num).toInt(),
      expensesThisMonthPence: (json['expensesThisMonthPence'] as num).toInt(),
      pendingExpensesCount: (json['pendingExpensesCount'] as num).toInt(),
      overdueInvoicesCount: (json['overdueInvoicesCount'] as num).toInt(),
    );

Map<String, dynamic> _$DashboardKpisToJson(DashboardKpis instance) =>
    <String, dynamic>{
      'totalRevenuePence': instance.totalRevenuePence,
      'outstandingPence': instance.outstandingPence,
      'expensesThisMonthPence': instance.expensesThisMonthPence,
      'pendingExpensesCount': instance.pendingExpensesCount,
      'overdueInvoicesCount': instance.overdueInvoicesCount,
    };

AttentionItem _$AttentionItemFromJson(Map<String, dynamic> json) =>
    AttentionItem(
      id: json['id'] as String,
      type: json['type'] as String,
      title: json['title'] as String,
      description: json['description'] as String,
      priority: json['priority'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      metadata: json['metadata'] as Map<String, dynamic>?,
    );

Map<String, dynamic> _$AttentionItemToJson(AttentionItem instance) =>
    <String, dynamic>{
      'id': instance.id,
      'type': instance.type,
      'title': instance.title,
      'description': instance.description,
      'priority': instance.priority,
      'createdAt': instance.createdAt.toIso8601String(),
      'metadata': instance.metadata,
    };

RecentActivity _$RecentActivityFromJson(Map<String, dynamic> json) =>
    RecentActivity(
      recentExpensesCount: (json['recentExpensesCount'] as num).toInt(),
      recentInvoicesCount: (json['recentInvoicesCount'] as num).toInt(),
      recentQuotesCount: (json['recentQuotesCount'] as num).toInt(),
    );

Map<String, dynamic> _$RecentActivityToJson(RecentActivity instance) =>
    <String, dynamic>{
      'recentExpensesCount': instance.recentExpensesCount,
      'recentInvoicesCount': instance.recentInvoicesCount,
      'recentQuotesCount': instance.recentQuotesCount,
    };
