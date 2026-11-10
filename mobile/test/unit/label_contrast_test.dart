import 'dart:math' as math;

import 'package:alfa/features/expenses/widgets/expense_labels.dart';
import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';

/// WCAG 2 contrast ratio between two opaque colours.
double contrast(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

void main() {
  // Small text (10–12px), so AA for normal text.
  const minimum = 4.5;

  test('every label chip is readable', () {
    for (final MapEntry(key: name, value: colors) in labelChipColors.entries) {
      expect(
        contrast(colors.foreground, colors.background),
        greaterThanOrEqualTo(minimum),
        reason: name,
      );
    }
  });

  test('every status chip is readable', () {
    for (final MapEntry(key: status, value: colors) in statusChipColors.entries) {
      expect(
        contrast(colors.foreground, colors.background),
        greaterThanOrEqualTo(minimum),
        reason: status,
      );
    }
  });

  test('unknown colours fall back to slate', () {
    expect(labelChipColor('mauve'), labelChipColors['slate']);
    expect(statusChipColor('draft'), labelChipColors['slate']);
  });
}
