// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

User _$UserFromJson(Map<String, dynamic> json) => User(
  id: json['id'] as String,
  clerkUserId: json['clerkUserId'] as String,
  email: json['email'] as String? ?? '',
  name: json['name'] as String? ?? '',
  profilePicture: json['profilePicture'] as String?,
  role: json['role'] as String,
  companyId: json['companyId'] as String?,
  entityType: json['entityType'] as String?,
);

Map<String, dynamic> _$UserToJson(User instance) => <String, dynamic>{
  'id': instance.id,
  'clerkUserId': instance.clerkUserId,
  'email': instance.email,
  'name': instance.name,
  'profilePicture': instance.profilePicture,
  'role': instance.role,
  'companyId': instance.companyId,
  'entityType': instance.entityType,
};

Company _$CompanyFromJson(Map<String, dynamic> json) => Company(
  id: json['id'] as String,
  name: json['name'] as String,
  entityType: json['entityType'] as String,
  logo: json['logo'] as String?,
  currencyCode: json['currencyCode'] as String,
);

Map<String, dynamic> _$CompanyToJson(Company instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'entityType': instance.entityType,
  'logo': instance.logo,
  'currencyCode': instance.currencyCode,
};
