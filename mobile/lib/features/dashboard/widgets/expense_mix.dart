import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../../../data/models/dashboard.dart';
import 'dashboard_card.dart';

const _mixColors = [
  BrandColors.periwinkle,
  BrandColors.navy,
  BrandColors.pink,
  Color(0xFF7B8FD4),
  BrandColors.muted,
  BrandColors.destructive,
];

class ExpenseMixCard extends StatelessWidget {
  const ExpenseMixCard({
    super.key,
    required this.slices,
    required this.periodLabel,
  });

  final List<NamedSlice> slices;
  final String periodLabel;

  @override
  Widget build(BuildContext context) {
    final shown = slices.take(4).toList();

    return DashboardCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          DashboardSectionTitle(
            title: 'Expense mix',
            subtitle: 'By category · $periodLabel · ex VAT',
          ),
          const SizedBox(height: 16),
          if (slices.isEmpty)
            Text(
              'No expenses in this period.',
              style: Theme.of(context).textTheme.bodySmall,
            )
          else ...[
            Center(
              child: SizedBox(
                width: 128,
                height: 128,
                child: CustomPaint(
                  painter: _DonutPainter(slices: slices),
                ),
              ),
            ),
            const SizedBox(height: 12),
            for (var i = 0; i < shown.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  children: [
                    Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: _mixColors[i % _mixColors.length],
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        shown[i].name,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                    Text(
                      shown[i].totalFormatted,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                    ),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _DonutPainter extends CustomPainter {
  _DonutPainter({required this.slices});

  final List<NamedSlice> slices;

  @override
  void paint(Canvas canvas, Size size) {
    final total = slices.fold<int>(0, (acc, s) => acc + s.totalPence);
    if (total <= 0) return;
    final rect = Rect.fromCircle(
      center: Offset(size.width / 2, size.height / 2),
      radius: size.shortestSide / 2 - 12,
    );
    var start = -math.pi / 2;
    for (var i = 0; i < slices.length; i++) {
      final sweep = (slices[i].totalPence / total) * 2 * math.pi;
      canvas.drawArc(
        rect,
        start,
        sweep,
        false,
        Paint()
          ..color = _mixColors[i % _mixColors.length]
          ..style = PaintingStyle.stroke
          ..strokeWidth = 22
          ..strokeCap = StrokeCap.butt,
      );
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(covariant _DonutPainter oldDelegate) {
    return oldDelegate.slices != slices;
  }
}
