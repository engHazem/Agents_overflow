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
import { isStackFrame } from './normalize/frames.js';
/**
 * Deliberately short. These carry no signal in error text but appear in nearly
 * every trace, so leaving them in flattens the ranking.
 */
const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'this', 'that', 'these',
    'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to', 'of', 'in',
    'on', 'at', 'by', 'for', 'with', 'from', 'as', 'it', 'its', 'not', 'no',
    'you', 'your', 'we', 'our', 'can', 'will', 'has', 'have', 'had', 'do', 'does',
    'did', 'while', 'when', 'where', 'which', 'what', 'there', 'here', 'line',
    'col', 'path', 'url', 'addr', 'uuid', 'hash', 'timestamp', 'port', 'pid',
]);
/** Beyond this the tail terms contribute noise rather than recall. */
const MAX_TERMS = 25;
/** Single characters and most two-character fragments are noise in traces. */
const MIN_TERM_LENGTH = 3;
/**
 * Splits text into tsquery-safe lexemes.
 *
 * Everything that is not alphanumeric or `_` becomes a separator, which also
 * neutralises the tsquery metacharacters (`&`, `|`, `!`, `:`, `*`, parentheses)
 * — the terms are structurally incapable of carrying an injection rather than
 * being escaped after the fact.
 */
export function tokenizeForTsQuery(text) {
    const seen = new Set();
    const terms = [];
    for (const rawToken of text.toLowerCase().split(/[^a-z0-9_]+/)) {
        if (rawToken.length < MIN_TERM_LENGTH)
            continue;
        if (STOPWORDS.has(rawToken))
            continue;
        // Bare numbers rarely identify an error once versions are extracted.
        if (/^\d+$/.test(rawToken))
            continue;
        if (seen.has(rawToken))
            continue;
        seen.add(rawToken);
        terms.push(rawToken);
        if (terms.length >= MAX_TERMS)
            break;
    }
    return terms;
}
/**
 * Frames are added back only when the message yields fewer than this.
 *
 * Deliberately low. A message like "connect ECONNREFUSED" produces just three
 * terms, but one of them is a specific error code — that is a *better* query
 * than the same three plus eight tokens of frame machinery. The fallback is for
 * a bare `Error` with no message at all, not for a short but specific one.
 */
const MIN_MESSAGE_TERMS = 3;
/**
 * Cap on terms borrowed from frames. Enough to identify the throw site, few
 * enough that generic frame vocabulary cannot outweigh the message.
 */
const MAX_FRAME_TERMS = 8;
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
export function buildTsQuery(text) {
    const lines = text.split('\n');
    const message = lines.filter((line) => !isStackFrame(line)).join('\n');
    const frames = lines.filter((line) => isStackFrame(line)).join('\n');
    const terms = tokenizeForTsQuery(message);
    if (terms.length < MIN_MESSAGE_TERMS && frames.length > 0) {
        const seen = new Set(terms);
        let borrowed = 0;
        for (const term of tokenizeForTsQuery(frames)) {
            if (seen.has(term))
                continue;
            terms.push(term);
            borrowed += 1;
            if (borrowed >= MAX_FRAME_TERMS || terms.length >= MAX_TERMS)
                break;
        }
    }
    return terms.length === 0 ? null : terms.join(' | ');
}
//# sourceMappingURL=fts.js.map