import { statusForPercent } from "../providers/status.ts";
import type { CreditsInfo, UsageSnapshot, UsageStatus } from "../providers/types.ts";
import { DEFAULT_THRESHOLDS } from "../providers/types.ts";
import { paletteForStatus, providerColors, type Palette } from "./colors.ts";
import { SIZE, escapeXml } from "./svg.ts";

const FONT = "Helvetica, Arial, sans-serif";

/**
 * Render the usage-credits key ("extra usage") for a snapshot.
 *
 * Three layouts:
 *  - **message** (full-key text) for `auth_required`, `rate_limited`, `error`;
 *  - **off** (muted "Credits OFF") when the account has the feature disabled — deliberately
 *    quiet so the key reads as ambient state, not an alarm;
 *  - **meter** (spent amount, bar, monthly cap) when enabled, colored by the same
 *    warning/critical thresholds as the usage bars.
 */
export function renderCreditsIcon(snapshot: UsageSnapshot): string {
	const status = snapshot.status;

	if (status === "auth_required" || status === "rate_limited" || status === "error") {
		return renderMessage(status);
	}

	const credits = snapshot.credits;
	if (!credits || !credits.enabled) {
		return renderOff(snapshot.stale);
	}
	return renderMeter(credits, snapshot);
}

/**
 * Format a major-unit amount for the key, e.g. `$12.34`, `$1.2k`, `€5`. Unknown currencies
 * fall back to the ISO code as a suffix (`12.34 CHF`). Amounts are kept short — a 144px key
 * has no room for cents on large numbers.
 */
export function formatCredits(amount: number | null, currency: string | null): string | null {
	if (amount === null) {
		return null;
	}
	const abs = Math.abs(amount);
	const text =
		abs >= 1000
			? `${(amount / 1000).toFixed(1).replace(/\.0$/, "")}k`
			: Number.isInteger(amount)
				? String(amount)
				: amount.toFixed(2);
	const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : null;
	if (symbol) {
		return `${symbol}${text}`;
	}
	return currency ? `${text} ${currency}` : text;
}

/** Muted "off" state: the feature exists but isn't enabled on this account. */
function renderOff(stale: boolean): string {
	const palette = paletteForStatus("ok");
	const claude = providerColors("claude");
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${palette.background}"/>
  <text x="${SIZE / 2}" y="40" text-anchor="middle" font-family="${FONT}" font-size="20" font-weight="700" fill="${claude.accent}">Credits</text>
  <text x="${SIZE / 2}" y="88" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="700" fill="${palette.textMuted}">OFF</text>
  <text x="${SIZE / 2}" y="120" text-anchor="middle" font-family="${FONT}" font-size="15" fill="${palette.textMuted}">extra usage</text>
  ${staleDot(stale, palette)}
</svg>`;
}

/** Enabled state: spent amount on top, threshold-colored bar, monthly cap underneath. */
function renderMeter(credits: CreditsInfo, snapshot: UsageSnapshot): string {
	const thresholds = snapshot.thresholds ?? DEFAULT_THRESHOLDS;
	const percent = credits.usedPercent;
	const barStatus: UsageStatus = percent === null ? "ok" : statusForPercent(percent, thresholds);
	const accent = paletteForStatus(barStatus).accent;
	const palette = paletteForStatus(snapshot.stale ? "stale" : "ok");
	const claude = providerColors("claude");

	const used = formatCredits(credits.used, credits.currency) ?? "—";
	const cap = formatCredits(credits.limit, credits.currency);
	const capLine = cap ? `of ${cap}/mo` : percent !== null ? `${percent}% used` : "";

	const barW = SIZE - 28;
	const fillW = percent === null ? 0 : Math.round((barW * Math.max(0, Math.min(100, percent))) / 100);

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${palette.background}"/>
  <text x="${SIZE / 2}" y="34" text-anchor="middle" font-family="${FONT}" font-size="18" font-weight="700" fill="${claude.accent}">Credits</text>
  <text x="${SIZE / 2}" y="72" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="700" fill="${palette.text}">${escapeXml(used)}</text>
  <rect x="14" y="88" width="${barW}" height="12" rx="6" fill="${palette.track}"/>
  ${fillW > 0 ? `<rect x="14" y="88" width="${fillW}" height="12" rx="6" fill="${accent}"/>` : ""}
  <text x="${SIZE / 2}" y="124" text-anchor="middle" font-family="${FONT}" font-size="16" fill="${palette.textMuted}">${escapeXml(capLine)}</text>
  ${staleDot(snapshot.stale, palette)}
</svg>`;
}

/** Full-key message for error-class statuses, matching the other renderers' framing. */
function renderMessage(status: UsageStatus): string {
	const palette = paletteForStatus(status);
	const lines =
		status === "auth_required"
			? ["Credits", "Login", "Required"]
			: status === "rate_limited"
				? ["Credits", "Rate", "Limited"]
				: ["Credits", "Error"];
	const startY = SIZE / 2 - ((lines.length - 1) * 26) / 2;
	const text = lines
		.map(
			(line, i) =>
				`<text x="${SIZE / 2}" y="${startY + i * 26 + 8}" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="700" fill="${palette.text}">${escapeXml(line)}</text>`,
		)
		.join("\n  ");
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${palette.background}"/>
  <rect x="6" y="6" width="${SIZE - 12}" height="${SIZE - 12}" rx="12" fill="none" stroke="${palette.accent}" stroke-width="4"/>
  ${text}
</svg>`;
}

function staleDot(stale: boolean, palette: Palette): string {
	return stale
		? `<circle cx="${SIZE - 9}" cy="9" r="3" fill="${palette.textMuted}"><title>stale</title></circle>`
		: "";
}
