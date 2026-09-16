import 'package:json_annotation/json_annotation.dart';

part 'user.g.dart';

@JsonSerializable()
class User {
  final String id;
  final String clerkUserId;
  final String email;
  final String name;
  final String? profilePicture;
  final String role;
  final String? companyId;
  
  User({
    required this.id,
    required this.clerkUserId,
    required this.email,
    required this.name,
    this.profilePicture,
    required this.role,
    this.companyId,
  });
  
  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
  Map<String, dynamic> toJson() => _$UserToJson(this);
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
