import '../../core/utils/json.dart';

class DashboardPeriodOption {
  const DashboardPeriodOption(this.value, this.label);
  final String value;
  final String label;
}

const dashboardPeriodOptions = [
  DashboardPeriodOption('this-month', 'This month'),
  DashboardPeriodOption('last-3-months', 'Last 3 months'),
  DashboardPeriodOption('fy', 'This FY'),
  DashboardPeriodOption('trailing-12', '12 months'),
];

class DashboardData {
  DashboardData({
    required this.role,
    required this.firstName,
    required this.periodKey,
    required this.periodLabel,
    required this.compareLabel,
    required this.todayLabel,
    required this.heroes,
    required this.cashSeries,
    required this.funnel,
    required this.agedReceivables,
    required this.topClients,
    required this.expenseMix,
    required this.spending,
    required this.attention,
  });

  final String role;
  final String firstName;
  final String periodKey;
  final String periodLabel;
  final String compareLabel;
  final String todayLabel;
  final List<HeroKpi> heroes;
  final List<MonthlyCashPoint> cashSeries;
  final List<FunnelStage> funnel;
  final AgedReceivables agedReceivables;
  final List<NamedSlice> topClients;
  final List<NamedSlice> expenseMix;
  final SpendingSnapshotData spending;
  final AttentionData attention;

  bool get isPending => role == 'pending';

  factory DashboardData.pending({required String firstName}) {
    return DashboardData(
      role: 'pending',
      firstName: firstName,
      periodKey: 'this-month',
      periodLabel: '',
      compareLabel: '',
      todayLabel: 'Business overview',
      heroes: const [],
      cashSeries: const [],
      funnel: const [],
      agedReceivables: AgedReceivables.empty(),
      topClients: const [],
      expenseMix: const [],
      spending: SpendingSnapshotData.empty(),
      attention: AttentionData.empty(),
    );
  }

  factory DashboardData.fromJson(Map<String, dynamic> json) {
    final role = asString(json['role'], 'user');
    final firstName = asString(json['firstName']);
    if (role == 'pending' || json['heroes'] == null) {
      return DashboardData.pending(firstName: firstName);
    }

    return DashboardData(
      role: role,
      firstName: firstName,
      periodKey: asString(json['periodKey'], 'this-month'),
      periodLabel: asString(json['periodLabel']),
      compareLabel: asString(json['compareLabel']),
      todayLabel: asString(json['todayLabel'], 'Business overview'),
      heroes: asList(json['heroes'])
          .whereType<Map>()
          .map((e) => HeroKpi.fromJson(asMap(e)))
          .toList(),
      cashSeries: asList(json['cashSeries'])
          .whereType<Map>()
          .map((e) => MonthlyCashPoint.fromJson(asMap(e)))
          .toList(),
      funnel: asList(json['funnel'])
          .whereType<Map>()
          .map((e) => FunnelStage.fromJson(asMap(e)))
          .toList(),
      agedReceivables: AgedReceivables.fromJson(asMap(json['agedReceivables'])),
      topClients: asList(json['topClients'])
          .whereType<Map>()
          .map((e) => NamedSlice.fromJson(asMap(e), nameKey: 'name'))
          .toList(),
      expenseMix: asList(json['expenseMix'])
          .whereType<Map>()
          .map((e) => NamedSlice.fromJson(asMap(e), nameKey: 'category'))
          .toList(),
      spending: SpendingSnapshotData.fromJson(asMap(json['spending'])),
      attention: AttentionData.fromJson(asMap(json['attention'])),
    );
  }
}

class HeroKpi {
  HeroKpi({
    required this.key,
    required this.title,
    required this.value,
    required this.valuePence,
    this.subtitle,
    this.insight,
    required this.accent,
    required this.delta,
    required this.sparkline,
  });

  final String key;
  final String title;
  final String value;
  final int valuePence;
  final String? subtitle;
  final String? insight;
  final String accent;
  final HeroDelta delta;
  final List<double> sparkline;

  bool get isDestructive => accent == 'destructive';

