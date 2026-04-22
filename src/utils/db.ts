/**
 * Database client interface abstraction.
 * Concrete implementation uses `pg` (node-postgres).
 * Tests inject a mock that satisfies this interface.
 */
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

export interface DbClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;

  transaction<T = void>(
    callback: (trx: DbClient) => Promise<T>,
  ): Promise<T>;
}

/**
 * Placeholder db singleton — in production this is wired to a real pg Pool.
 * Import this in modules that need a concrete client at runtime.
 * Replace / overwrite this export via dependency injection in tests.
 */
export const db: DbClient = {
  query: async (sql: string, _params?: unknown[]) => {
    throw new Error(
      `db.query called without a real database connection. sql="${sql}"`,
    );
  },
  transaction: async <T>(_callback: (trx: DbClient) => Promise<T>): Promise<T> => {
    throw new Error('db.transaction called without a real database connection.');
  },
};
