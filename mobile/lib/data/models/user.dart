import 'package:json_annotation/json_annotation.dart';

part 'user.g.dart';

@JsonSerializable()
class BillingInfo {
  final String plan;
  final String status;
  final bool readOnly;
  final String? trialEndsAt;
  final int maxUsers;
  final int userCount;
  final bool vatExport;
  final bool complimentary;
  final String? reason;

  BillingInfo({
    required this.plan,
    required this.status,
    required this.readOnly,
    this.trialEndsAt,
    required this.maxUsers,
    required this.userCount,
    required this.vatExport,
    required this.complimentary,
    this.reason,
  });

  factory BillingInfo.fromJson(Map<String, dynamic> json) =>
      _$BillingInfoFromJson(json);
  Map<String, dynamic> toJson() => _$BillingInfoToJson(this);

  String? get bannerMessage {
    if (complimentary) return null;
    if (readOnly) {
      if (reason == 'trial_expired') {
        return 'Your free trial has ended. Choose a plan on the web to keep editing.';
      }
      return 'Your subscription is read-only. Manage billing on the web.';
    }
    if (status == 'past_due') {
      return 'Payment failed. Update billing on the web to keep write access.';
    }
    if (status == 'trialing' && trialEndsAt != null) {
      final end = DateTime.tryParse(trialEndsAt!);
      if (end != null) {
        final days = end.difference(DateTime.now()).inDays;
        if (days <= 7) {
          if (days <= 0) {
            return 'Your trial ends today. Choose a plan on the web.';
          }
          return 'Your free trial ends in $days day${days == 1 ? '' : 's'}.';
        }
      }
    }
    return null;
  }
}

@JsonSerializable()
class User {
  final String id;
  final String clerkUserId;
  @JsonKey(defaultValue: '')
  final String email;
  @JsonKey(defaultValue: '')
  final String name;
  final String? profilePicture;
  final String role;
  final String? companyId;
  final String? entityType;

  /// Permissions the server grants this role (e.g. `accounts:write`).
  @JsonKey(defaultValue: <String>[])
  final List<String> permissions;

  /// Optional pages this person shows in their web menu. Null shows all.
  final List<String>? menuFeatures;
  final BillingInfo? billing;

  User({
    required this.id,
    required this.clerkUserId,
    required this.email,
    required this.name,
    this.profilePicture,
    required this.role,
    this.companyId,
    this.entityType,
    this.permissions = const [],
    this.menuFeatures,
    this.billing,
  });

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
  Map<String, dynamic> toJson() => _$UserToJson(this);

  String get firstName {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return '';
    return trimmed.split(RegExp(r'\s+')).first;
  }

  bool get isLimitedCompany => entityType == 'limited_company';

  bool can(String permission) => permissions.contains(permission);
  bool get canReadAccounts => can('accounts:read');
  bool get canWriteAccounts => can('accounts:write');
  bool get canReadReports => can('reports:read');
  bool get canManageSettings => can('settings:manage');
  bool get canManageUsers => can('users:manage');

  /// Whether an optional page is in this person's menu, as on the web.
  bool showsFeature(String feature) =>
      menuFeatures?.contains(feature) ?? true;
  bool get isBillingReadOnly => billing?.readOnly == true;
}

@JsonSerializable()
class Company {
  final String id;
  final String name;
  final String entityType;
  final String? logo;
  final String currencyCode;

  Company({
    required this.id,
    required this.name,
    required this.entityType,
    this.logo,
    required this.currencyCode,
  });

  factory Company.fromJson(Map<String, dynamic> json) =>
      _$CompanyFromJson(json);
  Map<String, dynamic> toJson() => _$CompanyToJson(this);
}