  factory HeroKpi.fromJson(Map<String, dynamic> json) {
    return HeroKpi(
      key: asString(json['key']),
      title: asString(json['title']),
      value: asString(json['value']),
      valuePence: asInt(json['valuePence']),
      subtitle: json['subtitle'] as String?,
      insight: json['insight'] as String?,
      accent: asString(json['accent'], 'default'),
      delta: HeroDelta.fromJson(asMap(json['delta'])),
      sparkline: asList(json['sparkline']).map(asDouble).toList(),
    );
  }
}

class HeroDelta {
  HeroDelta({
    required this.percent,
    required this.label,
    required this.direction,
    required this.caption,
  });

  final int? percent;
  final String label;
  final String direction;
  final String caption;

  factory HeroDelta.fromJson(Map<String, dynamic> json) {
    return HeroDelta(
      percent: json['percent'] == null ? null : asInt(json['percent']),
      label: asString(json['label']),
      direction: asString(json['direction'], 'flat'),
      caption: asString(json['caption']),
    );
  }
}

class MonthlyCashPoint {
  MonthlyCashPoint({
    required this.month,
    required this.label,
    required this.invoicedPence,
    required this.collectedPence,
    required this.incomePence,
    required this.expensePence,
    required this.profitPence,
    required this.invoicedFormatted,
    required this.collectedFormatted,
    required this.incomeFormatted,
    required this.expenseFormatted,
    required this.profitFormatted,
  });

  final String month;
  final String label;
  final int invoicedPence;
  final int collectedPence;
  final int incomePence;
  final int expensePence;
  final int profitPence;
  final String invoicedFormatted;
  final String collectedFormatted;
  final String incomeFormatted;
  final String expenseFormatted;
  final String profitFormatted;

  String get shortLabel {
    final parts = label.split(' ');
    return parts.isEmpty ? label : parts.first;
  }

  factory MonthlyCashPoint.fromJson(Map<String, dynamic> json) {
    return MonthlyCashPoint(
      month: asString(json['month']),
      label: asString(json['label']),
      invoicedPence: asInt(json['invoicedPence']),
      collectedPence: asInt(json['collectedPence']),
      incomePence: asInt(json['incomePence']),
      expensePence: asInt(json['expensePence']),
      profitPence: asInt(json['profitPence']),
      invoicedFormatted: asString(json['invoicedFormatted']),
      collectedFormatted: asString(json['collectedFormatted']),
      incomeFormatted: asString(json['incomeFormatted']),
      expenseFormatted: asString(json['expenseFormatted']),
      profitFormatted: asString(json['profitFormatted']),
    );
  }
}

class FunnelStage {
  FunnelStage({
    required this.key,
    required this.label,
    required this.valuePence,
    required this.valueFormatted,
  });

  final String key;
  final String label;
  final int valuePence;
  final String valueFormatted;

  factory FunnelStage.fromJson(Map<String, dynamic> json) {
    return FunnelStage(
      key: asString(json['key']),
      label: asString(json['label']),
      valuePence: asInt(json['valuePence']),
      valueFormatted: asString(json['valueFormatted']),
    );
  }
}

class AgedReceivables {
  AgedReceivables({
    required this.current,
    required this.d30,
    required this.d60,
    required this.d90,
    required this.raw,
    required this.overduePercent,
  });

  final String current;
  final String d30;
  final String d60;
  final String d90;
  final AgedReceivablesRaw raw;
  final int? overduePercent;

  factory AgedReceivables.empty() {
    return AgedReceivables(
      current: '£0.00',
      d30: '£0.00',
      d60: '£0.00',
      d90: '£0.00',
      raw: const AgedReceivablesRaw(current: 0, d30: 0, d60: 0, d90: 0),
      overduePercent: null,
    );
  }

  factory AgedReceivables.fromJson(Map<String, dynamic> json) {
    return AgedReceivables(
      current: asString(json['current'], '£0.00'),
      d30: asString(json['d30'], '£0.00'),
      d60: asString(json['d60'], '£0.00'),
      d90: asString(json['d90'], '£0.00'),
      raw: AgedReceivablesRaw.fromJson(asMap(json['raw'])),
      overduePercent:
          json['overduePercent'] == null ? null : asInt(json['overduePercent']),
    );
  }
}

