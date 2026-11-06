import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../data/models/expense.dart';
import '../expense_provider.dart';

/// The web's label colours (Tailwind 600 shades), for icons and checkmarks.
const _labelColors = <String, Color>{
  'slate': Color(0xFF475569),
  'red': Color(0xFFDC2626),
  'orange': Color(0xFFEA580C),
  'amber': Color(0xFFD97706),
  'green': Color(0xFF16A34A),
  'teal': Color(0xFF0D9488),
  'blue': Color(0xFF2563EB),
  'indigo': Color(0xFF4F46E5),
  'purple': Color(0xFF9333EA),
  'pink': Color(0xFFDB2777),
};

/// Text on a pale fill, as the web chips (`LABEL_CHIP_CLASSES`): 900 text on
/// 100 (slate 200), so a chip stays readable on a tinted row.
typedef ChipColors = ({Color foreground, Color background});

const labelChipColors = <String, ChipColors>{
  'slate': (foreground: Color(0xFF0F172A), background: Color(0xFFE2E8F0)),
  'red': (foreground: Color(0xFF7F1D1D), background: Color(0xFFFEE2E2)),
  'orange': (foreground: Color(0xFF7C2D12), background: Color(0xFFFFEDD5)),
  'amber': (foreground: Color(0xFF78350F), background: Color(0xFFFEF3C7)),
  'green': (foreground: Color(0xFF14532D), background: Color(0xFFDCFCE7)),
  'teal': (foreground: Color(0xFF134E4A), background: Color(0xFFCCFBF1)),
  'blue': (foreground: Color(0xFF1E3A8A), background: Color(0xFFDBEAFE)),
  'indigo': (foreground: Color(0xFF312E81), background: Color(0xFFE0E7FF)),
  'purple': (foreground: Color(0xFF581C87), background: Color(0xFFF3E8FF)),
  'pink': (foreground: Color(0xFF831843), background: Color(0xFFFCE7F3)),
};

/// Expense status chips, same pairing as the labels.
const statusChipColors = <String, ChipColors>{
  'pending': (foreground: Color(0xFF78350F), background: Color(0xFFFEF3C7)),
  'recorded': (foreground: Color(0xFF1E3A8A), background: Color(0xFFDBEAFE)),
  'reimbursable': (foreground: Color(0xFF581C87), background: Color(0xFFF3E8FF)),
  'reimbursed': (foreground: Color(0xFF14532D), background: Color(0xFFDCFCE7)),
  'company_paid': (foreground: Color(0xFF134E4A), background: Color(0xFFCCFBF1)),
};

Color labelColor(String name) => _labelColors[name] ?? _labelColors['slate']!;

ChipColors labelChipColor(String name) =>
    labelChipColors[name] ?? labelChipColors['slate']!;

ChipColors statusChipColor(String status) =>
    statusChipColors[status] ?? labelChipColors['slate']!;

class LabelChip extends StatelessWidget {
  const LabelChip({super.key, required this.label});

  final ExpenseLabel label;

  @override
  Widget build(BuildContext context) {
    final colors = labelChipColor(label.color);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: colors.background,
        border: Border.all(color: colors.foreground.withValues(alpha: 0.3)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(label.name, style: TextStyle(fontSize: 12, color: colors.foreground)),
    );
  }
}

class LabelChips extends StatelessWidget {
  const LabelChips({super.key, required this.labels});

  final List<ExpenseLabel> labels;

  @override
  Widget build(BuildContext context) {
    if (labels.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [for (final label in labels) LabelChip(label: label)],
    );
  }
}

/// Choose an expense's labels and write its note, as on the web row menu.
class EditLabelsAndNoteSheet extends StatefulWidget {
  const EditLabelsAndNoteSheet({super.key, required this.expense});

  final Expense expense;

  @override
  State<EditLabelsAndNoteSheet> createState() => _EditLabelsAndNoteSheetState();
}

class _EditLabelsAndNoteSheetState extends State<EditLabelsAndNoteSheet> {
  late final Set<String> _selected = {
    for (final label in widget.expense.labels) label.id,
  };
  late final _noteController = TextEditingController(text: widget.expense.notes ?? '');
  final _newLabelController = TextEditingController();
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => context.read<ExpenseProvider>().loadLabels(),
    );
  }

  @override
  void dispose() {
    _noteController.dispose();
    _newLabelController.dispose();
    super.dispose();
  }

  Future<void> _addLabel(ExpenseProvider provider) async {
    final name = _newLabelController.text.trim();
    if (name.isEmpty) return;
    final colors = provider.labelColors;
    // Cycle through the colours so new labels are told apart, as people tend
    // to add several in a row.
    final color = colors.isEmpty
        ? 'blue'
        : colors[provider.labels.length % colors.length];
    final id = await provider.createLabel(name, color);
    if (!mounted) return;
    if (id == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(provider.error ?? 'Could not add the label')),
      );
      return;
    }
    setState(() {
      _selected.add(id);
      _newLabelController.clear();
    });
  }

  Future<void> _save(ExpenseProvider provider) async {
    setState(() => _saving = true);
    final ok = await provider.annotateExpense(
      widget.expense.id,
      labelIds: _selected.toList(),
      note: _noteController.text.trim().isEmpty ? null : _noteController.text.trim(),
    );
    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(provider.error ?? 'Could not save')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ExpenseProvider>();
    return Padding(
      padding: EdgeInsets.fromLTRB(
        24,
        24,
        24,
        24 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Labels and note', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text(
              'For your team only. Not included in the accountant pack.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final label in provider.labels)
                  FilterChip(
                    label: Text(label.name),
                    selected: _selected.contains(label.id),
                    selectedColor: labelColor(label.color).withValues(alpha: 0.2),
                    checkmarkColor: labelColor(label.color),
                    onSelected: (on) => setState(
                      () => on ? _selected.add(label.id) : _selected.remove(label.id),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _newLabelController,
                    decoration: const InputDecoration(labelText: 'New label'),
                    textCapitalization: TextCapitalization.sentences,
                    onSubmitted: (_) => _addLabel(provider),
                  ),
                ),
                TextButton(
                  onPressed: () => _addLabel(provider),
                  child: const Text('Add'),
                ),
              ],
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _noteController,
              decoration: const InputDecoration(labelText: 'Note'),
              minLines: 2,
              maxLines: 6,
              maxLength: 5000,
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: _saving ? null : () => _save(provider),
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }
}
