import 'package:flutter/material.dart' hide DateUtils;
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../data/models/query.dart';
import '../../data/repositories/queries_repository.dart';
import '../../shared/widgets/loaded_list.dart';
import '../auth/auth_provider.dart';

/// Your accountant's questions, waiting ones first, as on the web.
class QueriesScreen extends StatelessWidget {
  const QueriesScreen({super.key, this.repository});

  final QueriesRepository? repository;

  @override
  Widget build(BuildContext context) {
    final repo = repository ?? QueriesRepository();
    return Scaffold(
      appBar: AppBar(title: const Text('Queries')),
      body: LoadedList<List<AccountantQuery>>(
        load: repo.list,
        builder: (context, queries, reload) {
          if (queries.isEmpty) {
            return const [
              Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Text(
                  'No questions from your accountant.',
                  textAlign: TextAlign.center,
                ),
              ),
            ];
          }
          final ordered = [
            ...queries.where((q) => q.isWaitingForTeam),
            ...queries.where((q) => !q.isWaitingForTeam),
          ];
          return [
            for (final query in ordered)
              Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: ListTile(
                  leading: QueryStatusIcon(status: query.status),
                  title: Text(query.subject),
                  subtitle: Text(
                    [
                      query.statusLabel,
                      ?query.recordLabel,
                      if (query.updatedAt != null) DateUtils.formatDate(query.updatedAt!),
                    ].join(' · '),
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () async {
                    await Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => QueryThreadScreen(queryId: query.id, repository: repo),
                      ),
                    );
                    await reload();
                  },
                ),
              ),
          ];
        },
      ),
    );
  }
}

/// The web's query icon colours: amber waiting for you, navy answered,
/// a tick when closed.
class QueryStatusIcon extends StatelessWidget {
  const QueryStatusIcon({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    switch (status) {
      case 'open':
        return const Icon(Icons.help, color: AppTheme.warningColor);
      case 'answered':
        return const Icon(Icons.help, color: BrandColors.navy);
      default:
        return const Icon(Icons.check_circle_outline, color: Colors.grey);
    }
  }
}

class QueryThreadScreen extends StatefulWidget {
  const QueryThreadScreen({super.key, required this.queryId, this.repository});

  final String queryId;
  final QueriesRepository? repository;

  @override
  State<QueryThreadScreen> createState() => _QueryThreadScreenState();
}

class _QueryThreadScreenState extends State<QueryThreadScreen> {
  late final QueriesRepository _repo = widget.repository ?? QueriesRepository();
  final _replyController = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _replyController.dispose();
    super.dispose();
  }

  Future<void> _send(Future<void> Function() reload) async {
    final body = _replyController.text.trim();
    if (body.isEmpty) return;
    setState(() => _sending = true);
    final response = await _repo.reply(widget.queryId, body);
    if (!mounted) return;
    setState(() => _sending = false);
    if (!response.success) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(response.error ?? 'Could not send your reply')),
      );
      return;
    }
    _replyController.clear();
    await reload();
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final canReply = (user?.canReadQueries ?? false) && !(user?.isBillingReadOnly ?? false);
    return Scaffold(
      appBar: AppBar(title: const Text('Query')),
      body: LoadedList<QueryThread>(
        load: () => _repo.thread(widget.queryId),
        builder: (context, thread, reload) => [
          Text(thread.query.subject, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(
            [thread.query.statusLabel, ?thread.query.recordLabel].join(' · '),
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          for (final message in thread.messages) _MessageCard(message: message),
          const SizedBox(height: 8),
          if (thread.query.isClosed)
            const Text('This query is closed. Your accountant can reopen it.')
          else if (canReply) ...[
            TextField(
              controller: _replyController,
              decoration: const InputDecoration(labelText: 'Your reply'),
              minLines: 2,
              maxLines: 8,
              maxLength: 5000,
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: _sending ? null : () => _send(reload),
              child: Text(_sending ? 'Sending…' : 'Send reply'),
            ),
          ],
        ],
      ),
    );
  }
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({required this.message});

  final QueryMessage message;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${message.authorName} · ${DateUtils.formatDateTime(message.createdAt)}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 6),
            Text(message.body),
          ],
        ),
      ),
    );
  }
}
