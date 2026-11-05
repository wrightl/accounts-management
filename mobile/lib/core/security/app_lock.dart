import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Optional Face ID / fingerprint lock. Off by default; once on, the app
/// asks on launch and after [timeout] in the background. The setting is
/// per phone, not per account.
class AppLock with ChangeNotifier, WidgetsBindingObserver {
  AppLock({
    Future<bool> Function(String reason)? authenticate,
    Future<bool> Function()? isSupported,
    DateTime Function()? now,
    this.timeout = const Duration(minutes: 5),
  })  : _authenticate = authenticate ?? _deviceAuthenticate,
        _isSupported = isSupported ?? _deviceSupported,
        _now = now ?? DateTime.now;

  static const _prefKey = 'app_lock_enabled';

  final Future<bool> Function(String reason) _authenticate;
  final Future<bool> Function() _isSupported;
  final DateTime Function() _now;
  final Duration timeout;

  bool _enabled = false;
  bool _locked = false;
  bool _supported = false;
  bool _authenticating = false;
  DateTime? _backgroundedAt;

  bool get enabled => _enabled;
  bool get locked => _enabled && _locked;
  bool get supported => _supported;

  static Future<bool> _deviceAuthenticate(String reason) =>
      LocalAuthentication().authenticate(localizedReason: reason);

  static Future<bool> _deviceSupported() async {
    try {
      return await LocalAuthentication().isDeviceSupported();
    } catch (_) {
      return false;
    }
  }

  /// Read the setting and lock straight away if it's on.
  Future<void> load() async {
    _supported = await _isSupported();
    final prefs = await SharedPreferences.getInstance();
    _enabled = _supported && (prefs.getBool(_prefKey) ?? false);
    _locked = _enabled;
    notifyListeners();
  }

  /// Turning it on asks first, so nobody locks themselves out by mistake.
  Future<bool> setEnabled(bool on) async {
    if (on && !await _tryAuthenticate('Turn on the app lock')) return false;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_prefKey, on);
    _enabled = on;
    _locked = false;
    notifyListeners();
    return true;
  }

  Future<bool> unlock() async {
    if (!locked) return true;
    final ok = await _tryAuthenticate('Unlock Alfa');
    if (ok) {
      _locked = false;
      notifyListeners();
    }
    return ok;
  }

  Future<bool> _tryAuthenticate(String reason) async {
    if (_authenticating) return false;
    _authenticating = true;
    try {
      return await _authenticate(reason);
    } catch (error) {
      debugPrint('App lock: $error');
      return false;
    } finally {
      _authenticating = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!_enabled) return;
    // The system prompt itself backgrounds the app briefly; ignore that.
    if (_authenticating) return;
    if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      _backgroundedAt ??= _now();
    } else if (state == AppLifecycleState.resumed) {
      final since = _backgroundedAt;
      _backgroundedAt = null;
      if (since != null && _now().difference(since) >= timeout) {
        _locked = true;
        notifyListeners();
      }
    }
  }
}

/// Covers the app while it's locked, and asks to unlock as it appears.
class AppLockGate extends StatefulWidget {
  const AppLockGate({super.key, required this.lock, required this.child});

  final AppLock lock;
  final Widget child;

  @override
  State<AppLockGate> createState() => _AppLockGateState();
}

class _AppLockGateState extends State<AppLockGate> {
  @override
  void initState() {
    super.initState();
    widget.lock.addListener(_changed);
    _promptIfLocked();
  }

  @override
  void dispose() {
    widget.lock.removeListener(_changed);
    super.dispose();
  }

  void _changed() {
    if (!mounted) return;
    setState(() {});
    _promptIfLocked();
  }

  void _promptIfLocked() {
    if (widget.lock.locked) {
      WidgetsBinding.instance.addPostFrameCallback((_) => widget.lock.unlock());
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.lock.locked) return widget.child;
    return LockedView(onUnlock: widget.lock.unlock);
  }
}

/// Shown instead of the app while it's locked.
class LockedView extends StatelessWidget {
  const LockedView({super.key, required this.onUnlock});

  final VoidCallback onUnlock;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.lock_outline, size: 48),
            const SizedBox(height: 16),
            Text('Alfa is locked', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: onUnlock, child: const Text('Unlock')),
          ],
        ),
      ),
    );
  }
}
