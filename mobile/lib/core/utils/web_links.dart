import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../constants/app_constants.dart';

/// Open a web app page (e.g. `/settings`) in the browser, for work the phone
/// leaves to the web. Says so if it can't.
Future<void> openOnWeb(BuildContext context, String path) async {
  final opened = await launchUrl(
    Uri.parse(AppConstants.webUrl(path)),
    mode: LaunchMode.externalApplication,
  );
  if (opened || !context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(
    const SnackBar(content: Text('Could not open the web app. Try again on a computer.')),
  );
}
