/**
 * Helpers for opening a .base file on a named view.
 *
 * Obsidian opens a base on a view given as a link subpath ("file.base#View").
 * An unknown name is kept as the leaf's view name rather than falling back, so
 * only target a view the base actually has.
 */

/** View names of a parsed .base file, in file order. */
export function baseViewNames(parsed: unknown): string[] {
	if (!parsed || typeof parsed !== "object") return [];
	const views = (parsed as { views?: unknown }).views;
	if (!Array.isArray(views)) return [];
	const names: string[] = [];
	for (const view of views) {
		const name = (view as { name?: unknown } | null)?.name;
		if (typeof name === "string") names.push(name);
	}
	return names;
}

/** Link subpath for the preferred view, or undefined to open the base's default view. */
export function baseViewSubpath(viewNames: string[], preferred: string): string | undefined {
	return viewNames.includes(preferred) ? `#${preferred}` : undefined;
}
