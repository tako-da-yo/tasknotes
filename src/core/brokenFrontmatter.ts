/**
 * Task notes whose frontmatter Obsidian can't parse (for example a duplicated key line
 * from a sync merge) lose every property, so they silently stop being tasks. These
 * helpers find such notes from their raw text and offer a safe repair.
 */

export interface TaskIdentification {
	method: "tag" | "property";
	tag: string;
	propertyName: string;
	propertyValue: string;
	/** The default folder for new tasks; broken notes there count as task notes. */
	folder: string;
}

export interface TaskNoteDiagnosis {
	/** The whole note with the repair applied, or null when no safe repair makes it parse. */
	repaired: string | null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The raw frontmatter text between the opening and closing `---`, and its offsets. */
export function rawFrontmatter(content: string): { text: string; start: number; end: number } | null {
	const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
	if (!match) return null;
	// The text starts right after the opening "---" line.
	const start = match[0].indexOf("\n") + 1;
	return { text: match[1], start, end: start + match[1].length };
}

/** Whether raw frontmatter text carries the task tag or identifying property. */
export function looksLikeTaskFrontmatter(text: string, ident: TaskIdentification): boolean {
	if (ident.method === "property") {
		if (!ident.propertyName) return false;
		const value = ident.propertyValue ? `["']?${escape(ident.propertyValue)}["']?` : ".*";
		return new RegExp(`^\\s*${escape(ident.propertyName)}\\s*:\\s*${value}\\s*$`, "m").test(text);
	}
	if (!ident.tag) return false;
	return new RegExp(`(^|[\\s\\[,"'#-])${escape(ident.tag)}($|[\\s\\],"'])`, "m").test(text);
}

/**
 * Remove key lines (`key: value`) that exactly repeat the line above them, the shape a
 * line-based merge leaves behind. Repeated list items are kept: they are valid YAML.
 */
export function removeRepeatedKeyLines(text: string): { text: string; removed: number } {
	const lines = text.split("\n");
	const kept: string[] = [];
	let removed = 0;
	for (const line of lines) {
		const previous = kept[kept.length - 1];
		if (previous !== undefined && line === previous && /^\s*[^\s#-][^:]*:\s*\S/.test(line)) {
			removed++;
			continue;
		}
		kept.push(line);
	}
	return { text: kept.join("\n"), removed };
}

function parses(text: string, parse: (text: string) => unknown): boolean {
	try {
		parse(text);
		return true;
	} catch {
		return false;
	}
}

/**
 * A diagnosis when `content` looks like a task note (in the tasks folder, or with the task
 * tag or property in its raw frontmatter) but its frontmatter does not parse; else null.
 */
export function diagnoseTaskNote(
	path: string,
	content: string,
	ident: TaskIdentification,
	parse: (text: string) => unknown
): TaskNoteDiagnosis | null {
	const fm = rawFrontmatter(content);
	if (!fm || parses(fm.text, parse)) return null;
	const inFolder = !!ident.folder && path.startsWith(`${ident.folder.replace(/\/+$/, "")}/`);
	if (!inFolder && !looksLikeTaskFrontmatter(fm.text, ident)) return null;
	const { text, removed } = removeRepeatedKeyLines(fm.text);
	const repaired = removed > 0 && parses(text, parse) ? content.slice(0, fm.start) + text + content.slice(fm.end) : null;
	return { repaired };
}
