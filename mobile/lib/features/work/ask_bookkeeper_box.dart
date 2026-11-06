import 'package:flutter/material.dart';
import '../../data/models/work.dart';
import '../../data/repositories/work_repository.dart';

/// Ask a question about the books, as on the web AI bookkeeper page. It can
/// only read; each company has a daily allowance shared with the web.
class AskBookkeeperBox extends StatefulWidget {
  const AskBookkeeperBox({super.key, required this.repository});

  final WorkRepository repository;

  @override
  State<AskBookkeeperBox> createState() => _AskBookkeeperBoxState();
}

class _AskBookkeeperBoxState extends State<AskBookkeeperBox> {
  final _controller = TextEditingController();
  bool _asking = false;
  int? _remaining;
  BookkeeperAnswer? _answer;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadRemaining();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _loadRemaining() async {
    final response = await widget.repository.questionsRemaining();
    if (mounted && response.success) setState(() => _remaining = response.data);
  }

  Future<void> _ask() async {
    final question = _controller.text.trim();
    if (question.isEmpty || _asking) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _asking = true;
      _error = null;
    });
    final response = await widget.repository.askBookkeeper(question);
    if (!mounted) return;
    setState(() {
      _asking = false;
      if (response.success) {
        _answer = response.data;
      } else {
        _error = response.error;
      }
    });
    await _loadRemaining();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final remaining = _remaining;
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Ask a question', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            TextField(
              controller: _controller,
              decoration: const InputDecoration(
                hintText: 'What did we spend on software last quarter?',
              ),
              minLines: 1,
              maxLines: 4,
              maxLength: 500,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _ask(),
            ),
            Row(
              children: [
                Expanded(
                  child: Text(
                    remaining == null ? '' : '$remaining questions left today',
                    style: theme.textTheme.bodySmall,
                  ),
                ),
                ElevatedButton(
                  onPressed: _asking || remaining == 0 ? null : _ask,
                  child: Text(_asking ? 'Thinking…' : 'Ask'),
                ),
              ],
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
            ],
            if (_answer != null) ...[
              const SizedBox(height: 12),
              SelectableText(_answer!.answer),
              if (_answer!.sources.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text('From', style: theme.textTheme.bodySmall),
                for (final source in _answer!.sources)
                  Text('• $source', style: theme.textTheme.bodySmall),
              ],
            ],
          ],
        ),
      ),
    );
  }
}
