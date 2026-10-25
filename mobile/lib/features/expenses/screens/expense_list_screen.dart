import 'package:flutter/material.dart' hide DateUtils;
import 'package:provider/provider.dart';
import '../expense_provider.dart';
import '../../auth/auth_provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../data/models/expense.dart';
import 'expense_capture_screen.dart' show ExpensePaymentFields;

class ExpenseListScreen extends StatefulWidget {
  const ExpenseListScreen({super.key});

  @override
  State<ExpenseListScreen> createState() => _ExpenseListScreenState();
}

class _ExpenseListScreenState extends State<ExpenseListScreen> {
  String _selectedFilter = 'all';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadExpenses();
    });
  }

  Future<void> _loadExpenses() async {
    final status = _selectedFilter == 'all' ? null : _selectedFilter;
    await context.read<ExpenseProvider>().loadExpenses(status: status);
  }

  /// Capture and review need write access and an editable plan, as on the web.
  bool _canWrite(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    return user != null && user.canWriteAccounts && !user.isBillingReadOnly;
  }

  @override
  Widget build(BuildContext context) {
    final canWrite = _canWrite(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Expenses'),
        actions: [
          PopupMenuButton<String>(
            initialValue: _selectedFilter,
            onSelected: (value) {
              setState(() => _selectedFilter = value);
              _loadExpenses();
            },
            itemBuilder: (context) => [
              const PopupMenuItem(value: 'all', child: Text('All')),
              for (final status in expenseStatuses)
                PopupMenuItem(
                  value: status,
                  child: Text(expenseStatusLabel(status)),
                ),
            ],
          ),
        ],
      ),
      body: Consumer<ExpenseProvider>(
        builder: (context, provider, child) {
          if (provider.isLoading && provider.expenses.isEmpty) {
            return const Center(child: CircularProgressIndicator());
          }

          if (provider.error != null && provider.expenses.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, size: 48, color: Colors.red),
                  const SizedBox(height: 16),
                  Text(provider.error!),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: _loadExpenses,
                    child: const Text('Retry'),
                  ),
                ],
              ),
            );
          }

          if (provider.expenses.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.receipt_long, size: 64, color: Colors.grey),
                  const SizedBox(height: 16),
                  Text(
                    'No expenses found',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  if (canWrite) ...[
                    const SizedBox(height: 24),
                    ElevatedButton.icon(
                      onPressed: () => Navigator.pushNamed(context, '/expenses/capture'),
                      icon: const Icon(Icons.add),
                      label: const Text('Add expense'),
                    ),
                  ],
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: _loadExpenses,
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: provider.expenses.length,
              itemBuilder: (context, index) {
                final expense = provider.expenses[index];
                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: _getStatusColor(expense.status),
                      child: const Icon(Icons.receipt, color: Colors.white, size: 20),
                    ),
                    title: Text(expense.description),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 4),
                        Text(expense.category),
                        Text(
                          DateUtils.formatDate(expense.expenseDate),
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          CurrencyUtils.formatPence(expense.amountPence),
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                        ),
                        const SizedBox(height: 4),
                        _buildStatusChip(expense.status),
                      ],
                    ),
                    onTap: () => _showExpenseDetail(expense, canWrite: canWrite),
                  ),
                );
              },
            ),
          );
        },
      ),
      floatingActionButton: !canWrite
          ? null
          : FloatingActionButton.extended(
              onPressed: () => Navigator.pushNamed(context, '/expenses/capture'),
              icon: const Icon(Icons.camera_alt),
              label: const Text('Capture'),
            ),
    );
  }

  Widget _buildStatusChip(String status) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: _getStatusColor(status).withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        expenseStatusLabel(status),
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.bold,
          color: _getStatusColor(status),
        ),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'pending':
        return Colors.orange;
      case 'recorded':
        return Colors.blue;
      case 'reimbursable':
        return Colors.purple;
      case 'reimbursed':
        return Colors.green;
      case 'company_paid':
        return Colors.teal;
      default:
        return Colors.grey;
    }
  }

  void _showExpenseDetail(Expense expense, {required bool canWrite}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        maxChildSize: 0.95,
        minChildSize: 0.5,
        expand: false,
        builder: (context, scrollController) {
          return SingleChildScrollView(
            controller: scrollController,
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Expense details',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                _buildDetailRow('Description', expense.description),
                _buildDetailRow('Amount', CurrencyUtils.formatPence(expense.amountPence)),
                _buildDetailRow('Category', expense.category),
                _buildDetailRow('Date', DateUtils.formatDate(expense.expenseDate)),
                _buildDetailRow('Status', expense.statusLabel),
                if (expense.paidByName != null)
                  _buildDetailRow('Paid by', expense.paidByName!),
                if (expense.clientName != null)
                  _buildDetailRow(
                    'Client',
                    expense.billable
                        ? '${expense.clientName!} (rebillable)'
                        : expense.clientName!,
                  ),
                if (expense.vatRate > 0)
                  _buildDetailRow('VAT rate', '${expense.vatRate}%'),
                if (expense.createdByName != null)
                  _buildDetailRow('Created by', expense.createdByName!),
                const SizedBox(height: 24),
                if (expense.isPending && canWrite) ...[
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => _handleReject(expense.id),
                          icon: const Icon(Icons.close),
                          label: const Text('Reject'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.red,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: () => _handleApprove(expense),
                          icon: const Icon(Icons.check),
                          label: const Text('Approve'),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        ],
      ),
    );
  }

  Future<void> _handleApprove(Expense expense) async {
    Navigator.pop(context);
    final provider = context.read<ExpenseProvider>();
    final options = provider.options ?? await provider.loadOptions();
    if (!mounted) return;

    final choice = await showModalBottomSheet<_ApproveChoice>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _ApproveSheet(
        expense: expense,
        payers: options?.payers ?? const [],
        defaultPayerId: options?.defaultPayerId,
      ),
    );
    if (choice == null || !mounted) return;

    final success = await provider.approveExpense(
      expense.id,
      approvalType: choice.status,
      paidByUserId: choice.paidByUserId,
    );

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(success ? 'Expense approved' : provider.error ?? 'Failed to approve'),
        ),
      );
    }
  }

  Future<void> _handleReject(String id) async {
    Navigator.pop(context);
    final provider = context.read<ExpenseProvider>();
    final success = await provider.rejectExpense(id);

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(success ? 'Expense discarded' : provider.error ?? 'Failed to reject'),
        ),
      );
    }
  }
}

