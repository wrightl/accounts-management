import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../../data/models/user.dart';
import '../../../features/auth/auth_provider.dart';
import '../dashboard_provider.dart';
import '../widgets/attention_panel.dart';
import '../widgets/expense_mix.dart';
import '../widgets/hero_kpis.dart';
import '../widgets/horizontal_charts.dart';
import '../widgets/period_chips.dart';
import '../widgets/quote_to_cash_funnel.dart';
import '../widgets/series_charts.dart';
import '../widgets/spending_snapshot.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key, this.onOpenExpenses});

  final VoidCallback? onOpenExpenses;

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
    final user = context.watch<AuthProvider>().user;

    return Consumer<DashboardProvider>(
      builder: (context, provider, child) {
        if (provider.isLoading && provider.dashboardData == null) {
          return const Center(child: CircularProgressIndicator());
        }

        if (provider.error != null && provider.dashboardData == null) {
          return _MessageState(
            icon: Icons.error_outline,
            iconColor: BrandColors.destructive,
            message: provider.error!,
            actionLabel: 'Retry',
            onAction: _handleRefresh,
          );
        }

        final data = provider.dashboardData;
        if (data == null) {
          return const _MessageState(
            icon: Icons.insights_outlined,
            message: 'Dashboard metrics are unavailable.',
          );
        }

        if (data.isPending || user?.role == 'pending') {
          return _PendingState(user: user, firstName: data.firstName);
        }

        return RefreshIndicator(
          onRefresh: _handleRefresh,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (provider.isLoading)
                        const Padding(
                          padding: EdgeInsets.only(bottom: 12),
                          child: LinearProgressIndicator(minHeight: 2),
                        ),
                      _WelcomeHeader(
                        firstName: data.firstName.isNotEmpty
                            ? data.firstName
                            : user?.firstName ?? '',
                        todayLabel: data.todayLabel,
                      ),
                      const SizedBox(height: 16),
                      PeriodChips(
                        current: provider.period,
                        onSelected: provider.setPeriod,
                      ),
                      const SizedBox(height: 20),
                      HeroKpiGrid(heroes: data.heroes),
                      const SizedBox(height: 20),
                      CashVsInvoicedCard(data: data.cashSeries),
                      const SizedBox(height: 16),
                      QuoteToCashFunnelCard(
                        stages: data.funnel,
                        periodLabel: data.periodLabel,
                      ),
                      const SizedBox(height: 16),
                      AgedReceivablesCard(data: data.agedReceivables),
                      const SizedBox(height: 16),
                      IncomeExpenseCard(data: data.cashSeries),
                      const SizedBox(height: 16),
                      TopClientsCard(
                        clients: data.topClients,
                        periodLabel: data.periodLabel,
                      ),
                      const SizedBox(height: 16),
                      ExpenseMixCard(
                        slices: data.expenseMix,
                        periodLabel: data.periodLabel,
                      ),
                      const SizedBox(height: 16),
                      SpendingSnapshotCard(data: data.spending),
                      const SizedBox(height: 16),
                      AttentionPanelCard(
                        items: data.attention,
                        onOpenExpenses: widget.onOpenExpenses,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _WelcomeHeader extends StatelessWidget {
  const _WelcomeHeader({
    required this.firstName,
    required this.todayLabel,
  });

  final String firstName;
  final String todayLabel;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          firstName.isEmpty ? 'Welcome' : 'Welcome, $firstName',
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        const SizedBox(height: 4),
        Text(
          todayLabel,
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}

class _PendingState extends StatelessWidget {
  const _PendingState({required this.user, required this.firstName});

  final User? user;
  final String firstName;

  @override
  Widget build(BuildContext context) {
    final name = firstName.isNotEmpty ? firstName : user?.firstName ?? '';
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            name.isEmpty ? 'Welcome' : 'Welcome, $name',
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 12),
          Text(
            'Your account is waiting for an administrator to assign a role '
            '(admin, co-founder, or accountant). You cannot view or change '
            'the books until then.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: BrandColors.muted,
                ),
          ),
        ],
      ),
    );
  }
}

class _MessageState extends StatelessWidget {
  const _MessageState({
    required this.icon,
    required this.message,
    this.iconColor,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String message;
  final Color? iconColor;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 48, color: iconColor ?? BrandColors.muted),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 16),
              ElevatedButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}
