import 'dart:io';

import 'package:flutter/material.dart' hide DateUtils;
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';

import '../expense_provider.dart';
import '../../../data/models/expense.dart';
import '../../../core/utils/formatters.dart';

/// VAT rates offered when the company is VAT registered.
const _vatRates = [20, 5, 0];

class ExpenseCaptureScreen extends StatefulWidget {
  const ExpenseCaptureScreen({super.key});

  @override
  State<ExpenseCaptureScreen> createState() => _ExpenseCaptureScreenState();
}

class _ExpenseCaptureScreenState extends State<ExpenseCaptureScreen> {
  final _formKey = GlobalKey<FormState>();
  final _descriptionController = TextEditingController();
  final _amountController = TextEditingController();
  final _milesController = TextEditingController();
  final _rateController = TextEditingController();

  String _selectedCategory = 'Other';
  bool _categoryChosen = false;
  bool _useMileage = false;
  bool _readingReceipt = false;
  String? _receiptNote;
  DateTime _selectedDate = DateTime.now();
  String? _status;
  String? _paidByUserId;
  String? _clientId;
  String? _orderId;
  bool _billable = false;
  int? _vatRate;
  XFile? _capturedReceipt;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final options = await context.read<ExpenseProvider>().loadOptions();
      if (!mounted || options == null) return;
      setState(() {
        _vatRate ??= options.defaultVatRate;
        if (_rateController.text.isEmpty) {
          _rateController.text = '${options.defaultMileageRatePence}';
        }
      });
    });
  }

  @override
  void dispose() {
    _descriptionController.dispose();
    _amountController.dispose();
    _milesController.dispose();
    _rateController.dispose();
    super.dispose();
  }

  Future<void> _captureReceipt() async {
    final provider = context.read<ExpenseProvider>();
    final file = await provider.captureReceipt();

    if (file != null) {
      setState(() => _capturedReceipt = file);
      await _readReceipt(file);
    }
  }

  Future<void> _pickFromGallery() async {
    final provider = context.read<ExpenseProvider>();
    final file = await provider.pickReceiptFromGallery();

    if (file != null) {
      setState(() => _capturedReceipt = file);
      await _readReceipt(file);
    }
  }

  /// Fill in what the receipt shows, without overwriting anything typed, as
  /// the web form does.
  Future<void> _readReceipt(XFile file) async {
    setState(() {
      _readingReceipt = true;
      _receiptNote = null;
    });
    final provider = context.read<ExpenseProvider>();
    final extraction = await provider.readReceipt(file);
    if (!mounted) return;
    setState(() {
      _readingReceipt = false;
      if (extraction == null) {
        _receiptNote = provider.error ?? 'Could not read receipt';
        return;
      }
      if (extraction.description != null &&
          _descriptionController.text.trim().isEmpty) {
        _descriptionController.text = extraction.description!;
      }
      if (extraction.amountPounds != null &&
          _amountController.text.trim().isEmpty) {
        _amountController.text = extraction.amountPounds!;
      }
      // Only replace the date if it is still the default (today).
      final today = DateTime.now();
      final dateUntouched = _selectedDate.year == today.year &&
          _selectedDate.month == today.month &&
          _selectedDate.day == today.day;
      if (extraction.spentAt != null && dateUntouched) {
        _selectedDate = extraction.spentAt!;
      }
      final categories = provider.options?.categories ?? expenseCategories;
      if (extraction.category != null &&
          !_categoryChosen &&
          categories.contains(extraction.category)) {
        _selectedCategory = extraction.category!;
      }
      _receiptNote = extraction.isForeignCurrency
          ? '${extraction.summary}. This receipt looks like it is in '
                '${extraction.currency}: enter the amount in pounds.'
          : extraction.summary;
    });
  }

  int? get _mileagePence {
    final miles = double.tryParse(_milesController.text);
    final rate = int.tryParse(_rateController.text);
    if (miles == null || rate == null || miles <= 0 || rate <= 0) return null;
    return (miles * rate).round();
  }

  Future<void> _selectDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );

    if (picked != null) {
      setState(() => _selectedDate = picked);
    }
  }

  void _setStatus(String? status, ExpenseOptions? options) {
    setState(() {
      _status = status;
      if (status == 'company_paid') {
        _paidByUserId = null;
      } else if (status == 'reimbursable') {
        _paidByUserId ??= options?.defaultPayerId;
      }
    });
  }

  void _setClient(String? clientId, ExpenseOptions? options) {
    setState(() {
      _clientId = clientId;
      final order = options?.orders.where((o) => o.id == _orderId).firstOrNull;
      if (order != null && order.clientId != clientId) _orderId = null;
    });
  }

  void _setOrder(String? orderId, ExpenseOptions? options) {
    setState(() {
      _orderId = orderId;
      final order = options?.orders.where((o) => o.id == orderId).firstOrNull;
      if (order != null) _clientId = order.clientId;
    });
  }

  Future<void> _submitExpense() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    final amount = _useMileage
        ? (_mileagePence ?? 0) / 100
        : double.tryParse(_amountController.text);
    if (amount == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Invalid amount')));
      return;
    }

    final provider = context.read<ExpenseProvider>();
    final request = CreateExpenseRequest(
      description: _descriptionController.text,
      amountPence: CurrencyUtils.poundsToPence(amount),
      category: _selectedCategory,
      expenseDate: _selectedDate,
      status: _status!,
      paidByUserId: _status == 'company_paid' ? null : _paidByUserId,
      billable: _billable,
      clientId: _clientId,
      orderId: _orderId,
      vatRate: provider.options?.vatRegistered == true && !_useMileage
          ? (_vatRate ?? 0)
          : 0,
      mileageMiles: _useMileage ? num.tryParse(_milesController.text) : null,
      mileageRatePence: _useMileage ? int.tryParse(_rateController.text) : null,
    );

    final success = await provider.createExpense(request);

    if (!mounted) return;
    if (!success) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(provider.error ?? 'Could not save the expense')),
      );
      return;
    }

    final expenseId = provider.selectedExpense?.id;
    if (expenseId != null && _capturedReceipt != null) {
      await _uploadReceipt(expenseId);
    }

    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Expense saved')));
      Navigator.of(context).pop(true);
    }
  }

  Future<void> _uploadReceipt(String expenseId) async {
    if (_capturedReceipt == null) return;

    final provider = context.read<ExpenseProvider>();
    final success = await provider.uploadReceipt(expenseId, _capturedReceipt!);

    if (mounted && !success) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(provider.error ?? 'Failed to upload receipt')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Capture expense')),
      body: Consumer<ExpenseProvider>(
        builder: (context, provider, child) {
          final options = provider.options;
          final categories = options?.categories ?? expenseCategories;
          final orders = (options?.orders ?? const <ExpenseOrderChoice>[])
              .where((o) => _clientId == null || o.clientId == _clientId)
              .toList();
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (_capturedReceipt != null) ...[
                    Stack(
                      children: [
                        Container(
                          height: 200,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12),
                            image: DecorationImage(
                              image: FileImage(File(_capturedReceipt!.path)),
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                        Positioned(
                          top: 8,
                          right: 8,
                          child: IconButton(
                            onPressed: () =>
                                setState(() => _capturedReceipt = null),
                            icon: const Icon(Icons.close),
                            style: IconButton.styleFrom(
                              backgroundColor: Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                  ] else ...[
                    Container(
                      height: 150,
                      decoration: BoxDecoration(
                        color: Colors.grey[100],
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.grey[300]!),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.receipt_long,
                            size: 48,
                            color: Colors.grey[400],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'No receipt captured',
                            style: TextStyle(color: Colors.grey[600]),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: _captureReceipt,
                            icon: const Icon(Icons.camera_alt),
                            label: const Text('Take photo'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _pickFromGallery,
                            icon: const Icon(Icons.photo_library),
                            label: const Text('Gallery'),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                  ],
                  if (_readingReceipt || _receiptNote != null) ...[
                    Row(
                      children: [
                        if (_readingReceipt) ...[
                          const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                          const SizedBox(width: 8),
                        ],
                        Expanded(
                          child: Text(
                            _readingReceipt
                                ? 'Reading receipt…'
                                : _receiptNote!,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                  ],
                  TextFormField(
                    controller: _descriptionController,
                    decoration: const InputDecoration(
                      labelText: 'Description',
                      prefixIcon: Icon(Icons.description),
                    ),
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return 'Enter a description';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Log as mileage allowance'),
                    value: _useMileage,
                    onChanged: (value) => setState(() => _useMileage = value),
                  ),
                  if (_useMileage) ...[
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _milesController,
                            decoration: const InputDecoration(
                              labelText: 'Miles',
                            ),
                            keyboardType: const TextInputType.numberWithOptions(
                              decimal: true,
                            ),
                            onChanged: (_) => setState(() {}),
                            validator: (value) =>
                                (double.tryParse(value ?? '') ?? 0) <= 0
                                ? 'Enter a positive number of miles'
                                : null,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextFormField(
                            controller: _rateController,
                            decoration: const InputDecoration(
                              labelText: 'Rate (pence per mile)',
                            ),
                            keyboardType: TextInputType.number,
                            onChanged: (_) => setState(() {}),
                            validator: (value) =>
                                (int.tryParse(value ?? '') ?? 0) <= 0
                                ? 'Enter a positive mileage rate'
                                : null,
                          ),
                        ),
                      ],
                    ),
                    if (_mileagePence != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        'Calculated amount: ${CurrencyUtils.formatPence(_mileagePence!)}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ] else
                    TextFormField(
                      controller: _amountController,
                      decoration: const InputDecoration(
                        labelText: 'Amount (£)',
                        prefixIcon: Icon(Icons.currency_pound),
                      ),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Enter an amount';
                        }
                        if (!ValidationUtils.isValidAmount(value)) {
                          return 'Invalid amount';
                        }
                        return null;
                      },
                    ),
                  if (options?.vatRegistered == true && !_useMileage) ...[
                    const SizedBox(height: 16),
                    DropdownButtonFormField<int>(
                      initialValue: _vatRates.contains(_vatRate) ? _vatRate : 0,
                      decoration: const InputDecoration(
                        labelText: 'VAT rate',
                        prefixIcon: Icon(Icons.percent),
                        helperText: 'The amount includes VAT at this rate.',
                      ),
                      items: _vatRates
                          .map(
                            (rate) => DropdownMenuItem(
                              value: rate,
                              child: Text('$rate%'),
                            ),
                          )
                          .toList(),
                      onChanged: (value) => setState(() => _vatRate = value),
                    ),
                  ],
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    key: ValueKey('category-$_selectedCategory'),
                    initialValue: categories.contains(_selectedCategory)
                        ? _selectedCategory
                        : categories.last,
                    decoration: const InputDecoration(
                      labelText: 'Category',
                      prefixIcon: Icon(Icons.category),
                    ),
                    items: categories.map((category) {
                      return DropdownMenuItem(
                        value: category,
                        child: Text(category),
                      );
                    }).toList(),
                    onChanged: (value) {
                      if (value != null) {
                        setState(() {
                          _selectedCategory = value;
                          _categoryChosen = true;
                        });
                      }
                    },
                  ),
                  const SizedBox(height: 16),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.calendar_today),
                    title: const Text('Date'),
                    subtitle: Text(DateUtils.formatDate(_selectedDate)),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: _selectDate,
                  ),
                  const SizedBox(height: 16),
                  ExpensePaymentFields(
                    status: _status,
                    paidByUserId: _paidByUserId,
                    payers: options?.payers ?? const [],
                    onStatusChanged: (value) => _setStatus(value, options),
                    onPaidByChanged: (value) =>
                        setState(() => _paidByUserId = value),
                  ),
                  if (options != null && options.clients.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String?>(
                      key: ValueKey('client-$_clientId'),
                      initialValue: _clientId,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Client',
                        prefixIcon: Icon(Icons.business),
                        helperText: 'Tag a cost to a client or order to see the margin on that work.',
                      ),
                      items: [
                        const DropdownMenuItem<String?>(
                          value: null,
                          child: Text('No client'),
                        ),
                        for (final client in options.clients)
                          DropdownMenuItem<String?>(
                            value: client.id,
                            child: Text(
                              client.name,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                      onChanged: (value) => _setClient(value, options),
                      validator: (value) => _billable && value == null
                          ? 'Choose the client to recharge'
                          : null,
                    ),
                    if (orders.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      DropdownButtonFormField<String?>(
                        key: ValueKey('order-$_orderId-$_clientId'),
                        initialValue: _orderId,
                        isExpanded: true,
                        decoration: const InputDecoration(
                          labelText: 'Order',
                          prefixIcon: Icon(Icons.assignment_outlined),
                        ),
                        items: [
                          const DropdownMenuItem<String?>(
                            value: null,
                            child: Text('No order'),
                          ),
                          for (final order in orders)
                            DropdownMenuItem<String?>(
                              value: order.id,
                              child: Text(
                                '${order.number} · ${order.clientName}',
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                        ],
                        onChanged: (value) => _setOrder(value, options),
                      ),
                    ],
                    const SizedBox(height: 8),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Rebillable'),
                      subtitle: const Text(
                        'Recharge this to the client on their next invoice.',
                      ),
                      value: _billable,
                      onChanged: (value) => setState(() => _billable = value),
                    ),
                  ],
                  const SizedBox(height: 24),
                  if (provider.isUploading) ...[
                    LinearProgressIndicator(value: provider.uploadProgress),
                    const SizedBox(height: 8),
                    Text(
                      'Uploading receipt... ${(provider.uploadProgress * 100).toInt()}%',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 16),
                  ],
                  ElevatedButton(
                    onPressed:
                        provider.isLoading ||
                            provider.isUploading ||
                            _readingReceipt
                        ? null
                        : _submitExpense,
                    child: provider.isLoading
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Save expense'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// "How was it paid?" and "Paid by", shared by capture and approve so both
/// ask what the web form asks.
class ExpensePaymentFields extends StatelessWidget {
  const ExpensePaymentFields({
    super.key,
    required this.status,
    required this.paidByUserId,
    required this.payers,
    required this.onStatusChanged,
    required this.onPaidByChanged,
  });

  final String? status;
  final String? paidByUserId;
  final List<ExpenseChoice> payers;
  final ValueChanged<String?> onStatusChanged;
  final ValueChanged<String?> onPaidByChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DropdownButtonFormField<String>(
          initialValue: status,
          decoration: const InputDecoration(
            labelText: 'Status',
            prefixIcon: Icon(Icons.account_balance_wallet_outlined),
            helperText: 'Reimbursable = you paid personally; the company owes you back.',
            helperMaxLines: 2,
          ),
          hint: const Text('Select status…'),
          items: [
            for (final value in expensePaymentStatuses)
              DropdownMenuItem(
                value: value,
                child: Text(expenseStatusLabel(value)),
              ),
          ],
          onChanged: onStatusChanged,
          validator: (value) => value == null ? 'Select a status' : null,
        ),
        if (status != 'company_paid' && payers.isNotEmpty) ...[
          const SizedBox(height: 16),
          DropdownButtonFormField<String?>(
            key: ValueKey('payer-$status-$paidByUserId'),
            initialValue: paidByUserId,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Paid by',
              prefixIcon: Icon(Icons.person_outline),
            ),
            hint: const Text('Select founder…'),
            items: [
              for (final payer in payers)
                DropdownMenuItem<String?>(
                  value: payer.id,
                  child: Text(payer.name, overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: onPaidByChanged,
            validator: (value) => status == 'reimbursable' && value == null
                ? 'Select who paid for reimbursable expenses'
                : null,
          ),
        ],
      ],
    );
  }
}