class _ApproveChoice {
  const _ApproveChoice(this.status, this.paidByUserId);

  final String status;
  final String? paidByUserId;
}

/// Asks what the web review asks before approving: the final status and payer.
class _ApproveSheet extends StatefulWidget {
  const _ApproveSheet({
    required this.expense,
    required this.payers,
    this.defaultPayerId,
  });

  final Expense expense;
  final List<ExpenseChoice> payers;
  final String? defaultPayerId;

  @override
  State<_ApproveSheet> createState() => _ApproveSheetState();
}

class _ApproveSheetState extends State<_ApproveSheet> {
  final _formKey = GlobalKey<FormState>();
  String? _status;
  String? _paidByUserId;

  @override
  void initState() {
    super.initState();
    _paidByUserId = widget.expense.paidByUserId;
    // Start from the server's suggestion; the reviewer can still change it.
    final suggested = widget.expense.paymentSource?.suggestedStatus;
    if (suggested != null) {
      _status = suggested;
      if (suggested == 'company_paid') {
        _paidByUserId = null;
      } else {
        _paidByUserId ??= widget.defaultPayerId;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        24,
        24,
        24,
        24 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Approve expense',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 4),
            Text(
              '${widget.expense.description} · '
              '${CurrencyUtils.formatPence(widget.expense.amountPence)}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (widget.expense.receipts.isEmpty) ...[
              const SizedBox(height: 12),
              const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.warning_amber_rounded,
                    color: AppTheme.warningColor,
                    size: 20,
                  ),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'No receipt attached. You may need one to claim VAT '
                      'or to back up the cost if HMRC asks.',
                    ),
                  ),
                ],
              ),
            ],
            if (widget.expense.paymentSource case final source?
                when source.notes.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                source.conflict
                    ? 'The clues about how this was paid disagree:'
                    : 'How it was paid:',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              for (final note in source.notes)
                Text('• $note', style: Theme.of(context).textTheme.bodySmall),
            ],
            const SizedBox(height: 16),
            ExpensePaymentFields(
              status: _status,
              paidByUserId: _paidByUserId,
              payers: widget.payers,
              onStatusChanged: (value) => setState(() {
                _status = value;
                if (value == 'company_paid') {
                  _paidByUserId = null;
                } else if (value == 'reimbursable') {
                  _paidByUserId ??= widget.defaultPayerId;
                }
              }),
              onPaidByChanged: (value) => setState(() => _paidByUserId = value),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () {
                if (!_formKey.currentState!.validate()) return;
                Navigator.pop(
                  context,
                  _ApproveChoice(
                    _status!,
                    _status == 'company_paid' ? null : _paidByUserId,
                  ),
                );
              },
              child: const Text('Approve'),
            ),
          ],
        ),
      ),
    );
  }
}
