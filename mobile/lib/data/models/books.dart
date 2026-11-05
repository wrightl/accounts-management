import '../../core/utils/json.dart';

class BookStat {
  BookStat({required this.label, required this.value});

  final String label;
  final String value;

  factory BookStat.fromJson(Map<String, dynamic> json) {
    return BookStat(
      label: asString(json['label']),
      value: asString(json['value']),
    );
  }
}

class BookRecord {
  BookRecord({
    required this.id,
    required this.title,
    required this.subtitle,
    this.amount,
    this.status,
    this.date,
    required this.details,
    this.amountDuePence,
    this.canMarkPaid = false,
  });

  final String id;
  final String title;
  final String subtitle;
  final String? amount;
  final String? status;
  final String? date;
  final Map<String, String> details;

  /// Set on a sent invoice still owed money: Record payment prefills this.
  final int? amountDuePence;

  /// An unpaid reimbursement run that can be marked paid now.
  final bool canMarkPaid;

  factory BookRecord.fromJson(Map<String, dynamic> json) {
    final rawDetails = asMap(json['details']);
    final actions = asMap(json['actions']);
    final payment = asMap(actions['recordPayment']);
    return BookRecord(
      id: asString(json['id']),
      title: asString(json['title']),
      subtitle: asString(json['subtitle']),
      amount: json['amount'] as String?,
      status: json['status'] as String?,
      date: json['date'] as String?,
      details: {
        for (final entry in rawDetails.entries)
          entry.key: asString(entry.value, '—'),
      },
      amountDuePence:
          payment['amountDuePence'] == null ? null : asInt(payment['amountDuePence']),
      canMarkPaid: actions['markPaid'] == true,
    );
  }
}

class BooksPage {
  BooksPage({
    required this.title,
    required this.emptyMessage,
    required this.stats,
    required this.items,
    this.hasMore = false,
  });

  final String title;
  final String emptyMessage;
  final List<BookStat> stats;
  final List<BookRecord> items;

  /// More items after these; ask with `offset: items.length`.
  final bool hasMore;

  /// This page followed by the next one.
  BooksPage append(BooksPage next) {
    final seen = items.map((i) => i.id).toSet();
    return BooksPage(
      title: title,
      emptyMessage: emptyMessage,
      stats: stats,
      items: [...items, ...next.items.where((i) => !seen.contains(i.id))],
      hasMore: next.hasMore,
    );
  }

  factory BooksPage.fromJson(Map<String, dynamic> json) {
    return BooksPage(
      title: asString(json['title']),
      emptyMessage: asString(json['emptyMessage'], 'Nothing here yet.'),
      stats: asList(json['stats'])
          .whereType<Map>()
          .map((e) => BookStat.fromJson(asMap(e)))
          .toList(),
      items: asList(json['items'])
          .whereType<Map>()
          .map((e) => BookRecord.fromJson(asMap(e)))
          .toList(),
      hasMore: json['hasMore'] == true,
    );
  }
}
