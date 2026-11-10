// Store screenshots from the real screens with fixture data: no Clerk, no
// server. Run through scripts/screenshots.sh, which picks the devices and
// where the PNGs go.
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:alfa/core/theme/app_theme.dart';
import 'package:alfa/data/api/api_client.dart';
import 'package:alfa/features/auth/auth_provider.dart';
import 'package:alfa/features/books/books_provider.dart';
import 'package:alfa/features/dashboard/dashboard_provider.dart';
import 'package:alfa/features/expenses/expense_provider.dart';
import 'package:alfa/features/expenses/screens/expense_capture_screen.dart';
import 'package:alfa/features/notifications/notification_provider.dart';
import 'package:alfa/shared/widgets/home_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';

import 'fixtures/demo_books.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('store screenshots', (tester) async {
    final receipt = await _drawReceipt();
    final receiptFile = File('${(await getTemporaryDirectory()).path}/receipt.png');
    await receiptFile.writeAsBytes(receipt);
    ApiClient.adapterOverride = FixtureAdapter(receiptImage: receipt);

    final auth = AuthProvider();
    await auth.validateToken();
    final navigator = GlobalKey<NavigatorState>();

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider.value(value: auth),
          ChangeNotifierProvider(create: (_) => DashboardProvider()),
          ChangeNotifierProvider(create: (_) => ExpenseProvider()),
          ChangeNotifierProvider(create: (_) => BooksProvider()),
          ChangeNotifierProvider(create: (_) => NotificationProvider()),
        ],
        child: MaterialApp(
          navigatorKey: navigator,
          theme: AppTheme.lightTheme,
          debugShowCheckedModeBanner: false,
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: const [Locale('en', 'GB')],
          home: const HomeScreen(),
          routes: {
            '/expenses/capture': (context) => const ExpenseCaptureScreen(),
          },
        ),
      ),
    );

    if (Platform.isAndroid) await binding.convertFlutterSurfaceToImage();

    Future<void> shot(String name) async {
      await _settle(tester);
      await binding.takeScreenshot(name);
    }

    Future<void> tapText(String text) async {
      await tester.tap(find.text(text).last);
      await _settle(tester);
    }

    // Pages under the top route stay offstage until the pop has run a frame.
    Future<void> back() async {
      navigator.currentState!.pop();
      await _settle(tester);
    }

    await shot('01_overview');

    await tapText('Expenses');
    await shot('02_expenses');

    await tapText('Train to Manchester');
    await shot('03_expense_detail');
    await back();

    navigator.currentState!.push(
      MaterialPageRoute<void>(
        builder: (_) => ExpenseCaptureScreen(initialReceipt: XFile(receiptFile.path)),
      ),
    );
    await shot('04_capture');
    await back();

    await tapText('Sales');
    await shot('05_invoices');

    await tapText('More');
    await tapText('Weekly close');
    await shot('06_weekly_close');
    await back();

    await tapText('AI bookkeeper');
    await shot('07_ai_bookkeeper');

    ApiClient.adapterOverride = null;
  });
}

/// Let fixture requests finish and animations end. Some screens keep a
/// spinner going, so give up waiting after a few seconds rather than fail.
Future<void> _settle(WidgetTester tester) async {
  try {
    await tester.pumpAndSettle(
      const Duration(milliseconds: 100),
      EnginePhase.sendSemanticsUpdate,
      const Duration(seconds: 5),
    );
  } on FlutterError {
    await tester.pump(const Duration(milliseconds: 500));
  }
}

/// A till receipt, drawn rather than shipped as a binary.
Future<Uint8List> _drawReceipt() async {
  const width = 600.0;
  const height = 900.0;
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder)
    ..drawColor(const Color(0xFFE7E3DA), BlendMode.src)
    ..drawRect(
      const Rect.fromLTWH(60, 40, width - 120, height - 80),
      Paint()..color = const Color(0xFFFFFFFF),
    );

  var y = 80.0;
  void line(String text, {double size = 22, bool bold = false, TextAlign align = TextAlign.left}) {
    final builder = ui.ParagraphBuilder(ui.ParagraphStyle(textAlign: align, fontSize: size))
      ..pushStyle(ui.TextStyle(
        color: const Color(0xFF222222),
        fontWeight: bold ? FontWeight.bold : FontWeight.normal,
        fontFamily: 'Courier',
      ))
      ..addText(text);
    final paragraph = builder.build()..layout(const ui.ParagraphConstraints(width: width - 180));
    canvas.drawParagraph(paragraph, Offset(90, y));
    y += paragraph.height + 12;
  }

  line('PRET A MANGER', size: 34, bold: true, align: TextAlign.center);
  line("King's Cross, London N1", align: TextAlign.center);
  line('VAT no. 123 4567 89', size: 18, align: TextAlign.center);
  y += 24;
  line('06/11/2026  12:41');
  y += 12;
  line('Chicken Caesar baguette   6.45');
  line('Flat white                3.60');
  line('Hummus & veg wrap         4.80');
  y += 12;
  line('TOTAL                    14.85', bold: true);
  line('VAT @ 20%                 2.48');
  y += 24;
  line('CARD  **** 4421', size: 18);
  line('Thank you', align: TextAlign.center);

  final image = await recorder.endRecording().toImage(width.toInt(), height.toInt());
  final png = await image.toByteData(format: ui.ImageByteFormat.png);
  return png!.buffer.asUint8List();
}
