import { worstStatus } from "../status.ts";
import type { CreditsInfo, StatusThresholds, UsageSnapshot, UsageWindow } from "../types.ts";
import { DEFAULT_THRESHOLDS } from "../types.ts";
import type { ClaudeExtraUsage, ClaudeUsageResponse, ClaudeUsageWindow } from "./claude-types.ts";

/**
 * Convert a raw Claude usage window into the normalized {@link UsageWindow}.
 *
 * `utilization` is a 0..100 percentage (confirmed in Phase 4); it is clamped to that range and
 * rounded to an integer. Missing/invalid values become `null` so the renderer can show a dash
 * instead of crashing.
 */
function normalizeWindow(window: ClaudeUsageWindow | null | undefined): UsageWindow {
	const util = window?.utilization;
	const usedPercent =
		typeof util === "number" && Number.isFinite(util) ? Math.max(0, Math.min(100, Math.round(util))) : null;
	const resetAt = typeof window?.resets_at === "string" ? window.resets_at : null;
	return { usedPercent, resetAt };
}

/** A finite number, or `null` for anything else. */
function finiteOrNull(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Convert a minor-unit amount (e.g. cents) to major units using `decimal_places`. When
 * `decimal_places` is absent the value is passed through unchanged — better to show the raw
 * number than to guess a conversion for an unofficial field.
 */
function toMajorUnits(amount: number | null, decimalPlaces: number | null): number | null {
	if (amount === null) {
		return null;
	}
	if (decimalPlaces === null || !Number.isInteger(decimalPlaces) || decimalPlaces < 0) {
		return amount;
	}
	return amount / 10 ** decimalPlaces;
}

/**
 * Normalize the raw `extra_usage` block into {@link CreditsInfo}. Absent block → `undefined`
 * (the snapshot omits credits entirely); a present block always yields a value, with `null`s
 * where the endpoint reports nothing (typical while the feature is disabled).
 */
function normalizeCredits(extra: ClaudeExtraUsage | null | undefined): CreditsInfo | undefined {
	if (extra === null || extra === undefined) {
		return undefined;
	}
	const util = finiteOrNull(extra.utilization);
	const decimalPlaces = finiteOrNull(extra.decimal_places);
	return {
		enabled: extra.is_enabled === true,
		usedPercent: util === null ? null : Math.max(0, Math.min(100, Math.round(util))),
		used: toMajorUnits(finiteOrNull(extra.used_credits), decimalPlaces),
		limit: toMajorUnits(finiteOrNull(extra.monthly_limit), decimalPlaces),
		currency: typeof extra.currency === "string" ? extra.currency : null,
	};
}

/**
 * Normalize a raw Claude usage response into a provider-agnostic {@link UsageSnapshot}.
 *
 * Mapping: `five_hour → session`, `seven_day → weekly`, `extra_usage → credits`. The overall
 * status is the worse of the two windows (via {@link worstStatus}); credits never affect the
 * status (they're informational, consumed only by the credits action); an incomplete response
 * never throws.
 */
export function normalizeClaudeUsage(
	raw: ClaudeUsageResponse,
	thresholds: StatusThresholds = DEFAULT_THRESHOLDS,
	now: Date = new Date(),
): UsageSnapshot {
	const session = normalizeWindow(raw.five_hour);
	const weekly = normalizeWindow(raw.seven_day);

	return {
		provider: "claude",
		session,
		weekly,
		status: worstStatus(session, weekly, thresholds),
		updatedAt: now.toISOString(),
		stale: false,
		thresholds,
		credits: normalizeCredits(raw.extra_usage),
	};
}
