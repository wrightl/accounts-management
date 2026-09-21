// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BillingInfo _$BillingInfoFromJson(Map<String, dynamic> json) => BillingInfo(
  plan: json['plan'] as String? ?? 'trial',
  status: json['status'] as String? ?? 'trialing',
  readOnly: json['readOnly'] as bool? ?? false,
  trialEndsAt: json['trialEndsAt'] as String?,
  maxUsers: (json['maxUsers'] as num?)?.toInt() ?? 5,
  userCount: (json['userCount'] as num?)?.toInt() ?? 0,
  vatExport: json['vatExport'] as bool? ?? false,
  complimentary: json['complimentary'] as bool? ?? false,
  reason: json['reason'] as String?,
);

Map<String, dynamic> _$BillingInfoToJson(BillingInfo instance) =>
    <String, dynamic>{
      'plan': instance.plan,
      'status': instance.status,
      'readOnly': instance.readOnly,
      'trialEndsAt': instance.trialEndsAt,
      'maxUsers': instance.maxUsers,
      'userCount': instance.userCount,
      'vatExport': instance.vatExport,
      'complimentary': instance.complimentary,
      'reason': instance.reason,
    };

User _$UserFromJson(Map<String, dynamic> json) => User(
  id: json['id'] as String,
  clerkUserId: json['clerkUserId'] as String,
  email: json['email'] as String? ?? '',
  name: json['name'] as String? ?? '',
  profilePicture: json['profilePicture'] as String?,
  role: json['role'] as String,
  companyId: json['companyId'] as String?,
  entityType: json['entityType'] as String?,
  billing: json['billing'] == null
      ? null
      : BillingInfo.fromJson(json['billing'] as Map<String, dynamic>),
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
  'billing': instance.billing,
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
