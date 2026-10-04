import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/app_theme.dart';
import '../notification_provider.dart';
import 'notification_detail_screen.dart';

class InboxScreen extends StatefulWidget {
  const InboxScreen({super.key});

  @override
  State<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<InboxScreen> {
  String _filter = 'all';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<NotificationProvider>().load(filter: _filter);
    });
  }

  Future<void> _reload() async {
    await context.read<NotificationProvider>().load(filter: _filter);
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<NotificationProvider>();
    final fmt = DateFormat('d MMM · HH:mm');

    return Scaffold(
      appBar: AppBar(
        title: const Text('Inbox'),
        actions: [
          if (provider.unreadCount > 0)
            TextButton(
              onPressed: () async {
                await provider.markAllRead();
              },
              child: const Text('Mark all read'),
            ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'all', label: Text('All')),
                ButtonSegment(value: 'unread', label: Text('Unread')),
              ],
              selected: {_filter},
              onSelectionChanged: (next) {
                setState(() => _filter = next.first);
                provider.load(filter: _filter);
              },
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _reload,
              child: provider.loading && provider.items.isEmpty
                  ? const Center(child: CircularProgressIndicator())
                  : provider.items.isEmpty
                      ? ListView(
                          children: [
                            const SizedBox(height: 80),
                            Icon(
                              Icons.notifications_none,
                              size: 48,
                              color: Colors.grey.shade400,
                            ),
                            const SizedBox(height: 12),
                            Text(
                              _filter == 'unread'
                                  ? 'No unread notifications'
                                  : 'No notifications yet',
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Colors.grey.shade600),
                            ),
                          ],
                        )
                      : ListView.separated(
                          itemCount: provider.items.length,
                          separatorBuilder: (_, _) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            final n = provider.items[index];
                            return Dismissible(
                              key: ValueKey(n.id),
                              direction: DismissDirection.endToStart,
                              background: Container(
                                color: Colors.red.shade700,
                                alignment: Alignment.centerRight,
                                padding: const EdgeInsets.only(right: 20),
                                child: const Icon(
                                  Icons.delete,
                                  color: Colors.white,
                                ),
                              ),
                              onDismissed: (_) => provider.delete(n.id),
                              child: ListTile(
                                leading: n.isUnread
                                    ? const Icon(
                                        Icons.circle,
                                        size: 10,
                                        color: BrandColors.pink,
                                      )
                                    : const SizedBox(width: 10),
                                title: Text(
                                  n.title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontWeight: n.isUnread
                                        ? FontWeight.w600
                                        : FontWeight.w400,
                                  ),
                                ),
                                subtitle: Text(
                                  '${n.body}\n${fmt.format(n.createdAt.toLocal())}',
                                  maxLines: 3,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                isThreeLine: true,
                                onTap: () async {
                                  await provider.markRead(n.id);
                                  if (!context.mounted) return;
                                  await Navigator.of(context).push(
                                    MaterialPageRoute<void>(
                                      builder: (_) =>
                                          NotificationDetailScreen(notification: n),
                                    ),
                                  );
                                },
                              ),
                            );
                          },
                        ),
            ),
          ),
        ],
      ),
    );
  }
}
