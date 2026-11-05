import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../data/models/notification.dart';
import '../notification_provider.dart';

class NotificationPrefsScreen extends StatefulWidget {
  const NotificationPrefsScreen({super.key});

  @override
  State<NotificationPrefsScreen> createState() =>
      _NotificationPrefsScreenState();
}

class _NotificationPrefsScreenState extends State<NotificationPrefsScreen> {
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<NotificationProvider>().loadPrefs();
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<NotificationProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          TextButton(
            onPressed: _saving
                ? null
                : () async {
                    setState(() => _saving = true);
                    final ok = await provider.savePrefs();
                    if (!context.mounted) return;
                    setState(() => _saving = false);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          ok ? 'Preferences saved' : 'Could not save',
                        ),
                      ),
                    );
                  },
            child: Text(_saving ? 'Saving…' : 'Save'),
          ),
        ],
      ),
      body: provider.catalog.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : ListView.builder(
              itemCount: provider.catalog.length + 1,
              itemBuilder: (context, index) {
                if (index == 0) {
                  return SwitchListTile(
                    title: const Text('Hide details on the lock screen'),
                    subtitle: const Text(
                      'Alerts just say "New notification in Alfa", without '
                      'amounts or client names. Open the app to read them.',
                    ),
                    value: provider.hidePushDetails,
                    onChanged: (hide) async {
                      final ok = await provider.setHidePushDetails(hide);
                      if (!ok && context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Could not save')),
                        );
                      }
                    },
                  );
                }
                final event = provider.catalog[index - 1];
                final channels = provider.prefs[event.type] ??
                    const NotificationChannels(
                      inApp: true,
                      email: false,
                      push: false,
                    );
                return ExpansionTile(
                  title: Text(event.label),
                  subtitle: Text(event.description),
                  children: [
                    SwitchListTile(
                      title: const Text('In-app'),
                      value: channels.inApp,
                      onChanged: (v) => provider.setChannel(
                        event.type,
                        channels.copyWith(inApp: v),
                      ),
                    ),
                    SwitchListTile(
                      title: const Text('Email'),
                      value: channels.email,
                      onChanged: (v) => provider.setChannel(
                        event.type,
                        channels.copyWith(email: v),
                      ),
                    ),
                    SwitchListTile(
                      title: const Text('Push'),
                      value: channels.push,
                      onChanged: (v) => provider.setChannel(
                        event.type,
                        channels.copyWith(push: v),
                      ),
                    ),
                  ],
                );
              },
            ),
    );
  }
}
