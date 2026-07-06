/**
 * Provider-agnostic usage model.
 *
 * Every provider (Claude now, Codex later) normalizes its raw API response into a
 * {@link UsageSnapshot}. The renderer and cache only ever see this shape — they have no
 * knowledge of provider-specific fields.
 */

export type UsageProvider = "claude" | "codex";

/**
 * Overall key status, derived from the worst of the two usage windows plus error conditions.
 * Drives both the color and the layout chosen by the renderer.
 */
export type UsageStatus =
	| "ok"
	| "warning"
	| "critical"
	| "limited"
	| "stale"
	| "auth_required"
	| "rate_limited"
	| "error";

/**
 * A single usage window (e.g. Claude's 5-hour session or 7-day weekly limit).
 */
export interface UsageWindow {
	/** Percentage used, 0..100, rounded to an integer. `null` when unknown/missing. */
	usedPercent: number | null;
	/** ISO timestamp of when this window resets. `null` when unknown/missing. */
	resetAt: string | null;
}

/**
 * Fully normalized usage result for one provider, ready for rendering and caching.
 */
export interface UsageSnapshot {
	provider: UsageProvider;
	/** Short window — Claude: `five_hour`. */
	session: UsageWindow;
	/** Long window — Claude: `seven_day`. */
	weekly: UsageWindow;
	status: UsageStatus;
	/** ISO timestamp of when this snapshot was produced. */
	updatedAt: string;
	/** True when this is the last-known-good snapshot served after a failed refresh. */
	stale: boolean;
	/**
	 * When `stale` is true, why the refresh failed — lets the renderer show a specific hint
	 * (e.g. a rate-limit clock) instead of a generic "STALE" marker.
	 */
	staleReason?: "rate_limited" | "error";
	/** Human-readable, secret-free error detail for diagnostics. */
	errorMessage?: string;
	/**
	 * Thresholds used to compute statuses, so the renderer can color each bar by its own
	 * percentage. Defaults to {@link DEFAULT_THRESHOLDS} when absent.
	 */
	thresholds?: StatusThresholds;
	/**
	 * Pay-as-you-go usage credits, when the provider reports them (Claude: `extra_usage`).
	 * Absent when the provider has no credits concept; `enabled: false` when the account has
	 * the feature turned off. Consumed only by the credits action — the combined and
	 * single-window renderers ignore it.
	 */
	credits?: CreditsInfo;
}

/**
 * Normalized usage-credits state (e.g. Claude "extra usage").
 *
 * Monetary values are in **major units** (e.g. dollars) — the normalizer applies the
 * provider's minor-unit conversion. Any field can be `null`: the endpoint reports `null`
 * values while the feature is disabled, and the enabled shape is unofficial.
 */
export interface CreditsInfo {
	enabled: boolean;
	/** Percentage of the monthly credit cap used, 0..100 rounded. */
	usedPercent: number | null;
	/** Credits consumed this month, in major units. */
	used: number | null;
	/** Monthly credit cap, in major units. */
	limit: number | null;
	/** ISO 4217 currency code, e.g. `"USD"`. */
	currency: string | null;
}

/**
 * Default thresholds (used-percent) for mapping a window to a status. Configurable later via
 * Property Inspector (Phase 8).
 */
export interface StatusThresholds {
	/** At or above this percent → `warning`. */
	warning: number;
	/** At or above this percent → `critical`. */
	critical: number;
}

export const DEFAULT_THRESHOLDS: StatusThresholds = {
	warning: 70,
	critical: 90,
};

/** Options for a usage fetch. */
export interface GetUsageOptions {
	/** Bypass the cache TTL and fetch now (key press). */
	force?: boolean;
}

/**
 * A provider orchestrates credentials → fetch → normalize → cache for one AI tool and always
 * resolves to a {@link UsageSnapshot} — it never throws, surfacing failures as error/stale
 * statuses so the action/renderer can always draw something.
 */
export interface Provider {
	getUsage(options?: GetUsageOptions): Promise<UsageSnapshot>;
}
