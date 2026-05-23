/**
 * Get the effective lark-cli path.
 *
 * The plugin intentionally avoids probing arbitrary filesystem paths at runtime.
 * If Obsidian cannot resolve "lark-cli" from its PATH, users should set an
 * explicit absolute path in the plugin settings.
 */
export function getEffectiveLarkCliPath(userSetting: string): string {
	return userSetting.trim() || "lark-cli";
}
