import 'package:intl/intl.dart';
import '../constants/app_constants.dart';

class CurrencyUtils {
  static String formatPence(int pence) {
    final pounds = pence / 100;
    return '${AppConstants.currencySymbol}${pounds.toStringAsFixed(2)}';
  }
  
  static String formatPounds(double pounds) {
    return '${AppConstants.currencySymbol}${pounds.toStringAsFixed(2)}';
  }
  
  static int poundsToPence(double pounds) {
    return (pounds * 100).round();
  }
  
  static double penceToPounds(int pence) {
    return pence / 100;
  }
}

class DateUtils {
  static String formatDate(DateTime date) {
    return DateFormat('dd MMM yyyy').format(date);
  }
  
  static String formatDateTime(DateTime dateTime) {
    return DateFormat('dd MMM yyyy HH:mm').format(dateTime);
  }
  
  static String formatRelativeDate(DateTime date) {
    final now = DateTime.now();
    final difference = now.difference(date);
    
    if (difference.inDays == 0) {
      if (difference.inHours == 0) {
        return '${difference.inMinutes} minutes ago';
      }
      return '${difference.inHours} hours ago';
    } else if (difference.inDays == 1) {
      return 'Yesterday';
    } else if (difference.inDays < 7) {
      return '${difference.inDays} days ago';
    } else {
      return formatDate(date);
    }
  }
}

class ValidationUtils {
  static bool isValidEmail(String email) {
    return RegExp(r'^[a-zA-Z0-9.]+@[a-zA-Z0-9]+\.[a-zA-Z]+').hasMatch(email);
  }
  
  static bool isValidAmount(String amount) {
    return RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(amount);
  }
}
