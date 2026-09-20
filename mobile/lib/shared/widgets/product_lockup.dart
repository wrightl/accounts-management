import 'package:flutter/material.dart';

class ProductLockup extends StatelessWidget {
  const ProductLockup({super.key, this.imageSize = 80});

  final double imageSize;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Image.asset(
          'assets/images/logo.png',
          width: imageSize,
          height: imageSize,
          errorBuilder: (_, __, ___) => Icon(
            Icons.crop_square,
            size: imageSize,
            color: Theme.of(context).colorScheme.primary,
          ),
        ),
        SizedBox(height: imageSize >= 72 ? 24 : 16),
        Text(
          'Alfa',
          style: Theme.of(context).textTheme.headlineMedium,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          'by Dot+Dash',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                letterSpacing: 1.4,
              ),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}
