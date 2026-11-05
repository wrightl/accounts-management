import 'package:flutter/material.dart' hide DateUtils;
import 'package:provider/provider.dart';

import '../../../core/utils/formatters.dart';
import '../../../data/models/books.dart';
import '../books_provider.dart';

/// Record money received against an invoice. The amount owed is filled in;
/// the server refuses more than that, as on the web. Matching the payment to
/// a bank row is left to the web.
class RecordPaymentSheet extends StatefulWidget {
  const RecordPaymentSheet({super.key, required this.invoice});

  final BookRecord invoice;

  @override
  State<RecordPaymentSheet> createState() => _RecordPaymentSheetState();
}

class _RecordPaymentSheetState extends State<RecordPaymentSheet> {
  final _formKey = GlobalKey<FormState>();
  late final _amountController = TextEditingController(
    text: ((widget.invoice.amountDuePence ?? 0) / 100).toStringAsFixed(2),
  );
  DateTime _receivedAt = DateTime.now();
  bool _saving = false;

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _receivedAt,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _receivedAt = picked);
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final amount = double.parse(_amountController.text.trim());
    setState(() => _saving = true);
    final result = await context.read<BooksProvider>().recordPayment(
          widget.invoice.id,
          amountPence: CurrencyUtils.poundsToPence(amount),
          receivedAt: _receivedAt,
        );
    if (!mounted) return;
    setState(() => _saving = false);
    if (result.success) {
      Navigator.of(context).pop(true);
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(result.error ?? 'Could not record the payment')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final due = widget.invoice.amountDuePence ?? 0;
    return Padding(
      padding: EdgeInsets.fromLTRB(24, 24, 24, 24 + MediaQuery.of(context).viewInsets.bottom),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Record payment', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text(
              '${widget.invoice.title} · ${CurrencyUtils.formatPence(due)} still owed',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _amountController,
              decoration: const InputDecoration(
                labelText: 'Amount received (£)',
                prefixIcon: Icon(Icons.currency_pound),
              ),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              validator: (value) {
                final amount = double.tryParse(value?.trim() ?? '');
                if (amount == null || amount <= 0) return 'Enter the amount received';
                if (CurrencyUtils.poundsToPence(amount) > due) {
                  return 'That is more than the ${CurrencyUtils.formatPence(due)} owed';
                }
                return null;
              },
            ),
            const SizedBox(height: 8),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.event),
              title: const Text('Received on'),
              subtitle: Text(DateUtils.formatDate(_receivedAt)),
              onTap: _pickDate,
            ),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: _saving ? null : _save,
              child: Text(_saving ? 'Saving…' : 'Record payment'),
            ),
          ],
        ),
      ),
    );
  }
}
