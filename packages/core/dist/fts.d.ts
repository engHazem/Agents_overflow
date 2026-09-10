/**
 * Building the full-text query.
 *
 * Postgres' `websearch_to_tsquery` and `plainto_tsquery` both AND their terms
 * together. Feeding either an entire normalized stack trace produces a query
 * demanding that all forty-odd terms appear in one document, which matches
 * nothing — the failure is silent and looks exactly like an empty corpus.
 *
 * So the query is built explicitly as a disjunction: extract the informative
 * tokens, OR them, and let `ts_rank_cd` sort by how many matched and how well.
 * Recall comes from the OR, precision comes from the ranking, and fusion with
 * vector search cleans up what remains.
 */
/**
 * Splits text into tsquery-safe lexemes.
 *
 * Everything that is not alphanumeric or `_` becomes a separator, which also
 * neutralises the tsquery metacharacters (`&`, `|`, `!`, `:`, `*`, parentheses)
 * — the terms are structurally incapable of carrying an injection rather than
 * being escaped after the fact.
 */
export declare function tokenizeForTsQuery(text: string): string[];
/**
 * Returns an OR-joined `to_tsquery` expression, or `null` when the text yields
 * no usable terms — in which case the caller must skip full-text search rather
 * than run a query that errors on an empty string.
 *
 * **Terms are taken from the error message first, not the stack frames.**
 *
 * Frames are mechanics. A Node trace contributes `tcpconnectwrap`,
 * `afterconnect`, `oncomplete`, `node_modules`, `lib`, `net` and so on — tokens
 * that appear in *every* document holding a Node stack trace, which in a corpus
 * of JavaScript errors is most of them. Measured on a Postgres `ECONNREFUSED`
 * query, frame noise made up ten of eleven terms and ranked the correct
 * document 15th of 16, behind unrelated entries that happened to share the word
 * `connect`.
 *
 * Selecting by line rather than by a stopword list matters: `module` is pure
 * noise inside `at Module._load`, but it is the entire signal in "Cannot find
 * module". A blanket stopword cannot tell those apart; the line it came from
 * can.
 */
export declare function buildTsQuery(text: string): string | null;
//# sourceMappingURL=fts.d.ts.map