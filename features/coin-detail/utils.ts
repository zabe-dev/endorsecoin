import type { ChartPoint } from './types';

export function makeChartPath(points: ChartPoint[]) {
  if (points.length < 2) return '';
  const sampled = points.filter(
    (_, index) => index % Math.max(1, Math.floor(points.length / 180)) === 0,
  );
  const prices = sampled.map((point) => point.price);
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  const spread = maximum - minimum || 1;
  return sampled
    .map((point, index) => {
      const x = (index / (sampled.length - 1)) * 900;
      const y = 280 - ((point.price - minimum) / spread) * 250;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}
