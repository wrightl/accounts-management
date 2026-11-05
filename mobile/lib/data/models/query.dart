import '../../core/utils/json.dart';

/// A question the accountant raised, as on the web Queries page.
class AccountantQuery {
  AccountantQuery({
    required this.id,
    required this.subject,
    required this.status,
    required this.statusLabel,
    this.recordLabel,
    this.raisedByName,
    this.updatedAt,
  });

  final String id;
  final String subject;

  /// `open` (waiting for the team), `answered` or `closed`.
  final String status;
  final String statusLabel;

  /// The record it's about, e.g. "Expense: Taxi"; null for a general question.
  final String? recordLabel;
  final String? raisedByName;
  final DateTime? updatedAt;

  bool get isWaitingForTeam => status == 'open';
  bool get isClosed => status == 'closed';

  factory AccountantQuery.fromJson(Map<String, dynamic> json) => AccountantQuery(
        id: asString(json['id']),
        subject: asString(json['subject']),
        status: asString(json['status'], 'open'),
        statusLabel: asString(json['statusLabel']),
        recordLabel: json['recordLabel'] as String?,
        raisedByName: json['raisedByName'] as String?,
        updatedAt: json['updatedAt'] == null ? null : asDateTime(json['updatedAt']),
      );
}

class QueryMessage {
  QueryMessage({
    required this.id,
    required this.body,
    required this.authorName,
    required this.createdAt,
  });

  final String id;
  final String body;
  final String authorName;
  final DateTime createdAt;

  factory QueryMessage.fromJson(Map<String, dynamic> json) => QueryMessage(
        id: asString(json['id']),
        body: asString(json['body']),
        authorName: asString(json['authorName']),
        createdAt: asDateTime(json['createdAt']),
      );
}

class QueryThread {
  QueryThread({required this.query, required this.messages});

  final AccountantQuery query;
  final List<QueryMessage> messages;

  factory QueryThread.fromJson(Map<String, dynamic> json) => QueryThread(
        query: AccountantQuery.fromJson(json),
        messages: asList(json['messages'])
            .whereType<Map>()
            .map((e) => QueryMessage.fromJson(asMap(e)))
            .toList(),
      );
}
