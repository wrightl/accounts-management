import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/api_response.dart';

/// Loads a page from the API with pull to refresh, retry on error, and a
/// spinner the first time. [builder] returns the list's children.
class LoadedList<T> extends StatefulWidget {
  const LoadedList({
    super.key,
    required this.load,
    required this.builder,
  });

  final Future<ApiResponse<T>> Function() load;
  final List<Widget> Function(BuildContext context, T data, Future<void> Function() reload)
      builder;

  @override
  State<LoadedList<T>> createState() => _LoadedListState<T>();
}

class _LoadedListState<T> extends State<LoadedList<T>> {
  T? _data;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() => _loading = true);
    final response = await widget.load();
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (response.success && response.data != null) {
        _data = response.data;
        _error = null;
      } else {
        _error = response.error ?? 'Could not load this page.';
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    if (data == null) {
      if (_loading) return const Center(child: CircularProgressIndicator());
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, color: BrandColors.destructive),
              const SizedBox(height: 12),
              Text(_error ?? '', textAlign: TextAlign.center),
              const SizedBox(height: 16),
              ElevatedButton(onPressed: _reload, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          if (_loading)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: LinearProgressIndicator(minHeight: 2),
            ),
          ...widget.builder(context, data, _reload),
        ],
      ),
    );
  }
}

/// Run a write, show its outcome, and reload on success.
Future<void> runAndReload(
  BuildContext context,
  Future<ApiResponse<bool>> Function() action, {
  required String done,
  required Future<void> Function() reload,
}) async {
  final response = await action();
  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(response.success ? done : response.error ?? 'Something went wrong')),
  );
  if (response.success) await reload();
}
