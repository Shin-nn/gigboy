/**
 * True when `err` is a unique / primary-key constraint violation, from either backend:
 * Postgres reports SQLSTATE 23505; libsql reports extendedCode SQLITE_CONSTRAINT_UNIQUE or
 * SQLITE_CONSTRAINT_PRIMARYKEY. Follows `cause` in case a driver wraps the original error.
 */
export function isUniqueViolation(err: unknown): boolean {
  for (let e = err, depth = 0; typeof e === 'object' && e !== null && depth < 5; depth++) {
    const { code, extendedCode, message } = e as { code?: unknown; extendedCode?: unknown; message?: unknown };
    if (code === '23505') return true;
    if (extendedCode === 'SQLITE_CONSTRAINT_UNIQUE' || extendedCode === 'SQLITE_CONSTRAINT_PRIMARYKEY') return true;
    if (code === 'SQLITE_CONSTRAINT' && typeof message === 'string' && /UNIQUE constraint failed/i.test(message)) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
