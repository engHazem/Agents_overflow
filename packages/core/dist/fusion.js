/**
 * Reciprocal Rank Fusion (DESIGN.md §3.4).
 *
 * FTS returns a term-frequency score, vector search returns a cosine
 * similarity. The two numbers are in incompatible units, so averaging them is
 * meaningless — rank position is the only quantity both produce that can be
 * compared. RRF therefore ignores scores entirely and fuses on position.
 */
/**
 * The standard constant from the original paper. It flattens the contribution
 * curve so placing first in one list cannot dominate placing consistently well
 * in both. Not a tuning knob — leave it alone.
 */
export const RRF_K = 60;
/**
 * Fuses ranked id lists into one ordering.
 *
 * The behaviour that makes this worth doing: a candidate appearing in *both*
 * lists at middling positions outranks one that placed first in only a single
 * list. FTS and vector search fail in uncorrelated ways — FTS misses
 * paraphrases, vector search blurs exact version numbers and identifiers — so
 * agreement between them is real signal, while a lone hit is more likely to be
 * that method's characteristic false positive.
 */
export function reciprocalRankFusion(lists, k = RRF_K) {
    const accumulated = new Map();
    for (const [source, ids] of Object.entries(lists)) {
        if (!ids)
            continue;
        ids.forEach((id, index) => {
            const rank = index + 1;
            const existing = accumulated.get(id) ?? { ranks: {}, score: 0 };
            // A list should not be able to reward the same id twice.
            if (existing.ranks[source] !== undefined)
                return;
            existing.ranks[source] = rank;
            existing.score += 1 / (k + rank);
            accumulated.set(id, existing);
        });
    }
    return [...accumulated.entries()]
        .map(([id, { ranks, score }]) => ({
        id,
        ranks,
        rrfScore: score,
        matchedBy: Object.keys(ranks).sort(),
    }))
        .sort((a, b) => b.rrfScore - a.rrfScore || a.id.localeCompare(b.id));
}
/**
 * Scales fused scores into 0..1 so the blend can weight them against other
 * signals. Relative order is preserved; only the range changes.
 *
 * Min-max, deliberately, not divide-by-max. RRF at k=60 is intentionally flat:
 * rank 1 scores 1/61 and rank 20 scores 1/80, so dividing by the maximum leaves
 * the whole candidate set compressed into roughly 0.76..1.0. After the 0.75
 * relevance weight that is a spread of about 0.18 — smaller than the 0.20 the
 * confidence term can swing.
 *
 * The observable effect was that verification evidence outvoted relevance
 * outright: a well-confirmed CORS solution ranked above the correct answer for
 * a database-connection query, simply because it had more confirmations.
 * Confidence is meant to break ties between comparably relevant results, not to
 * decide the ordering.
 *
 * Rescaling across the observed range restores that: relevance uses its full
 * weight, and confidence adjusts within it.
 */
export function normalizeRrfScores(candidates) {
    const out = new Map();
    if (candidates.length === 0)
        return out;
    let min = Infinity;
    let max = -Infinity;
    for (const c of candidates) {
        if (c.rrfScore < min)
            min = c.rrfScore;
        if (c.rrfScore > max)
            max = c.rrfScore;
    }
    const range = max - min;
    // A single candidate, or a set that somehow tied exactly, is maximally
    // relevant by definition — there is nothing to discriminate between.
    if (range <= 0) {
        for (const c of candidates)
            out.set(c.id, 1);
        return out;
    }
    for (const c of candidates)
        out.set(c.id, (c.rrfScore - min) / range);
    return out;
}
//# sourceMappingURL=fusion.js.map