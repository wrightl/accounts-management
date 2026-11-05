import 'package:flutter/foundation.dart';
import 'package:home_widget/home_widget.dart';
import 'package:intl/intl.dart';

import '../../data/models/dashboard.dart';

/// Keeps the home-screen widget's figures in step with the Overview. With
/// the app lock on, or once signed out, it shows no figures at all.
///
/// Android draws it from `AlfaWidgetProvider`. iOS needs a WidgetKit
/// extension added in Xcode (see mobile/README.md) before it shows anything.
class HomeWidgetSync {
  HomeWidgetSync({
    Future<void> Function(String key, String? value)? save,
    Future<void> Function()? update,
  })  : _save = save ?? _saveToPlugin,
        _update = update ?? _updatePlugin;

  static HomeWidgetSync instance = HomeWidgetSync();

  static const androidName = 'AlfaWidgetProvider';
  static const iOSName = 'AlfaWidget';

  final Future<void> Function(String key, String? value) _save;
  final Future<void> Function() _update;

  static Future<void> _saveToPlugin(String key, String? value) async {
    await HomeWidget.saveWidgetData<String>(key, value);
  }

  static Future<void> _updatePlugin() async {
    await HomeWidget.updateWidget(androidName: androidName, iOSName: iOSName);
  }

  /// Show what clients owe and Safe to pay, unless [hidden].
  Future<void> publish(DashboardData data, {required bool hidden}) async {
    if (hidden) return clear();
    final owed = data.heroes.where((h) => h.key == 'outstanding').firstOrNull;
    await _write(
      owed: owed?.value,
      safeToPay: data.safeToPay?.safeNowFormatted,
      updated: 'Updated ${DateFormat('d MMM, HH:mm').format(DateTime.now())}',
    );
  }

  /// No figures: "Open Alfa to see your figures".
  Future<void> clear() => _write(owed: null, safeToPay: null, updated: null);

  Future<void> _write({String? owed, String? safeToPay, String? updated}) async {
    try {
      await _save('owed', owed);
      await _save('safe_to_pay', safeToPay);
      await _save('updated', updated);
      await _update();
    } catch (error) {
      // No widget support (tests, web, an unsupported launcher).
      debugPrint('Home widget: $error');
    }
  }
}