class AgedReceivablesRaw {
  const AgedReceivablesRaw({
    required this.current,
    required this.d30,
    required this.d60,
    required this.d90,
  });

  final int current;
  final int d30;
  final int d60;
  final int d90;

  int get total => current + d30 + d60 + d90;

  factory AgedReceivablesRaw.fromJson(Map<String, dynamic> json) {
    return AgedReceivablesRaw(
      current: asInt(json['current']),
      d30: asInt(json['d30']),
      d60: asInt(json['d60']),
      d90: asInt(json['d90']),
    );
  }
}

class NamedSlice {
  NamedSlice({
    required this.name,
    required this.totalPence,
    required this.totalFormatted,
    required this.percent,
  });

  final String name;
  final int totalPence;
  final String totalFormatted;
  final int percent;

  factory NamedSlice.fromJson(
    Map<String, dynamic> json, {
    required String nameKey,
  }) {
    final pence = json.containsKey('grossPence')
        ? asInt(json['grossPence'])
        : asInt(json['totalPence']);
    final formatted = json['grossFormatted'] ?? json['totalFormatted'];
    return NamedSlice(
      name: asString(json[nameKey]),
      totalPence: pence,
      totalFormatted: asString(formatted),
      percent: asInt(json['percent']),
    );
  }
}

class SpendingSnapshotData {
  SpendingSnapshotData({
    required this.totalFormatted,
    required this.compareTotalFormatted,
    required this.trend,
    required this.periodLabel,
    required this.compareLabel,
    required this.currentSeries,
    required this.previousSeries,
  });

  final String totalFormatted;
  final String compareTotalFormatted;
  final String trend;
  final String periodLabel;
  final String compareLabel;
  final List<double> currentSeries;
  final List<double> previousSeries;

  factory SpendingSnapshotData.empty() {
    return SpendingSnapshotData(
      totalFormatted: '£0.00',
      compareTotalFormatted: '£0.00',
      trend: 'same',
      periodLabel: '',
      compareLabel: '',
      currentSeries: const [],
      previousSeries: const [],
    );
  }

  factory SpendingSnapshotData.fromJson(Map<String, dynamic> json) {
    final summary = asMap(json['summary']);
    final series = asList(json['series']).whereType<Map>().map(asMap).toList();
    return SpendingSnapshotData(
      totalFormatted: asString(summary['totalFormatted'], '£0.00'),
      compareTotalFormatted:
          asString(summary['compareTotalFormatted'], '£0.00'),
      trend: asString(summary['trend'], 'same'),
      periodLabel: asString(json['periodLabel']),
      compareLabel: asString(json['compareLabel']),
      currentSeries: series.map((p) => asDouble(p['currentPence'])).toList(),
      previousSeries: series.map((p) => asDouble(p['previousPence'])).toList(),
    );
  }
}

class AttentionData {
  AttentionData({
    required this.overdueInvoices,
    required this.expiringQuotes,
    required this.unreconciledCount,
    required this.pendingExpenses,
    required this.inboundEmailIssues,
    required this.reimbursableFormatted,
    required this.owedToMeFormatted,
    required this.winRatePercent,
    required this.unbilledFormatted,
    required this.recurringUpcomingFormatted,
    required this.dsoDays,
  });

  final List<AttentionInvoice> overdueInvoices;
  final List<AttentionQuote> expiringQuotes;
  final int unreconciledCount;
  final List<AttentionExpense> pendingExpenses;
  final List<AttentionEmailIssue> inboundEmailIssues;
  final String reimbursableFormatted;
  final String owedToMeFormatted;
  final int? winRatePercent;
  final String unbilledFormatted;
  final String recurringUpcomingFormatted;
  final int? dsoDays;

  int get urgentCount =>
      overdueInvoices.length +
      expiringQuotes.length +
      (unreconciledCount > 0 ? 1 : 0) +
      pendingExpenses.length +
      inboundEmailIssues.length;

  bool get allClear => urgentCount == 0;

