import { validateOperations } from "./operations.js";

/**
 * The only operation handoff point for orchestration. In this first slice it
 * intentionally approves or rejects proposals without executing them. Future
 * mutation support must extend this module rather than granting specialists an
 * executor or writing Blender Python directly.
 */
export function prepareExecution({ operations, approvedByDirector = false } = {}) {
  const validation = validateOperations(operations);
  if (!approvedByDirector) {
    return {
      ...validation,
      execution: {
        status: "not-requested",
        reason: "Operations require explicit director approval before Blender mutation.",
      },
    };
  }
  return {
    ...validation,
    execution: {
      status: "blocked",
      reason: "No operation-to-Blender executor is enabled in the read-only first slice.",
    },
  };
}
