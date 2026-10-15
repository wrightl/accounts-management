import '../../core/utils/json.dart';

/// A filing or payment deadline, as on the web Deadlines page.
class Deadline {
  Deadline({
    required this.kind,
    required this.label,
    required this.dueDate,
    this.period,
    this.detail = '',
    required this.status,
    required this.daysLeft,
    this.filedOn,
    this.filedByName,
  });

  final String kind;
  final String label;
  final String dueDate;
  final String? period;
  final String detail;

  /// One of `done`, `overdue`, `due_soon`, `upcoming`.
  final String status;
  final int daysLeft;
  final String? filedOn;
  final String? filedByName;

  bool get isDone => status == 'done';
  bool get isOverdue => status == 'overdue';

  /// "Due in 12 days", "Due today", "3 days overdue", as on the web.
  String get whenLabel {
    if (isDone) return filedOn == null ? 'Done' : 'Done on $filedOn';
    if (daysLeft == 0) return 'Due today';
    if (daysLeft < 0) {
      final n = -daysLeft;
      return '$n day${n == 1 ? '' : 's'} overdue';
    }
    return 'Due in $daysLeft day${daysLeft == 1 ? '' : 's'}';
  }

  factory Deadline.fromJson(Map<String, dynamic> json) => Deadline(
        kind: asString(json['kind']),
        label: asString(json['label']),
        dueDate: asString(json['dueDate']),
        period: json['period'] as String?,
        detail: asString(json['detail']),
        status: asString(json['status'], 'upcoming'),
        daysLeft: asInt(json['daysLeft']),
        filedOn: json['filedOn'] as String?,
        filedByName: json['filedByName'] as String?,
      );
}

class DeadlinesPage {
  DeadlinesPage({required this.deadlines, required this.missingCompaniesHouse});

  final List<Deadline> deadlines;
  final bool missingCompaniesHouse;

  factory DeadlinesPage.fromJson(Map<String, dynamic> json) => DeadlinesPage(
        deadlines: asList(json['deadlines'])
            .whereType<Map>()
            .map((e) => Deadline.fromJson(asMap(e)))
            .toList(),
        missingCompaniesHouse: json['missingCompaniesHouse'] == true,
      );
}

class CloseItem {
  CloseItem({
    required this.key,
    required this.label,
    required this.count,
    this.amountFormatted,
  });

  final String key;
  final String label;
  final int count;
  final String? amountFormatted;

  bool get isDone => count == 0;

  factory CloseItem.fromJson(Map<String, dynamic> json) => CloseItem(
        key: asString(json['key']),
        label: asString(json['label']),
        count: asInt(json['count']),
        amountFormatted: json['amountFormatted'] as String?,
      );
}

/// The weekly close checklist, as on the web Weekly close page.
class WeeklyClose {
  WeeklyClose({
    required this.outstanding,
    this.bankReconciledThrough,
    required this.items,
    this.lastClosedAt,
    this.lastClosedByName,
    required this.deadlines,
  });

  final int outstanding;
  final String? bankReconciledThrough;
  final List<CloseItem> items;
  final DateTime? lastClosedAt;
  final String? lastClosedByName;
  final List<Deadline> deadlines;

  factory WeeklyClose.fromJson(Map<String, dynamic> json) {
    final last = json['lastClose'];
    return WeeklyClose(
      outstanding: asInt(json['outstanding']),
      bankReconciledThrough: json['bankReconciledThrough'] as String?,
      items: asList(json['items'])
          .whereType<Map>()
          .map((e) => CloseItem.fromJson(asMap(e)))
          .toList(),
      lastClosedAt: last is Map ? asDateTime(last['closedAt']) : null,
      lastClosedByName: last is Map ? last['closedByName'] as String? : null,
      deadlines: asList(json['deadlines'])
          .whereType<Map>()
          .map((e) => Deadline.fromJson(asMap(e)))
          .toList(),
    );
  }
}

class CategorySuggestion {
  CategorySuggestion({
    required this.id,
    required this.bookedAt,
    this.counterparty,
    required this.amountFormatted,
    required this.categoryLabel,
    this.reason,
    this.source,
  });

  final String id;
  final String bookedAt;
  final String? counterparty;
  final String amountFormatted;
  final String categoryLabel;
  final String? reason;

  /// `history` (learned from your own choices) or `ai`.
  final String? source;

  factory CategorySuggestion.fromJson(Map<String, dynamic> json) =>
      CategorySuggestion(
        id: asString(json['id']),
        bookedAt: asString(json['bookedAt']),
        counterparty: json['counterparty'] as String?,
        amountFormatted: asString(json['amountFormatted']),
        categoryLabel: asString(json['categoryLabel']),
        reason: json['reason'] as String?,
        source: json['source'] as String?,
      );
}

class ReceiptMatchSuggestion {
  ReceiptMatchSuggestion({
    required this.matchId,
    this.note,
    required this.expenseDescription,
    required this.expenseAmountFormatted,
    this.spentAt,
    this.counterparty,
    required this.bankAmountFormatted,
    required this.bookedAt,
    required this.amountsDiffer,
  });

  final String matchId;
  final String? note;
  final String expenseDescription;
  final String expenseAmountFormatted;
  final String? spentAt;
  final String? counterparty;
  final String bankAmountFormatted;
  final String bookedAt;
  final bool amountsDiffer;

  factory ReceiptMatchSuggestion.fromJson(Map<String, dynamic> json) =>
      ReceiptMatchSuggestion(
        matchId: asString(json['matchId']),
        note: json['note'] as String?,
        expenseDescription: asString(json['expenseDescription']),
        expenseAmountFormatted: asString(json['expenseAmountFormatted']),
        spentAt: json['spentAt'] as String?,
        counterparty: json['counterparty'] as String?,
        bankAmountFormatted: asString(json['bankAmountFormatted']),
        bookedAt: asString(json['bookedAt']),
        amountsDiffer: json['amountsDiffer'] == true,
      );
}

/// Suggestions waiting on the AI bookkeeper page.
class BookkeeperPage {
  BookkeeperPage({
    required this.aiReady,
    required this.uncategorised,
    required this.categories,
    required this.receipts,
  });

  final bool aiReady;
  final int uncategorised;
  final List<CategorySuggestion> categories;
  final List<ReceiptMatchSuggestion> receipts;

  factory BookkeeperPage.fromJson(Map<String, dynamic> json) => BookkeeperPage(
        aiReady: json['aiReady'] == true,
        uncategorised: asInt(json['uncategorised']),
        categories: asList(json['categories'])
            .whereType<Map>()
            .map((e) => CategorySuggestion.fromJson(asMap(e)))
            .toList(),
        receipts: asList(json['receipts'])
            .whereType<Map>()
            .map((e) => ReceiptMatchSuggestion.fromJson(asMap(e)))
            .toList(),
      );
}
