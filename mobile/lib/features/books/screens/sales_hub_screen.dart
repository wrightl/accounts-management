import 'package:flutter/material.dart';
import 'record_list_screen.dart';

class SalesHubScreen extends StatelessWidget {
  const SalesHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Sales'),
          bottom: const TabBar(
            isScrollable: true,
            tabs: [
              Tab(text: 'Invoices'),
              Tab(text: 'Quotes'),
              Tab(text: 'Orders'),
              Tab(text: 'Clients'),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            RecordListScreen(
              resource: 'invoices',
              title: 'Invoices',
              embedded: true,
            ),
            RecordListScreen(
              resource: 'quotes',
              title: 'Quotes',
              embedded: true,
            ),
            RecordListScreen(
              resource: 'orders',
              title: 'Orders',
              embedded: true,
            ),
            RecordListScreen(
              resource: 'clients',
              title: 'Clients',
              embedded: true,
            ),
          ],
        ),
      ),
    );
  }
}
