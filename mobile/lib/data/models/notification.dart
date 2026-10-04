class AppNotification {
  final String id;
  final String type;
  final String title;
  final String body;
  final String? href;
  final String? entityType;
  final String? entityId;
  final DateTime? readAt;
  final DateTime createdAt;

  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    this.href,
    this.entityType,
    this.entityId,
    this.readAt,
    required this.createdAt,
  });

  bool get isUnread => readAt == null;

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: json['id'] as String,
      type: json['type'] as String? ?? '',
      title: json['title'] as String? ?? '',
      body: json['body'] as String? ?? '',
      href: json['href'] as String?,
      entityType: json['entityType'] as String?,
      entityId: json['entityId'] as String?,
      readAt: json['readAt'] != null
          ? DateTime.tryParse(json['readAt'] as String)
          : null,
      createdAt:
          DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.now(),
    );
  }
}

class NotificationChannels {
  final bool inApp;
  final bool email;
  final bool push;

  const NotificationChannels({
    required this.inApp,
    required this.email,
    required this.push,
  });

  factory NotificationChannels.fromJson(Map<String, dynamic> json) {
    return NotificationChannels(
      inApp: json['inApp'] as bool? ?? true,
      email: json['email'] as bool? ?? false,
      push: json['push'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
        'inApp': inApp,
        'email': email,
        'push': push,
      };

  NotificationChannels copyWith({bool? inApp, bool? email, bool? push}) {
    return NotificationChannels(
      inApp: inApp ?? this.inApp,
      email: email ?? this.email,
      push: push ?? this.push,
    );
  }
}

class NotificationEventDef {
  final String type;
  final String label;
  final String description;

  const NotificationEventDef({
    required this.type,
    required this.label,
    required this.description,
  });

  factory NotificationEventDef.fromJson(Map<String, dynamic> json) {
    return NotificationEventDef(
      type: json['type'] as String,
      label: json['label'] as String? ?? json['type'] as String,
      description: json['description'] as String? ?? '',
    );
  }
}
