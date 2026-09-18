import 'package:json_annotation/json_annotation.dart';

part 'dashboard.g.dart';

@JsonSerializable()
class DashboardData {
  final DashboardKpis kpis;
  final List<AttentionItem> attentionItems;
  final RecentActivity recentActivity;
  
  DashboardData({
    required this.kpis,
    required this.attentionItems,
    required this.recentActivity,
  });
  
  factory DashboardData.fromJson(Map<String, dynamic> json) => 
      _$DashboardDataFromJson(json);
  Map<String, dynamic> toJson() => _$DashboardDataToJson(this);
}

@JsonSerializable()
class DashboardKpis {
  final int totalRevenuePence;
  final int outstandingPence;
  final int expensesThisMonthPence;
  final int pendingExpensesCount;
  final int overdueInvoicesCount;
  
  DashboardKpis({
    required this.totalRevenuePence,
    required this.outstandingPence,
    required this.expensesThisMonthPence,
    required this.pendingExpensesCount,
    required this.overdueInvoicesCount,
  });
  
  factory DashboardKpis.fromJson(Map<String, dynamic> json) => 
      _$DashboardKpisFromJson(json);
  Map<String, dynamic> toJson() => _$DashboardKpisToJson(this);
}

@JsonSerializable()
class AttentionItem {
  final String id;
  final String type;
  final String title;
  final String description;
  final String priority;
  final DateTime createdAt;
  final Map<String, dynamic>? metadata;
  
  AttentionItem({
    required this.id,
    required this.type,
    required this.title,
    required this.description,
    required this.priority,
    required this.createdAt,
    this.metadata,
  });
  
  factory AttentionItem.fromJson(Map<String, dynamic> json) => 
      _$AttentionItemFromJson(json);
  Map<String, dynamic> toJson() => _$AttentionItemToJson(this);
  
  bool get isHighPriority => priority == 'high';
  bool get isMediumPriority => priority == 'medium';
  bool get isLowPriority => priority == 'low';
}

@JsonSerializable()
class RecentActivity {
  final int recentExpensesCount;
  final int recentInvoicesCount;
  final int recentQuotesCount;
  
  RecentActivity({
    required this.recentExpensesCount,
    required this.recentInvoicesCount,
    required this.recentQuotesCount,
  });
  
  factory RecentActivity.fromJson(Map<String, dynamic> json) => 
      _$RecentActivityFromJson(json);
  Map<String, dynamic> toJson() => _$RecentActivityToJson(this);
}
