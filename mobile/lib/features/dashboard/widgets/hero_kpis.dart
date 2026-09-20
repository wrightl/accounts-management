import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../../../data/models/dashboard.dart';
import 'dashboard_card.dart';
import 'sparkline.dart';

class HeroKpiGrid extends StatelessWidget {
  const HeroKpiGrid({super.key, required this.heroes});

  final List<HeroKpi> heroes;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 640;
        if (wide) {
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var i = 0; i < heroes.length; i++) ...[
                if (i > 0) const SizedBox(width: 12),
                Expanded(child: HeroKpiCard(hero: heroes[i])),
              ],
            ],
          );
        }

        final rows = <Widget>[];
        for (var i = 0; i < heroes.length; i += 2) {
          if (i > 0) rows.add(const SizedBox(height: 12));
          final second = i + 1 < heroes.length ? heroes[i + 1] : null;
          rows.add(
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: HeroKpiCard(hero: heroes[i])),
                if (second != null) ...[
                  const SizedBox(width: 12),
                  Expanded(child: HeroKpiCard(hero: second)),
                ],
              ],
            ),
          );
        }
        return Column(children: rows);
      },
    );
  }
}

class HeroKpiCard extends StatelessWidget {
  const HeroKpiCard({super.key, required this.hero});

  final HeroKpi hero;

  @override
  Widget build(BuildContext context) {
    final deltaColor = switch (hero.delta.direction) {
      'up' => BrandColors.success,
      'down' => BrandColors.destructive,
      _ => BrandColors.muted,
    };

    return DashboardCard(
      destructive: hero.isDestructive,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  hero.title,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
              Sparkline(
                values: hero.sparkline,
                color: hero.isDestructive
                    ? BrandColors.destructive
                    : BrandColors.periwinkle,
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            hero.value,
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontFeatures: const [FontFeature.tabularFigures()],
                  color: hero.isDestructive
                      ? BrandColors.destructive
                      : BrandColors.navy,
                ),
          ),
          const SizedBox(height: 6),
          Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: hero.delta.label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: deltaColor,
                  ),
                ),
                TextSpan(
                  text: ' ${hero.delta.caption}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: BrandColors.muted,
                  ),
                ),
              ],
            ),
          ),
          if (hero.subtitle != null) ...[
            const SizedBox(height: 8),
            Text(
              hero.subtitle!,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          if (hero.insight != null) ...[
            const SizedBox(height: 4),
            Text(
              hero.insight!,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    fontSize: 11,
                  ),
            ),
          ],
        ],
      ),
    );
  }
}
