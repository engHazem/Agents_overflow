import { customType } from 'drizzle-orm/pg-core';

/**
 * Postgres `tsvector`. Drizzle has no built-in mapping for it.
 *
 * Always populated as a generated column so the search document cannot drift
 * out of sync with the text it indexes — the failure mode where a row is
 * updated but its `tsvector` is not is silent and effectively undebuggable.
 */
export const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  },
});
