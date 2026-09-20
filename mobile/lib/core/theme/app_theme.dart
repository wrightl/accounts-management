import 'package:flutter/material.dart';

/// Dot+Dash Consulting tokens, matching `src/app/globals.css`.
class BrandColors {
  BrandColors._();

  static const Color navy = Color(0xFF171D3A);
  static const Color pink = Color(0xFFF598FF);
  static const Color periwinkle = Color(0xFF94ABF9);
  static const Color wash = Color(0xFFE5E9FD);
  static const Color background = Color(0xFFF3F5FD);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color muted = Color(0xFF5C6490);
  static const Color border = Color(0x1F171D3A);
  static const Color destructive = Color(0xFFC23B5A);
  static const Color success = Color(0xFF1A7A55);
}

class AppTheme {
  static const Color primaryColor = BrandColors.navy;
  static const Color secondaryColor = BrandColors.periwinkle;
  static const Color errorColor = BrandColors.destructive;
  static const Color warningColor = Color(0xFFF59E0B);
  static const Color successColor = BrandColors.success;

  static const Color backgroundColor = BrandColors.background;
  static const Color surfaceColor = BrandColors.surface;
  static const Color textPrimaryColor = BrandColors.navy;
  static const Color textSecondaryColor = BrandColors.muted;

  static ThemeData lightTheme = ThemeData(
    useMaterial3: true,
    colorScheme: const ColorScheme.light(
      primary: BrandColors.navy,
      secondary: BrandColors.periwinkle,
      error: BrandColors.destructive,
      surface: BrandColors.surface,
      onPrimary: Colors.white,
      onSecondary: BrandColors.navy,
      onError: Colors.white,
      onSurface: BrandColors.navy,
      onSurfaceVariant: BrandColors.muted,
    ),
    scaffoldBackgroundColor: BrandColors.background,
    appBarTheme: const AppBarTheme(
      elevation: 0,
      backgroundColor: BrandColors.surface,
      foregroundColor: BrandColors.navy,
      centerTitle: false,
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: BrandColors.border),
      ),
      color: BrandColors.surface,
      margin: EdgeInsets.zero,
    ),
    chipTheme: ChipThemeData(
      selectedColor: BrandColors.navy,
      backgroundColor: BrandColors.surface,
      side: const BorderSide(color: BrandColors.border),
      labelStyle: const TextStyle(color: BrandColors.muted, fontSize: 13),
      secondaryLabelStyle: const TextStyle(color: Colors.white, fontSize: 13),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 0),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: BrandColors.navy,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: BrandColors.wash.withValues(alpha: 0.35),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: BrandColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: BrandColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: BrandColors.navy, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: BrandColors.destructive),
      ),
    ),
    textTheme: const TextTheme(
      displayLarge: TextStyle(
        fontSize: 32,
        fontWeight: FontWeight.bold,
        color: BrandColors.navy,
      ),
      displayMedium: TextStyle(
        fontSize: 28,
        fontWeight: FontWeight.bold,
        color: BrandColors.navy,
      ),
      displaySmall: TextStyle(
        fontSize: 24,
        fontWeight: FontWeight.bold,
        color: BrandColors.navy,
      ),
      headlineMedium: TextStyle(
        fontSize: 20,
        fontWeight: FontWeight.w600,
        color: BrandColors.navy,
      ),
      titleLarge: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w600,
        color: BrandColors.navy,
      ),
      titleMedium: TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w500,
        color: BrandColors.navy,
      ),
      bodyLarge: TextStyle(
        fontSize: 16,
        color: BrandColors.navy,
      ),
      bodyMedium: TextStyle(
        fontSize: 14,
        color: BrandColors.navy,
      ),
      bodySmall: TextStyle(
        fontSize: 12,
        color: BrandColors.muted,
      ),
    ),
  );
}
