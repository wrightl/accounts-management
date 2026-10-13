import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../auth/auth_provider.dart';
import 'record_list_screen.dart';

class SalesHubScreen extends StatelessWidget {
  const SalesHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    bool shows(String feature) => user?.showsFeature(feature) ?? false;
    // Hide the pages this person hid from their web menu.
    final tabs = <(String, String)>[
      ('invoices', 'Invoices'),
      if (shows('quotes')) ('quotes', 'Quotes'),
      if (shows('orders')) ('orders', 'Orders'),
      ('clients', 'Clients'),
    ];

    return DefaultTabController(
      // Rebuild the controller when the tab count changes.
      key: ValueKey(tabs.length),
      length: tabs.length,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Sales'),
          bottom: TabBar(
            isScrollable: true,
            tabs: [for (final tab in tabs) Tab(text: tab.$2)],
          ),
        ),
        body: TabBarView(
          children: [
            for (final tab in tabs)
              RecordListScreen(
                resource: tab.$1,
                title: tab.$2,
                embedded: true,
              ),
          ],
        ),
      ),
    );
  }
}