  factory AttentionData.empty() {
    return AttentionData(
      overdueInvoices: const [],
      expiringQuotes: const [],
      unreconciledCount: 0,
      pendingExpenses: const [],
      inboundEmailIssues: const [],
      reimbursableFormatted: '£0.00',
      owedToMeFormatted: '£0.00',
      winRatePercent: null,
      unbilledFormatted: '£0.00',
      recurringUpcomingFormatted: '£0.00',
      dsoDays: null,
    );
  }

  factory AttentionData.fromJson(Map<String, dynamic> json) {
    return AttentionData(
      overdueInvoices: asList(json['overdueInvoices'])
          .whereType<Map>()
          .map((e) => AttentionInvoice.fromJson(asMap(e)))
          .toList(),
      expiringQuotes: asList(json['expiringQuotes'])
          .whereType<Map>()
          .map((e) => AttentionQuote.fromJson(asMap(e)))
          .toList(),
      unreconciledCount: asInt(json['unreconciledCount']),
      pendingExpenses: asList(json['pendingExpenses'])
          .whereType<Map>()
          .map((e) => AttentionExpense.fromJson(asMap(e)))
          .toList(),
      inboundEmailIssues: asList(json['inboundEmailIssues'])
          .whereType<Map>()
          .map((e) => AttentionEmailIssue.fromJson(asMap(e)))
          .toList(),
      reimbursableFormatted: asString(json['reimbursableFormatted'], '£0.00'),
      owedToMeFormatted: asString(json['owedToMeFormatted'], '£0.00'),
      winRatePercent:
          json['winRatePercent'] == null ? null : asInt(json['winRatePercent']),
      unbilledFormatted: asString(json['unbilledFormatted'], '£0.00'),
      recurringUpcomingFormatted:
          asString(json['recurringUpcomingFormatted'], '£0.00'),
      dsoDays: json['dsoDays'] == null ? null : asInt(json['dsoDays']),
    );
  }
}

class AttentionInvoice {
  AttentionInvoice({
    required this.id,
    required this.number,
    required this.clientName,
    required this.dueDate,
    required this.balanceFormatted,
  });

  final String id;
  final String number;
  final String clientName;
  final String? dueDate;
  final String balanceFormatted;

  factory AttentionInvoice.fromJson(Map<String, dynamic> json) {
    return AttentionInvoice(
      id: asString(json['id']),
      number: asString(json['number']),
      clientName: asString(json['clientName']),
      dueDate: json['dueDate'] as String?,
      balanceFormatted: asString(json['balanceFormatted']),
    );
  }
}

class AttentionQuote {
  AttentionQuote({
    required this.id,
    required this.number,
    required this.clientName,
    required this.validUntil,
    required this.grossFormatted,
  });

  final String id;
  final String number;
  final String clientName;
  final String validUntil;
  final String grossFormatted;

  factory AttentionQuote.fromJson(Map<String, dynamic> json) {
    return AttentionQuote(
      id: asString(json['id']),
      number: asString(json['number']),
      clientName: asString(json['clientName']),
      validUntil: asString(json['validUntil']),
      grossFormatted: asString(json['grossFormatted']),
    );
  }
}

class AttentionExpense {
  AttentionExpense({
    required this.id,
    required this.description,
    required this.submitterLabel,
    required this.amountFormatted,
  });

  final String id;
  final String description;
  final String submitterLabel;
  final String amountFormatted;

  factory AttentionExpense.fromJson(Map<String, dynamic> json) {
    return AttentionExpense(
      id: asString(json['id']),
      description: asString(json['description']),
      submitterLabel: asString(json['submitterLabel']),
      amountFormatted: asString(json['amountFormatted']),
    );
  }
}

class AttentionEmailIssue {
  AttentionEmailIssue({
    required this.id,
    required this.subject,
    required this.fromEmail,
    required this.attempts,
    required this.lastError,
  });

  final String id;
  final String subject;
  final String fromEmail;
  final int attempts;
  final String? lastError;

  factory AttentionEmailIssue.fromJson(Map<String, dynamic> json) {
    return AttentionEmailIssue(
      id: asString(json['id']),
      subject: asString(json['subject'], '(no subject)'),
      fromEmail: asString(json['fromEmail']),
      attempts: asInt(json['attempts']),
      lastError: json['lastError'] as String?,
    );
  }
}
