import test from "node:test";
import assert from "node:assert/strict";

import { normalizeClaudeUsage } from "../src/providers/claude/claude-normalizer.ts";
import type { ClaudeUsageResponse } from "../src/providers/claude/claude-types.ts";
import type { UsageSnapshot } from "../src/providers/types.ts";
import { formatCredits, renderCreditsIcon } from "../src/render/credits-icon.ts";

const NOW = new Date("2026-05-30T12:00:00.000Z");

function normalize(raw: ClaudeUsageResponse) {
	return normalizeClaudeUsage(raw, undefined, NOW);
}

function snapshot(partial: Partial<UsageSnapshot> = {}): UsageSnapshot {
	return {
		provider: "claude",
		session: { usedPercent: 20, resetAt: null },
		weekly: { usedPercent: 40, resetAt: null },
		status: "ok",
		updatedAt: NOW.toISOString(),
		stale: false,
		...partial,
	};
}

// --- normalizer: extra_usage → credits ---

test("credits: absent extra_usage → snapshot omits credits", () => {
	const snap = normalize({ five_hour: { utilization: 10 } });
	assert.equal(snap.credits, undefined);
});

test("credits: disabled block (live observed shape) → enabled false, all null", () => {
	const snap = normalize({
		extra_usage: {
			is_enabled: false,
			monthly_limit: null,
			used_credits: null,
			utilization: null,
			currency: null,
			decimal_places: null,
		},
	});
	assert.deepEqual(snap.credits, {
		enabled: false,
		usedPercent: null,
		used: null,
		limit: null,
		currency: null,
	});
});

test("credits: enabled block converts minor units via decimal_places", () => {
	const snap = normalize({
		extra_usage: {
			is_enabled: true,
			monthly_limit: 5000,
			used_credits: 1234,
			utilization: 24.7,
			currency: "USD",
			decimal_places: 2,
		},
	});
	assert.deepEqual(snap.credits, {
		enabled: true,
		usedPercent: 25,
		used: 12.34,
		limit: 50,
		currency: "USD",
	});
});

test("credits: missing decimal_places passes amounts through unchanged", () => {
	const snap = normalize({
		extra_usage: { is_enabled: true, used_credits: 12.5, monthly_limit: 50, utilization: 25 },
	});
	assert.equal(snap.credits?.used, 12.5);
	assert.equal(snap.credits?.limit, 50);
});

test("credits: non-numeric junk never throws, becomes null", () => {
	const snap = normalize({
		extra_usage: {
			is_enabled: true,
			used_credits: "many" as unknown as number,
			monthly_limit: Number.NaN,
			utilization: Number.POSITIVE_INFINITY,
			decimal_places: -1,
		},
	});
	assert.deepEqual(snap.credits, {
		enabled: true,
		usedPercent: null,
		used: null,
		limit: null,
		currency: null,
	});
});

test("credits: never affect overall snapshot status", () => {
	const snap = normalize({
		five_hour: { utilization: 10 },
		seven_day: { utilization: 10 },
		extra_usage: { is_enabled: true, utilization: 99 },
	});
	assert.equal(snap.status, "ok");
});

// --- formatCredits ---

test("formatCredits: USD symbol, cents shown for fractional amounts", () => {
	assert.equal(formatCredits(12.34, "USD"), "$12.34");
	assert.equal(formatCredits(50, "USD"), "$50");
	assert.equal(formatCredits(1250, "USD"), "$1.3k");
});

test("formatCredits: unknown currency falls back to code suffix", () => {
	assert.equal(formatCredits(12.5, "CHF"), "12.50 CHF");
	assert.equal(formatCredits(null, "USD"), null);
});

// --- renderer ---

test("renders OFF state when credits are disabled", () => {
	const svg = renderCreditsIcon(
		snapshot({
			credits: { enabled: false, usedPercent: null, used: null, limit: null, currency: null },
		}),
	);
	assert.match(svg, /<svg[\s\S]*<\/svg>/);
	assert.match(svg, />OFF</);
	assert.match(svg, />Credits</);
});

test("renders OFF state when snapshot has no credits at all", () => {
	const svg = renderCreditsIcon(snapshot());
	assert.match(svg, />OFF</);
});

test("renders meter with spend, cap and threshold color when enabled", () => {
	const svg = renderCreditsIcon(
		snapshot({
			credits: { enabled: true, usedPercent: 75, used: 37.5, limit: 50, currency: "USD" },
		}),
	);
	assert.match(svg, /\$37\.50/);
	assert.match(svg, /of \$50\/mo/);
	assert.match(svg, /#ffd60a/); // warning accent at 75% with default thresholds
});

test("meter never leaks NaN/undefined into the SVG", () => {
	const svg = renderCreditsIcon(
		snapshot({
			credits: { enabled: true, usedPercent: null, used: null, limit: null, currency: null },
		}),
	);
	assert.doesNotMatch(svg, /NaN|undefined/);
});

test("error statuses render the message layout", () => {
	const svg = renderCreditsIcon(snapshot({ status: "auth_required" }));
	assert.match(svg, />Login</);
	assert.match(svg, />Required</);
});
