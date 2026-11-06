import 'package:flutter/material.dart';
import '../../features/dashboard/screens/dashboard_screen.dart';
import '../../features/expenses/screens/expense_list_screen.dart';
import '../../features/books/screens/sales_hub_screen.dart';
import '../../features/books/screens/more_screen.dart';
import '../../features/auth/auth_provider.dart';
import '../../core/security/app_lock.dart';
import '../../core/widget/home_widget_sync.dart';
import '../../features/dashboard/dashboard_provider.dart';
import '../../features/expenses/expense_provider.dart';
import '../../features/notifications/notification_provider.dart';
import '../../features/notifications/screens/inbox_screen.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/web_links.dart';
import 'package:provider/provider.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  int _selectedIndex = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<NotificationProvider>().refreshUnread();
      context.read<ExpenseProvider>().sendQueued();
      _dashboard = context.read<DashboardProvider>()..addListener(_syncWidget);
      _lock = context.read<AppLock?>()?..addListener(_syncWidget);
      _syncWidget();
    });
  }

  DashboardProvider? _dashboard;
  AppLock? _lock;

  /// The home-screen widget follows the Overview, and shows nothing while
  /// the app lock is on.
  void _syncWidget() {
    final data = _dashboard?.dashboardData;
    final hidden = _lock?.enabled ?? false;
    if (hidden) {
      HomeWidgetSync.instance.clear();
    } else if (data != null && !data.isPending) {
      HomeWidgetSync.instance.publish(data, hidden: false);
    }
  }

  @override
  void dispose() {
    _dashboard?.removeListener(_syncWidget);
    _lock?.removeListener(_syncWidget);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      context.read<NotificationProvider>().refreshUnread();
      // Back in signal, perhaps: send expenses saved offline.
      context.read<ExpenseProvider>().sendQueued();
    }
  }

  void _onItemTapped(int index) {
    setState(() => _selectedIndex = index);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final notifications = context.watch<NotificationProvider>();
    final banner = auth.user?.billing?.bannerMessage;

    return Scaffold(
      appBar: _selectedIndex == 0
          ? AppBar(
              title: const Text('Alfa'),
              actions: [
                IconButton(
                  icon: Badge(
                    isLabelVisible: notifications.unreadCount > 0,
                    label: Text(
                      notifications.unreadCount > 99
                          ? '99+'
                          : '${notifications.unreadCount}',
                    ),
                    child: const Icon(Icons.notifications_outlined),
                  ),
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const InboxScreen(),
                      ),
                    );
                  },
                ),
              ],
            )
          : null,
      body: Column(
        children: [
          if (banner != null)
            Material(
              color: auth.user?.isBillingReadOnly == true
                  ? const Color(0xFFFEE2E2)
                  : const Color(0xFFFEF3C7),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        banner,
                        style: TextStyle(
                          fontSize: 13,
                          color: auth.user?.isBillingReadOnly == true
                              ? const Color(0xFF7F1D1D)
                              : const Color(0xFF78350F),
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () => openOnWeb(context, '/settings/billing'),
                      child: const Text('Billing'),
                    ),
                  ],
                ),
              ),
            ),
          Expanded(
            child: IndexedStack(
              index: _selectedIndex,
              children: [
                DashboardScreen(
                  onOpenExpenses: () => _onItemTapped(1),
                ),
                const ExpenseListScreen(),
                const SalesHubScreen(),
                const MoreScreen(),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: _onItemTapped,
        indicatorColor: BrandColors.wash,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Overview',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long),
            label: 'Expenses',
          ),
          NavigationDestination(
            icon: Icon(Icons.request_quote_outlined),
            selectedIcon: Icon(Icons.request_quote),
            label: 'Sales',
          ),
          NavigationDestination(
            icon: Icon(Icons.more_horiz),
            selectedIcon: Icon(Icons.more_horiz),
            label: 'More',
          ),
        ],
      ),
    );
  }
}
