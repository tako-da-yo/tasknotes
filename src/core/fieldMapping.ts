export {
	coerceStatusFrontmatterValue,
	DEFAULT_DEPENDENCY_RELTYPE,
	extractDependencyUid,
	getFrontmatterTags,
	isRecognizedProperty,
	isValidDependencyRelType,
	lookupMappingKey,
	normalizeDependencyEntry,
	normalizeDependencyList,
	normalizeFrontmatterTag,
	normalizePriorityConfigValue,
	normalizeStatusConfigValue,
	normalizeTitleValue,
	parseLinkToPath,
	serializeDependencies,
	validateFieldMapping,
	VALID_DEPENDENCY_RELTYPES,
} from "@tasknotes/model/mapping";

import {
	mapTaskFromFrontmatter as mapModelTaskFromFrontmatter,
	mapTaskToFrontmatter as mapModelTaskToFrontmatter,
} from "@tasknotes/model/mapping";
import type { FieldMapping, TaskInfo } from "../types";
import { normalizeCompleteInstanceTimes } from "../services/task-service/completionTime";
import { DEFAULT_FIELD_MAPPING } from "./defaultFieldMapping";

function completionTimeFields(mapping: Partial<FieldMapping>) {
	return {
		completedAt: mapping.completedAt || DEFAULT_FIELD_MAPPING.completedAt,
		completeInstanceTimes:
			mapping.completeInstanceTimes || DEFAULT_FIELD_MAPPING.completeInstanceTimes,
	};
}

/**
 * Maps frontmatter to task data with @tasknotes/model, adding the completion-time
 * fields that the model does not know about yet.
 */
export function mapTaskFromFrontmatter(
	mapping: FieldMapping,
	...rest: Parameters<typeof mapModelTaskFromFrontmatter> extends [unknown, ...infer R]
		? R
		: never
): Partial<TaskInfo> {
	const task: Partial<TaskInfo> = mapModelTaskFromFrontmatter(mapping, ...rest);
	const frontmatter = rest[0];
	if (!frontmatter) {
		return task;
	}

	const fields = completionTimeFields(mapping);
	const completedAt = frontmatter[fields.completedAt];
	if (typeof completedAt === "string" && completedAt.length > 0) {
		task.completedAt = completedAt;
	}
	const instanceTimes = normalizeCompleteInstanceTimes(frontmatter[fields.completeInstanceTimes]);
	if (instanceTimes) {
		task.complete_instance_times = instanceTimes;
	}
	return task;
}

/**
 * Maps task data to frontmatter with @tasknotes/model, adding the completion-time
 * fields that the model does not know about yet.
 */
export function mapTaskToFrontmatter(
	mapping: FieldMapping,
	taskData: Partial<TaskInfo>,
	...rest: Parameters<typeof mapModelTaskToFrontmatter> extends [unknown, unknown, ...infer R]
		? R
		: never
): Record<string, unknown> {
	const frontmatter = mapModelTaskToFrontmatter(mapping, taskData, ...rest);
	const fields = completionTimeFields(mapping);
	if (taskData.completedAt) {
		frontmatter[fields.completedAt] = taskData.completedAt;
	}
	if (
		taskData.complete_instance_times &&
		Object.keys(taskData.complete_instance_times).length > 0
	) {
		frontmatter[fields.completeInstanceTimes] = taskData.complete_instance_times;
	}
	return frontmatter;
}

/** Frontmatter property name for a field, falling back to the default name. */
export function toUserField(
	mapping: Partial<FieldMapping>,
	internalName: keyof FieldMapping
): string {
	return mapping[internalName] || DEFAULT_FIELD_MAPPING[internalName];
}

export function toUserFields(
	mapping: Partial<FieldMapping>,
	internalFields: (keyof FieldMapping)[]
): string[] {
	return internalFields.map((field) => toUserField(mapping, field));
}

export function isPropertyForField(
	mapping: Partial<FieldMapping>,
	propertyName: string,
	internalField: keyof FieldMapping
): boolean {
	return toUserField(mapping, internalField) === propertyName;
}
