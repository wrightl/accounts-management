import 'package:json_annotation/json_annotation.dart';

part 'user.g.dart';

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
  
  User({
    required this.id,
    required this.clerkUserId,
    required this.email,
    required this.name,
    this.profilePicture,
    required this.role,
    this.companyId,
    this.entityType,
  });
  
  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
  Map<String, dynamic> toJson() => _$UserToJson(this);

  String get firstName {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return '';
    return trimmed.split(RegExp(r'\s+')).first;
  }

  bool get isLimitedCompany => entityType == 'limited_company';
  bool get canReadAccounts =>
      role == 'admin' || role == 'user' || role == 'accountant';
  bool get canManageSettings => role == 'admin';
  bool get canManageUsers => role == 'admin';
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
  
  factory Company.fromJson(Map<String, dynamic> json) => _$CompanyFromJson(json);
  Map<String, dynamic> toJson() => _$CompanyToJson(this);
}
