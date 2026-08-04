import { action, SingletonAction } from "@elgato/streamdeck";
import type {
	DidReceiveSettingsEvent,
	KeyAction,
	KeyDownEvent,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";

import { getSharedCache } from "../cache/ttl-cache.ts";
import { ClaudeProvider } from "../providers/claude/claude-provider.ts";
import type { Provider, UsageSnapshot } from "../providers/types.ts";
import { renderResetCountdownIcon } from "../render/reset-countdown-icon.ts";
import { toDataUrl } from "../render/svg.ts";
import {
	resolveUsageSettings,
	sameResolvedSettings,
	type ResolvedUsageSettings,
	type UsageActionSettings,
} from "../settings/usage-settings.ts";
import { logger } from "../utils/logger.ts";

/** Countdown redraw cadence (no network) so the "7h 58m" text ticks down smoothly. */
const COUNTDOWN_REDRAW_MS = 60_000;

interface KeyRuntime {
	action: KeyAction;
	provider: Provider;
	usageConfig: ResolvedUsageSettings;
	/** Data refresh timer (network, at the configured interval). */
	dataTimer: ReturnType<typeof setInterval>;
	/** Countdown redraw timer (cache only, every minute). */
	tickTimer: ReturnType<typeof setInterval>;
	/** Last snapshot, reused by the countdown redraw without re-fetching. */
	lastSnapshot: UsageSnapshot | null;
}

/**
 * Reset-countdown action: shows the *time remaining* until the Claude limits reset — the 5-hour
 * (session) window big, the 7-day (weekly) window small. It shares the Claude provider's cache
 * with the other Claude keys, so it adds no extra API calls at the same refresh interval.
 */
@action({ UUID: "com.singerous.ai-limits.reset-countdown" })
export class ResetCountdownAction extends SingletonAction<UsageActionSettings> {
	private readonly instances = new Map<string, KeyRuntime>();

	override async onWillAppear(ev: WillAppearEvent<UsageActionSettings>): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		const runtime = this.ensureRuntime(ev.action, ev.payload.settings);
		await this.refresh(runtime, { force: false });
		this.startTimers(runtime);
	}

	override onWillDisappear(ev: WillDisappearEvent<UsageActionSettings>): void {
		const runtime = this.instances.get(ev.action.id);
		if (runtime) {
			clearInterval(runtime.dataTimer);
			clearInterval(runtime.tickTimer);
			this.instances.delete(ev.action.id);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<UsageActionSettings>): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		const runtime = this.ensureRuntime(ev.action, ev.payload.settings);
		await this.refresh(runtime, { force: true });
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<UsageActionSettings>): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		const runtime = this.ensureRuntime(ev.action, ev.payload.settings);
		this.startTimers(runtime);
		await this.refresh(runtime, { force: false });
	}

	private ensureRuntime(keyAction: KeyAction, rawSettings: UsageActionSettings): KeyRuntime {
		const usageConfig = resolveUsageSettings(rawSettings);
		const existing = this.instances.get(keyAction.id);

		if (!existing || !sameResolvedSettings(existing.usageConfig, usageConfig)) {
			if (existing) {
				clearInterval(existing.dataTimer);
				clearInterval(existing.tickTimer);
			}
			const runtime: KeyRuntime = {
				action: keyAction,
				provider: new ClaudeProvider({
					cache: getSharedCache("claude", usageConfig.intervalSec * 1000, usageConfig),
					thresholds: usageConfig.thresholds,
					customCredentialsPath: usageConfig.customCredentialsPath,
					logger,
				}),
				usageConfig,
				dataTimer: undefined as unknown as ReturnType<typeof setInterval>,
				tickTimer: undefined as unknown as ReturnType<typeof setInterval>,
				lastSnapshot: existing?.lastSnapshot ?? null,
			};
			this.instances.set(keyAction.id, runtime);
			return runtime;
		}

		existing.action = keyAction;
		return existing;
	}

	private startTimers(runtime: KeyRuntime): void {
		clearInterval(runtime.dataTimer);
		clearInterval(runtime.tickTimer);
		runtime.dataTimer = setInterval(() => {
			void this.refresh(runtime, { force: false });
		}, runtime.usageConfig.intervalSec * 1000);
		// Redraw the countdown each minute from the cached snapshot (no network).
		runtime.tickTimer = setInterval(() => {
			if (runtime.lastSnapshot) {
				void this.draw(runtime, runtime.lastSnapshot);
			}
		}, COUNTDOWN_REDRAW_MS);
	}

	private async refresh(runtime: KeyRuntime, options: { force: boolean }): Promise<void> {
		let snapshot: UsageSnapshot;
		try {
			snapshot = await runtime.provider.getUsage({ force: options.force });
		} catch (err) {
			logger.error(`reset-countdown usage failure: ${(err as Error)?.name ?? "Error"}`);
			snapshot = {
				provider: "claude",
				session: { usedPercent: null, resetAt: null },
				weekly: { usedPercent: null, resetAt: null },
				status: "error",
				updatedAt: new Date().toISOString(),
				stale: false,
			};
		}
		runtime.lastSnapshot = snapshot;
		await this.draw(runtime, snapshot);
	}

	private async draw(runtime: KeyRuntime, snapshot: UsageSnapshot): Promise<void> {
		await runtime.action.setImage(toDataUrl(renderResetCountdownIcon(snapshot)));
	}
}
