import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../../data/models/notification.dart';
import '../../data/repositories/notification_repository.dart';

class NotificationProvider extends ChangeNotifier {
  NotificationProvider({NotificationRepository? repository})
      : _repository = repository ?? NotificationRepository();

  final NotificationRepository _repository;

  List<AppNotification> _items = [];
  int _unreadCount = 0;
  bool _loading = false;
  String? _error;
  Map<String, NotificationChannels> _prefs = {};
  List<NotificationEventDef> _catalog = [];

  List<AppNotification> get items => _items;
  int get unreadCount => _unreadCount;
  bool get loading => _loading;
  String? get error => _error;
  Map<String, NotificationChannels> get prefs => _prefs;
  List<NotificationEventDef> get catalog => _catalog;

  Future<void> refreshUnread() async {
    final result = await _repository.unreadCount();
    if (result.success && result.data != null) {
      _unreadCount = result.data!;
      notifyListeners();
    }
  }

  Future<void> load({String filter = 'all'}) async {
    _loading = true;
    _error = null;
    notifyListeners();
    final result = await _repository.list(filter: filter);
    _loading = false;
    if (!result.success || result.data == null) {
      _error = result.error ?? 'Failed to load';
      notifyListeners();
      return;
    }
    _items = result.data!.items;
    _unreadCount = result.data!.unreadCount;
    notifyListeners();
  }

  Future<void> markRead(String id) async {
    await _repository.markRead(id);
    _items = _items
        .map(
          (n) => n.id == id && n.readAt == null
              ? AppNotification(
                  id: n.id,
                  type: n.type,
                  title: n.title,
                  body: n.body,
                  href: n.href,
                  entityType: n.entityType,
                  entityId: n.entityId,
                  readAt: DateTime.now(),
                  createdAt: n.createdAt,
                )
              : n,
        )
        .toList();
    _unreadCount = _items.where((n) => n.isUnread).length;
    notifyListeners();
  }

  Future<void> markAllRead() async {
    await _repository.markAllRead();
    _items = _items
        .map(
          (n) => AppNotification(
            id: n.id,
            type: n.type,
            title: n.title,
            body: n.body,
            href: n.href,
            entityType: n.entityType,
            entityId: n.entityId,
            readAt: n.readAt ?? DateTime.now(),
            createdAt: n.createdAt,
          ),
        )
        .toList();
    _unreadCount = 0;
    notifyListeners();
  }

  Future<void> delete(String id) async {
    await _repository.delete(id);
    _items = _items.where((n) => n.id != id).toList();
    _unreadCount = _items.where((n) => n.isUnread).length;
    notifyListeners();
  }

  Future<void> loadPrefs() async {
    final result = await _repository.prefs();
    if (!result.success || result.data == null) {
      _error = result.error;
      notifyListeners();
      return;
    }
    _catalog = result.data!.catalog;
    _prefs = Map.of(result.data!.effective);
    notifyListeners();
  }

  void setChannel(String type, NotificationChannels channels) {
    _prefs[type] = channels;
    notifyListeners();
  }

  Future<bool> savePrefs({String scope = 'user'}) async {
    final result = await _repository.savePrefs(scope: scope, matrix: _prefs);
    return result.success;
  }

  Future<void> registerPushToken(String token) async {
    await _repository.registerPushToken(token);
  }
}
