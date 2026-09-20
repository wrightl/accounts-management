import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../../../data/models/dashboard.dart';
import 'dashboard_card.dart';

class LabeledBarRow {
  const LabeledBarRow({
    required this.label,
    required this.formatted,
    required this.value,
    required this.color,
  });

  final String label;
  final String formatted;
  final int value;
  final Color color;
}

class LabeledBarList extends StatelessWidget {
  const LabeledBarList({super.key, required this.rows});

  final List<LabeledBarRow> rows;

  @override
  Widget build(BuildContext context) {
    final max = rows.fold<int>(0, (acc, r) => r.value > acc ? r.value : acc);
    if (max <= 0) {
      return const SizedBox.shrink();
    }

    return Column(
      children: [
        for (final row in rows)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        row.label,
                        style: Theme.of(context).textTheme.bodySmall,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Text(
                      row.formatted,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: LinearProgressIndicator(
                    value: (row.value / max).clamp(0.04, 1),
                    minHeight: 8,
                    backgroundColor: BrandColors.wash,
                    color: row.color,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class MonthlySeriesChart extends StatelessWidget {
  const MonthlySeriesChart({
    super.key,
    required this.points,
    required this.series,
  });

  final List<MonthlyCashPoint> points;
  final List<MonthlySeriesSpec> series;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 180,
      child: CustomPaint(
        painter: _MonthlySeriesPainter(points: points, series: series),
        child: const SizedBox.expand(),
      ),
    );
  }
}

class MonthlySeriesSpec {
  const MonthlySeriesSpec({
    required this.color,
    required this.values,
    this.line = false,
  });

  final Color color;
  final List<int> Function(MonthlyCashPoint point) values;
  final bool line;
}

class _MonthlySeriesPainter extends CustomPainter {
  _MonthlySeriesPainter({required this.points, required this.series});

  final List<MonthlyCashPoint> points;
  final List<MonthlySeriesSpec> series;

  @override
  void paint(Canvas canvas, Size size) {
    if (points.isEmpty) return;

    const labelHeight = 18.0;
    final chartHeight = size.height - labelHeight;
    final barSeries = series.where((s) => !s.line).toList();
    final lineSeries = series.where((s) => s.line).toList();

    var maxVal = 1;
    for (final point in points) {
      for (final spec in series) {
        for (final v in spec.values(point)) {
          if (v.abs() > maxVal) maxVal = v.abs();
        }
      }
    }

    final groupWidth = size.width / points.length;
    final barSlot = barSeries.isEmpty ? groupWidth : groupWidth / (barSeries.length + 0.6);

    for (var i = 0; i < points.length; i++) {
      final point = points[i];
      final groupX = i * groupWidth;
      for (var s = 0; s < barSeries.length; s++) {
        final value = barSeries[s].values(point).first;
        final h = (value.abs() / maxVal) * (chartHeight - 4);
        final x = groupX + barSlot * 0.3 + s * barSlot;
        final rect = Rect.fromLTWH(
          x,
          chartHeight - h,
          barSlot * 0.85,
          h,
        );
        canvas.drawRRect(
          RRect.fromRectAndRadius(rect, const Radius.circular(3)),
          Paint()..color = barSeries[s].color,
        );
      }

      final showLabel = points.length <= 6 || i % 2 == 0 || i == points.length - 1;
      if (showLabel) {
        final tp = TextPainter(
          text: TextSpan(
            text: point.shortLabel,
            style: const TextStyle(fontSize: 10, color: BrandColors.muted),
          ),
          textDirection: TextDirection.ltr,
        )..layout(maxWidth: groupWidth);
        tp.paint(
          canvas,
          Offset(groupX + (groupWidth - tp.width) / 2, chartHeight + 4),
        );
      }
    }

    for (final spec in lineSeries) {
      final path = Path();
      final paint = Paint()
        ..color = spec.color
        ..strokeWidth = 2
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round;
      for (var i = 0; i < points.length; i++) {
        final value = spec.values(points[i]).first;
        final x = i * groupWidth + groupWidth / 2;
        final y = chartHeight - (value.abs() / maxVal) * (chartHeight - 4);
        if (i == 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      }
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _MonthlySeriesPainter oldDelegate) {
    return oldDelegate.points != points || oldDelegate.series != series;
  }
}

class ChartLegend extends StatelessWidget {
  const ChartLegend({super.key, required this.items});

  final List<(Color, String)> items;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 12,
      runSpacing: 4,
      children: [
        for (final item in items)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: item.$1,
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
              const SizedBox(width: 6),
              Text(item.$2, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
      ],
    );
  }
}

class CashVsInvoicedCard extends StatelessWidget {
  const CashVsInvoicedCard({super.key, required this.data});

  final List<MonthlyCashPoint> data;

  @override
  Widget build(BuildContext context) {
    final hasData = data.any(
      (p) => p.invoicedPence > 0 || p.collectedPence > 0 || p.profitPence != 0,
    );

    return DashboardCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const DashboardSectionTitle(
            title: 'Cash vs invoiced',
            subtitle: 'Last 12 months · bars are invoices raised; line is cash collected',
          ),
          const SizedBox(height: 12),
          if (!hasData)
            Text(
              'No invoicing or payments in the last year yet.',
              style: Theme.of(context).textTheme.bodySmall,
            )
          else ...[
            MonthlySeriesChart(
              points: data,
              series: [
                MonthlySeriesSpec(
                  color: BrandColors.periwinkle,
                  values: (p) => [p.invoicedPence],
                ),
                MonthlySeriesSpec(
                  color: BrandColors.navy,
                  values: (p) => [p.collectedPence],
                  line: true,
                ),
              ],
            ),
            const SizedBox(height: 8),
            const ChartLegend(
              items: [
                (BrandColors.periwinkle, 'Invoiced'),
                (BrandColors.navy, 'Collected'),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class IncomeExpenseCard extends StatelessWidget {
  const IncomeExpenseCard({super.key, required this.data});

  final List<MonthlyCashPoint> data;

  @override
  Widget build(BuildContext context) {
    final hasData = data.any((p) => p.incomePence > 0 || p.expensePence > 0);

    return DashboardCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const DashboardSectionTitle(
            title: 'Income vs expenses',
            subtitle: 'Last 12 months · accrual income (ex VAT)',
          ),
          const SizedBox(height: 12),
          if (!hasData)
            Text(
              'No invoiced income or expenses in this period.',
              style: Theme.of(context).textTheme.bodySmall,
            )
          else ...[
            MonthlySeriesChart(
              points: data,
              series: [
                MonthlySeriesSpec(
                  color: BrandColors.periwinkle,
                  values: (p) => [p.incomePence],
                ),
                MonthlySeriesSpec(
                  color: BrandColors.pink,
                  values: (p) => [p.expensePence],
                ),
                MonthlySeriesSpec(
                  color: BrandColors.navy,
                  values: (p) => [p.profitPence],
                  line: true,
                ),
              ],
            ),
            const SizedBox(height: 8),
            const ChartLegend(
              items: [
                (BrandColors.periwinkle, 'Income'),
                (BrandColors.pink, 'Expenses'),
                (BrandColors.navy, 'Profit'),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
