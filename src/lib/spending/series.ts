export interface SpendingSeriesPoint {
  key: string;
  label: string;
  currentDate: string | null;
  compareDate: string | null;
  currentPence: number;
  previousPence: number;
}

/** Running totals for aligned period series. */
export function toCumulativeSeries(points: SpendingSeriesPoint[]): SpendingSeriesPoint[] {
  let currentRun = 0;
  let previousRun = 0;
  return points.map((point) => {
    currentRun += point.currentPence;
    previousRun += point.previousPence;
    return {
      ...point,
      currentPence: currentRun,
      previousPence: previousRun,
    };
  });
}
