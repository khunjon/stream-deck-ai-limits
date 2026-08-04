/**
 * Reset-countdown key: time remaining until the Claude limits reset, with the 5-hour (session)
 * window as the hero and the 7-day (weekly) window on a small second line. Unlike the gauge
 * renderers, this one foregrounds *time left*, not percentage used.
 */
import type { UsageSnapshot } from "../providers/types.ts";
import { formatCountdown } from "../utils/time.ts";
import { escapeXml, SIZE } from "./svg.ts";

const FONT = "-apple-system, Helvetica, Arial, sans-serif";
const BG = "#1c1c1e";
const HERO = "#f2f2f7"; // primary time-left
const ACCENT = "#d97757"; // Claude orange (window labels)
const MUTED = "#8e8e93"; // weekly line / hints
const DIVIDER = "#3a3a3c";

/** Render the reset countdown. `now` is injectable for deterministic tests. */
export function renderResetCountdownIcon(snapshot: UsageSnapshot, now: Date = new Date()): string {
	const session = formatCountdown(snapshot.session.resetAt, now);
	const weekly = formatCountdown(snapshot.weekly.resetAt, now);

	// No usable data — show a short reason instead of a blank key.
	if (!session && !weekly) {
		const msg =
			snapshot.status === "auth_required"
				? "Log in"
				: snapshot.status === "rate_limited"
					? "Rate…"
					: "No data";
		return frame(
			`<text x="72" y="66" fill="${ACCENT}" font-family="${FONT}" font-size="20" font-weight="800" text-anchor="middle">5H</text>` +
				`<text x="72" y="98" fill="${MUTED}" font-family="${FONT}" font-size="16" font-weight="600" text-anchor="middle">${escapeXml(msg)}</text>`,
		);
	}

	const hero = session ?? "—";
	// Shrink the hero font as the string grows ("42m" vs "7h 58m").
	const heroSize = hero.length >= 6 ? 28 : hero.length >= 4 ? 33 : 40;
	const staleDot = snapshot.stale
		? `<circle cx="${SIZE - 11}" cy="11" r="3.5" fill="${MUTED}"><title>stale</title></circle>`
		: "";

	return frame(
		staleDot +
			`<text x="72" y="36" fill="${ACCENT}" font-family="${FONT}" font-size="19" font-weight="800" text-anchor="middle" letter-spacing="1.5">5H</text>` +
			`<text x="72" y="80" fill="${HERO}" font-family="${FONT}" font-size="${heroSize}" font-weight="800" text-anchor="middle">${escapeXml(hero)}</text>` +
			`<line x1="30" y1="96" x2="114" y2="96" stroke="${DIVIDER}" stroke-width="2"/>` +
			`<text x="72" y="122" fill="${HERO}" font-family="${FONT}" font-size="22" font-weight="700" text-anchor="middle">` +
			`<tspan fill="${ACCENT}" font-size="17">7D</tspan>  ${escapeXml(weekly ?? "—")}</text>`,
	);
}

function frame(inner: string): string {
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
		`<rect width="${SIZE}" height="${SIZE}" rx="20" fill="${BG}"/>` +
		inner +
		`</svg>`
	);
}
