import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';

class Sparkline extends StatelessWidget {
  const Sparkline({
    super.key,
    required this.values,
    this.color = BrandColors.periwinkle,
    this.width = 64,
    this.height = 24,
  });

  final List<double> values;
  final Color color;
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size(width, height),
      painter: _SparklinePainter(values: values, color: color),
    );
  }
}

class DualSparkline extends StatelessWidget {
  const DualSparkline({
    super.key,
    required this.primary,
    required this.secondary,
    this.height = 88,
  });

  final List<double> primary;
  final List<double> secondary;
  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      width: double.infinity,
      child: CustomPaint(
        painter: _DualSparklinePainter(
          primary: primary,
          secondary: secondary,
        ),
      ),
    );
  }
}

class _SparklinePainter extends CustomPainter {
  _SparklinePainter({required this.values, required this.color});

  final List<double> values;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.75
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    if (values.isEmpty || values.every((v) => v == 0)) {
      paint.color = BrandColors.muted.withValues(alpha: 0.4);
      canvas.drawLine(
        Offset(0, size.height / 2),
        Offset(size.width, size.height / 2),
        paint,
      );
      return;
    }

    final min = values.reduce((a, b) => a < b ? a : b);
    final max = values.reduce((a, b) => a > b ? a : b);
    final range = (max - min).abs() < 0.0001 ? 1.0 : max - min;
    final path = Path();
    for (var i = 0; i < values.length; i++) {
      final x = values.length == 1 ? 0.0 : i / (values.length - 1) * size.width;
      final y = size.height - ((values[i] - min) / range) * (size.height - 2) - 1;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _SparklinePainter oldDelegate) {
    return oldDelegate.values != values || oldDelegate.color != color;
  }
}

class _DualSparklinePainter extends CustomPainter {
  _DualSparklinePainter({required this.primary, required this.secondary});

  final List<double> primary;
  final List<double> secondary;

  @override
  void paint(Canvas canvas, Size size) {
    final all = [...primary, ...secondary];
    if (all.isEmpty) return;
    final min = all.reduce((a, b) => a < b ? a : b);
    final max = all.reduce((a, b) => a > b ? a : b);
    final range = (max - min).abs() < 0.0001 ? 1.0 : max - min;

    void draw(List<double> values, Color color, double width) {
      if (values.isEmpty) return;
      final paint = Paint()
        ..color = color
        ..strokeWidth = width
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round;
      final path = Path();
      for (var i = 0; i < values.length; i++) {
        final x =
            values.length == 1 ? 0.0 : i / (values.length - 1) * size.width;
        final y =
            size.height - ((values[i] - min) / range) * (size.height - 2) - 1;
        if (i == 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      }
      canvas.drawPath(path, paint);
    }

    draw(secondary, BrandColors.muted.withValues(alpha: 0.45), 1.5);
    draw(primary, BrandColors.navy, 2);
  }

  @override
  bool shouldRepaint(covariant _DualSparklinePainter oldDelegate) {
    return oldDelegate.primary != primary || oldDelegate.secondary != secondary;
  }
}
