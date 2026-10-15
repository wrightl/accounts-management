import 'package:flutter/material.dart';
import '../../features/dashboard/screens/dashboard_screen.dart';
import '../../features/expenses/screens/expense_list_screen.dart';
import '../../features/books/screens/sales_hub_screen.dart';
import '../../features/books/screens/more_screen.dart';
import '../../features/auth/auth_provider.dart';
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
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      context.read<NotificationProvider>().refreshUnread();
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
