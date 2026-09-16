import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../dashboard_provider.dart';
import '../../../core/utils/formatters.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DashboardProvider>().loadDashboard();
    });
  }

  Future<void> _handleRefresh() async {
    await context.read<DashboardProvider>().refresh();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.account_circle),
            onPressed: () => Navigator.pushNamed(context, '/profile'),
          ),
        ],
      ),
      body: Consumer<DashboardProvider>(
        builder: (context, provider, child) {
          if (provider.isLoading && provider.dashboardData == null) {
            return const Center(child: CircularProgressIndicator());
          }

          if (provider.error != null && provider.dashboardData == null) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, size: 48, color: Colors.red),
                  const SizedBox(height: 16),
                  Text(provider.error!),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: _handleRefresh,
                    child: const Text('Retry'),
                  ),
                ],
              ),
            );
          }

          final data = provider.dashboardData;
          if (data == null) {
            return const Center(child: Text('No data available'));
          }

          return RefreshIndicator(
            onRefresh: _handleRefresh,
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildKpiSection(data.kpis),
                  const SizedBox(height: 24),
                  _buildAttentionSection(data.attentionItems),
                  const SizedBox(height: 24),
                  _buildRecentActivitySection(data.recentActivity),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildKpiSection(kpis) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Overview',
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: _buildKpiCard(
                'Total Revenue',
                CurrencyUtils.formatPence(kpis.totalRevenuePence),
                Icons.trending_up,
                Colors.green,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildKpiCard(
                'Outstanding',
                CurrencyUtils.formatPence(kpis.outstandingPence),
                Icons.payment,
                Colors.orange,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _buildKpiCard(
                'Expenses',
                CurrencyUtils.formatPence(kpis.expensesThisMonthPence),
                Icons.receipt_long,
                Colors.blue,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildKpiCard(
                'Pending',
                '${kpis.pendingExpensesCount}',
                Icons.pending_actions,
                Colors.purple,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildKpiCard(String label, String value, IconData icon, Color color) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 20, color: color),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    label,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              value,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAttentionSection(List attentionItems) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Needs Attention',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            if (attentionItems.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.red,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '${attentionItems.length}',
                  style: const TextStyle(color: Colors.white, fontSize: 12),
                ),
              ),
          ],
        ),
        const SizedBox(height: 16),
        if (attentionItems.isEmpty)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Center(
                child: Column(
                  children: [
                    Icon(Icons.check_circle_outline, size: 48, color: Colors.green),
                    SizedBox(height: 8),
                    Text('All caught up!'),
                  ],
                ),
              ),
            ),
          )
        else
          ...attentionItems.map((item) => Card(
                child: ListTile(
                  leading: Icon(
                    _getIconForType(item.type),
                    color: item.isHighPriority ? Colors.red : Colors.orange,
                  ),
                  title: Text(item.title),
                  subtitle: Text(item.description),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _handleAttentionItemTap(item),
                ),
              )),
      ],
    );
  }

  Widget _buildRecentActivitySection(recentActivity) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Recent Activity',
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                _buildActivityRow(
                  'Expenses',
                  recentActivity.recentExpensesCount,
                  Icons.receipt_long,
                ),
                const Divider(),
                _buildActivityRow(
                  'Invoices',
                  recentActivity.recentInvoicesCount,
                  Icons.description,
                ),
                const Divider(),
                _buildActivityRow(
                  'Quotes',
                  recentActivity.recentQuotesCount,
                  Icons.request_quote,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildActivityRow(String label, int count, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 20),
        const SizedBox(width: 12),
        Text(label, style: Theme.of(context).textTheme.bodyMedium),
        const Spacer(),
        Text(
          '$count',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
        ),
      ],
    );
  }

  IconData _getIconForType(String type) {
    switch (type) {
      case 'expense':
        return Icons.receipt_long;
      case 'invoice':
        return Icons.description;
      case 'quote':
        return Icons.request_quote;
      default:
        return Icons.notification_important;
    }
  }

  void _handleAttentionItemTap(item) {
    if (item.type == 'expense') {
      Navigator.pushNamed(context, '/expenses');
    }
  }
}
