import 'package:flutter_test/flutter_test.dart';
import 'package:ddapp_mobile/core/utils/formatters.dart';

void main() {
  group('CurrencyUtils', () {
    test('formatPence converts pence to formatted pounds', () {
      expect(CurrencyUtils.formatPence(1000), '£10.00');
      expect(CurrencyUtils.formatPence(1050), '£10.50');
      expect(CurrencyUtils.formatPence(99), '£0.99');
      expect(CurrencyUtils.formatPence(0), '£0.00');
    });

    test('formatPounds formats pounds correctly', () {
      expect(CurrencyUtils.formatPounds(10.5), '£10.50');
      expect(CurrencyUtils.formatPounds(0.99), '£0.99');
      expect(CurrencyUtils.formatPounds(1000.0), '£1000.00');
    });

    test('poundsToPence converts pounds to pence', () {
      expect(CurrencyUtils.poundsToPence(10.5), 1050);
      expect(CurrencyUtils.poundsToPence(0.99), 99);
      expect(CurrencyUtils.poundsToPence(1000.0), 100000);
    });

    test('penceToPounds converts pence to pounds', () {
      expect(CurrencyUtils.penceToPounds(1050), 10.5);
      expect(CurrencyUtils.penceToPounds(99), 0.99);
      expect(CurrencyUtils.penceToPounds(100000), 1000.0);
    });
  });

  group('ValidationUtils', () {
    test('isValidEmail validates email addresses', () {
      expect(ValidationUtils.isValidEmail('test@example.com'), true);
      expect(ValidationUtils.isValidEmail('user.name@domain.co.uk'), true);
      expect(ValidationUtils.isValidEmail('invalid'), false);
      expect(ValidationUtils.isValidEmail('test@'), false);
      expect(ValidationUtils.isValidEmail('@example.com'), false);
    });

    test('isValidAmount validates amount strings', () {
      expect(ValidationUtils.isValidAmount('10.50'), true);
      expect(ValidationUtils.isValidAmount('0.99'), true);
      expect(ValidationUtils.isValidAmount('1000'), true);
      expect(ValidationUtils.isValidAmount('10.5'), true);
      expect(ValidationUtils.isValidAmount('abc'), false);
      expect(ValidationUtils.isValidAmount('10.999'), false);
      expect(ValidationUtils.isValidAmount('-10'), false);
    });
  });

  group('DateUtils', () {
    test('formatDate formats date correctly', () {
      final date = DateTime(2024, 3, 15);
      expect(DateUtils.formatDate(date), '15 Mar 2024');
    });

    test('formatDateTime formats datetime correctly', () {
      final dateTime = DateTime(2024, 3, 15, 14, 30);
      expect(DateUtils.formatDateTime(dateTime), '15 Mar 2024 14:30');
    });
  });
}
