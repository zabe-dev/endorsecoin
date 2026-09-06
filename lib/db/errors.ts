export function isMissingRelationError(error: unknown, relationName?: string) {
  const postgresError = findPostgresError(error);
  if (postgresError?.code !== '42P01') return false;
  if (!relationName) return true;

  return (
    postgresError.table === relationName || postgresError.message?.includes(`"${relationName}"`)
  );
}

function findPostgresError(
  error: unknown,
): { code?: string; table?: string; message?: string } | null {
  if (!error || typeof error !== 'object') return null;

  const candidate = error as {
    code?: string;
    table?: string;
    message?: string;
    cause?: unknown;
  };

  if (candidate.code) return candidate;
  return findPostgresError(candidate.cause);
}
