/**
 * Path parameter checks.
 *
 * Every id in this API is a uuid, and Postgres raises a syntax error on
 * anything that is not one. Unguarded, that surfaced as a 500 whose body
 * contained the failing SQL and its parameters — an internal error where the
 * honest answer is "no such thing", and a query shape handed to the caller for
 * free.
 *
 * So this is checked in the route, before the database is touched: a bad id is
 * a `404`, because from the caller's side an id that cannot exist and an id
 * that does not exist are the same fact.
 */
export declare function isUuid(value: string): boolean;
/** The body every route sends for an id that cannot resolve. */
export declare function notFound(what: string): {
    readonly error: "not_found";
    readonly message: `${string} does not exist`;
};
//# sourceMappingURL=params.d.ts.map