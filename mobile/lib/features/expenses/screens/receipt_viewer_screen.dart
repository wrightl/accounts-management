import 'dart:io';

import 'package:flutter/material.dart' hide DateUtils;
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../../../data/models/api_response.dart';
import '../../../data/models/expense.dart';
import '../../../data/repositories/expense_repository.dart';
import '../../../core/utils/formatters.dart';

/// The receipts on an expense, each opening the viewer. Shown on the expense
/// detail and on the review sheet, so nobody approves a receipt unseen.
class ExpenseReceiptsList extends StatelessWidget {
  const ExpenseReceiptsList({super.key, required this.receipts});

  final List<ExpenseReceipt> receipts;

  @override
  Widget build(BuildContext context) {
    if (receipts.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          receipts.length == 1 ? 'Receipt' : 'Receipts',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        for (final receipt in receipts)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(
              receipt.filename.toLowerCase().endsWith('.pdf')
                  ? Icons.picture_as_pdf_outlined
                  : Icons.image_outlined,
            ),
            title: Text(receipt.filename, overflow: TextOverflow.ellipsis),
            subtitle: Text(DateUtils.formatDate(receipt.uploadedAt)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => ReceiptViewerScreen(receipt: receipt),
              ),
            ),
          ),
      ],
    );
  }
}

class ReceiptViewerScreen extends StatefulWidget {
  const ReceiptViewerScreen({
    super.key,
    required this.receipt,
    this.repository,
  });

  final ExpenseReceipt receipt;
  final ExpenseRepository? repository;

  @override
  State<ReceiptViewerScreen> createState() => _ReceiptViewerScreenState();
}

class _ReceiptViewerScreenState extends State<ReceiptViewerScreen> {
  late Future<ApiResponse<ReceiptFile>> _file;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final repository = widget.repository ?? ExpenseRepository();
    _file = repository.downloadReceipt(widget.receipt);
  }

  /// PDFs open in the phone's own viewer from a temporary copy.
  Future<void> _openPdf(ReceiptFile file) async {
    final dir = await getTemporaryDirectory();
    final safeName = file.filename.replaceAll(RegExp(r'[^\w.\- ]'), '_');
    final path = '${dir.path}/receipt-${widget.receipt.id}-$safeName';
    await File(path).writeAsBytes(file.bytes, flush: true);
    final result = await OpenFilex.open(path, type: 'application/pdf');
    if (!mounted || result.type == ResultType.done) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('No app on this phone can open PDFs.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.receipt.filename)),
      body: FutureBuilder<ApiResponse<ReceiptFile>>(
        future: _file,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final response = snapshot.data;
          final file = response?.data;
          if (response == null || !response.success || file == null) {
            return _Message(
              message: response?.error ?? 'Could not load the receipt',
              actionLabel: 'Try again',
              onAction: () => setState(_load),
            );
          }
          if (file.isImage) {
            return InteractiveViewer(
              maxScale: 5,
              child: Center(child: Image.memory(file.bytes)),
            );
          }
          if (file.isPdf) {
            return _Message(
              message: 'This receipt is a PDF.',
              actionLabel: 'Open PDF',
              onAction: () => _openPdf(file),
            );
          }
          return const _Message(message: "This file type can't be shown here.");
        },
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.message, this.actionLabel, this.onAction});

  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
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
