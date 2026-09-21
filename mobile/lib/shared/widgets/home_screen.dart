import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:clerk_flutter/clerk_flutter.dart';
import '../../features/dashboard/screens/dashboard_screen.dart';
import '../../features/expenses/screens/expense_list_screen.dart';
import '../../features/books/screens/sales_hub_screen.dart';
import '../../features/books/screens/more_screen.dart';
import '../../features/auth/auth_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/constants/app_constants.dart';
import 'package:provider/provider.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _selectedIndex = 0;
  final _scaffoldKey = GlobalKey<ScaffoldState>();

  void _onItemTapped(int index) {
    setState(() => _selectedIndex = index);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final banner = auth.user?.billing?.bannerMessage;

    return Scaffold(
      key: _scaffoldKey,
      appBar: _selectedIndex == 0
          ? AppBar(
              title: const Text('Alfa'),
              actions: [
                IconButton(
                  icon: const Icon(Icons.account_circle_outlined),
                  onPressed: () => _scaffoldKey.currentState?.openDrawer(),
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
                      onPressed: () async {
                        await Clipboard.setData(
                          ClipboardData(text: AppConstants.webBillingUrl),
                        );
                        if (!context.mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text(
                              'Billing link copied — open it on the web to manage your plan.',
                            ),
                          ),
                        );
                      },
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
                  onOpenExpenses: () => _onItemTapped(2),
                ),
                const SalesHubScreen(),
                const ExpenseListScreen(),
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
            icon: Icon(Icons.request_quote_outlined),
            selectedIcon: Icon(Icons.request_quote),
            label: 'Sales',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long),
            label: 'Expenses',
          ),
          NavigationDestination(
            icon: Icon(Icons.more_horiz),
            selectedIcon: Icon(Icons.more_horiz),
            label: 'More',
          ),
        ],
      ),
      drawer: Drawer(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            Consumer<AuthProvider>(
              builder: (context, authProvider, child) {
                final user = authProvider.user;
                return UserAccountsDrawerHeader(
                  decoration: const BoxDecoration(color: BrandColors.navy),
                  accountName: Text(user?.name ?? 'User'),
                  accountEmail: Text(user?.email ?? ''),
                  currentAccountPicture: CircleAvatar(
                    backgroundColor: BrandColors.wash,
                    child: Text(
                      _initial(user?.name),
                      style: const TextStyle(
                        fontSize: 32,
                        color: BrandColors.navy,
                      ),
                    ),
                  ),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.dashboard_outlined),
              title: const Text('Overview'),
              selected: _selectedIndex == 0,
              onTap: () {
                _onItemTapped(0);
                Navigator.pop(context);
              },
            ),
            ListTile(
              leading: const Icon(Icons.request_quote_outlined),
              title: const Text('Sales'),
              selected: _selectedIndex == 1,
              onTap: () {
                _onItemTapped(1);
                Navigator.pop(context);
              },
            ),
            ListTile(
              leading: const Icon(Icons.receipt_long_outlined),
              title: const Text('Expenses'),
              selected: _selectedIndex == 2,
              onTap: () {
                _onItemTapped(2);
                Navigator.pop(context);
              },
            ),
            ListTile(
              leading: const Icon(Icons.more_horiz),
              title: const Text('More'),
              selected: _selectedIndex == 3,
              onTap: () {
                _onItemTapped(3);
                Navigator.pop(context);
              },
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.logout),
              title: const Text('Sign Out'),
              onTap: () async {
                Navigator.pop(context);
                await ClerkAuth.of(context, listen: false).signOut();
                if (context.mounted) {
                  await context.read<AuthProvider>().logout();
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}

String _initial(String? name) {
  final trimmed = name?.trim() ?? '';
  if (trimmed.isEmpty) return 'U';
  return trimmed.substring(0, 1).toUpperCase();
}
