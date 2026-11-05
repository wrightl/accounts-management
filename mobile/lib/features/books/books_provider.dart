import 'package:flutter/foundation.dart';
import '../../../data/models/books.dart';
import '../../../data/repositories/books_repository.dart';

class BooksProvider with ChangeNotifier {
  BooksProvider({BooksRepository? repository})
      : _repository = repository ?? BooksRepository();

  final BooksRepository _repository;
  final Map<String, BooksPage> _pages = {};
  final Map<String, String> _errors = {};
  final Set<String> _loading = {};
  final Set<String> _loadingMore = {};

  BooksPage? pageFor(String resource) => _pages[resource];
  String? errorFor(String resource) => _errors[resource];
  bool isLoading(String resource) => _loading.contains(resource);

  Future<void> load(String resource, {bool force = false}) async {
    if (!force && _pages.containsKey(resource)) return;
    _loading.add(resource);
    _errors.remove(resource);
    notifyListeners();

    final response = await _repository.getPage(resource);
    if (response.success && response.data != null) {
      _pages[resource] = response.data!;
    } else {
      _errors[resource] = response.error ?? 'Failed to load';
    }
    _loading.remove(resource);
    notifyListeners();
  }

  Future<void> refresh(String resource) => load(resource, force: true);

  /// The next page of [resource], appended to what's shown.
  Future<void> loadMore(String resource) async {
    final current = _pages[resource];
    if (current == null || !current.hasMore) return;
    if (_loadingMore.contains(resource) || _loading.contains(resource)) return;
    _loadingMore.add(resource);
    notifyListeners();

    final response = await _repository.getPage(resource, offset: current.items.length);
    if (response.success && response.data != null) {
      _pages[resource] = current.append(response.data!);
    } else {
      _errors[resource] = response.error ?? 'Failed to load';
    }
    _loadingMore.remove(resource);
    notifyListeners();
  }
}
