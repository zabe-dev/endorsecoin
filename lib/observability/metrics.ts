import 'server-only';

type MetricValue = string | number | boolean | null | undefined;
type MetricFields = Record<string, MetricValue>;

type MetricAggregate = {
  name: string;
  tags: Record<string, string>;
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
  lastDurationMs: number | null;
  lastAt: string;
};

const metricsState = globalThis as typeof globalThis & {
  endorsecoinMetrics?: Map<string, MetricAggregate>;
};

const maxMetrics = Number(process.env.METRICS_MAX_SERIES || 250);

export function recordMetric(name: string, fields: MetricFields = {}) {
  const { durationMs, ...tagFields } = fields;
  const tags = normalizeTags(tagFields);
  const key = `${name}:${JSON.stringify(tags)}`;
  const metrics = getMetricsMap();
  const measuredDurationMs =
    typeof durationMs === 'number' && Number.isFinite(durationMs) ? durationMs : null;
  const existing =
    metrics.get(key) ||
    ({
      name,
      tags,
      count: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      lastDurationMs: null,
      lastAt: new Date(0).toISOString(),
    } satisfies MetricAggregate);

  existing.count += 1;
  existing.lastAt = new Date().toISOString();
  existing.lastDurationMs = measuredDurationMs;
  if (measuredDurationMs !== null) {
    existing.totalDurationMs += measuredDurationMs;
    existing.maxDurationMs = Math.max(existing.maxDurationMs, measuredDurationMs);
  }

  if (!metrics.has(key) && metrics.size >= maxMetrics) pruneOldestMetric(metrics);
  metrics.set(key, existing);
  logMetric(name, {
    ...tags,
    ...(measuredDurationMs === null ? {} : { durationMs: measuredDurationMs }),
  });
}

export async function timeAsync<T>(
  name: string,
  fields: MetricFields,
  callback: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    const value = await callback();
    recordMetric(name, {
      ...fields,
      outcome: 'success',
      durationMs: Math.round(performance.now() - start),
    });
    return value;
  } catch (error) {
    recordMetric(name, {
      ...fields,
      outcome: 'error',
      durationMs: Math.round(performance.now() - start),
    });
    throw error;
  }
}

export function getMetricsSnapshot() {
  return Array.from(getMetricsMap().values())
    .map((metric) => ({
      ...metric,
      avgDurationMs: metric.count ? Math.round(metric.totalDurationMs / metric.count) : 0,
    }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

function getMetricsMap() {
  metricsState.endorsecoinMetrics ||= new Map<string, MetricAggregate>();
  return metricsState.endorsecoinMetrics;
}

function normalizeTags(fields: MetricFields) {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value).slice(0, 120)])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function pruneOldestMetric(metrics: Map<string, MetricAggregate>) {
  const [oldestKey] = Array.from(metrics.entries()).sort(([, a], [, b]) =>
    a.lastAt.localeCompare(b.lastAt),
  )[0] || [null];
  if (oldestKey) metrics.delete(oldestKey);
}

function logMetric(name: string, fields: Record<string, string | number>) {
  if (process.env.METRICS_LOGS !== 'true') return;
  console.info(`[metrics] ${JSON.stringify({ name, ...fields })}`);
}
