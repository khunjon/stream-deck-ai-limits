/**
 * Raw shape of the Claude usage endpoint response (`GET /api/oauth/usage`).
 *
 * Confirmed by a live request (Phase 4):
 *  - `utilization` is a 0..100 percentage (e.g. 86), NOT a 0..1 fraction.
 *  - `resets_at` is an ISO-8601 timestamp string.
 *  - `five_hour` and `seven_day` are the windows we consume; many sibling windows
 *    (`seven_day_opus`, `seven_day_sonnet`, ...) exist but are often `null`.
 *
 * Everything is optional/nullable on purpose: this is an unofficial endpoint and fields may be
 * absent or change. The normalizer (Phase 5) defends against missing data.
 */

export interface ClaudeUsageWindow {
	/** Percentage used, 0..100. */
	utilization?: number | null;
	/** ISO timestamp of when the window resets. */
	resets_at?: string | null;
}

/**
 * Raw shape of the `extra_usage` block: pay-as-you-go usage credits that cover you past the
 * plan limits. Observed live (2026-07) with the feature disabled — all value fields were
 * `null`, so the enabled-state field semantics (units of `used_credits`, meaning of
 * `decimal_places`) are inferred and defended against accordingly.
 */
export interface ClaudeExtraUsage {
	is_enabled?: boolean | null;
	/** Monthly credit cap, in the currency's minor units when `decimal_places` is set. */
	monthly_limit?: number | null;
	/** Credits consumed this month, same units as `monthly_limit`. */
	used_credits?: number | null;
	/** Percentage used, 0..100 (matches the window fields' convention). */
	utilization?: number | null;
	/** ISO 4217 code, e.g. `"USD"`. */
	currency?: string | null;
	/** Number of minor-unit digits (e.g. 2 → `used_credits` of 1234 is $12.34). */
	decimal_places?: number | null;
}

export interface ClaudeUsageResponse {
	five_hour?: ClaudeUsageWindow | null;
	seven_day?: ClaudeUsageWindow | null;
	// Known sibling windows — not consumed by the MVP, kept for documentation/forward-compat.
	seven_day_opus?: ClaudeUsageWindow | null;
	seven_day_sonnet?: ClaudeUsageWindow | null;
	seven_day_oauth_apps?: ClaudeUsageWindow | null;
	/** Pay-as-you-go usage credits — consumed by the Claude Credits action. */
	extra_usage?: ClaudeExtraUsage | null;
}
