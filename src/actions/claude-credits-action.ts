import { action } from "@elgato/streamdeck";

import { getSharedCache } from "../cache/ttl-cache.ts";
import { ClaudeProvider } from "../providers/claude/claude-provider.ts";
import type { Provider, UsageProvider, UsageSnapshot } from "../providers/types.ts";
import { renderCreditsIcon } from "../render/credits-icon.ts";
import type { ResolvedUsageSettings } from "../settings/usage-settings.ts";
import { logger } from "../utils/logger.ts";
import { UsageActionBase } from "./usage-action-base.ts";

/**
 * Claude Credits action — shows the pay-as-you-go "extra usage" credits state (`extra_usage`
 * in the usage response). Shares the Claude cache with the other actions, so a credits key
 * adds zero extra requests against the rate-limited endpoint. See {@link UsageActionBase} for
 * the shared lifecycle.
 */
@action({ UUID: "com.singerous.ai-limits.claude-credits" })
export class ClaudeCreditsAction extends UsageActionBase {
	protected readonly providerId: UsageProvider = "claude";

	protected override renderSnapshot(snapshot: UsageSnapshot): string {
		return renderCreditsIcon(snapshot);
	}

	protected createProvider(config: ResolvedUsageSettings): Provider {
		return new ClaudeProvider({
			// Shared per provider+interval so backoff/last-good persist across tab switches.
			cache: getSharedCache("claude", config.intervalSec * 1000),
			thresholds: config.thresholds,
			customCredentialsPath: config.customCredentialsPath,
			logger,
		});
	}
}
