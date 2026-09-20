import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Loads KEY=VALUE pairs from dotenv files bundled as Flutter assets.
///
/// Lookup order for [AppConstants] values:
/// 1. `--dart-define` / `--dart-define-from-file` (compile-time)
/// 2. `.env.local` then `.env` then `.env.development` (debug/profile only)
/// 3. Hard-coded defaults
class AppEnv {
  AppEnv._();

  static final Map<String, String> _values = {};

  static String? get(String key) {
    final value = _values[key];
    if (value == null || value.isEmpty) return null;
    return value;
  }

  static Future<void> load() async {
    if (kReleaseMode) return;

    for (final fileName in ['.env.development', '.env', '.env.local']) {
      await _loadAsset(fileName);
    }
  }

  static Future<void> _loadAsset(String fileName) async {
    try {
      final content = await rootBundle.loadString(fileName);
      _values.addAll(parse(content));
    } catch (_) {
      // File is optional, or not listed in pubspec.yaml assets.
    }
  }

  @visibleForTesting
  static void reset() => _values.clear();

  @visibleForTesting
  static void debugMerge(Map<String, String> values) => _values.addAll(values);

  static Map<String, String> parse(String content) {
    final result = <String, String>{};

    for (final rawLine in content.split('\n')) {
      var line = rawLine.trim();
      if (line.isEmpty || line.startsWith('#')) continue;

      if (line.startsWith('export ')) {
        line = line.substring(7).trim();
      }

      final separator = line.indexOf('=');
      if (separator <= 0) continue;

      final key = line.substring(0, separator).trim();
      if (key.isEmpty) continue;

      var value = line.substring(separator + 1).trim();
      if (value.length >= 2) {
        final start = value[0];
        final end = value[value.length - 1];
        if ((start == '"' && end == '"') || (start == "'" && end == "'")) {
          value = value.substring(1, value.length - 1);
        }
      }

      result[key] = value;
    }

    return result;
  }
}
