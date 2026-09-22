import { OPERATION_NAMES } from "./types.js";

export function validateOperation(operation) {
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
    return { valid: false, error: "Operation must be an object." };
  }
  if (!OPERATION_NAMES.includes(operation.operation)) {
    return { valid: false, error: `Unsupported operation: ${String(operation.operation)}.` };
  }
  if (typeof operation.target !== "string" || !operation.target.trim()) {
    return { valid: false, error: "Operation target must be a non-empty string." };
  }
  if (!operation.parameters || typeof operation.parameters !== "object" || Array.isArray(operation.parameters)) {
    return { valid: false, error: "Operation parameters must be an object." };
  }
  if (typeof operation.reason !== "string" || !operation.reason.trim()) {
    return { valid: false, error: "Operation reason must be a non-empty string." };
  }
  return { valid: true, value: operation };
}

export function validateOperations(operations = []) {
  if (!Array.isArray(operations)) return { valid: [], rejected: [{ error: "Operations must be an array." }] };
  const valid = [];
  const rejected = [];
  for (const operation of operations) {
    const result = validateOperation(operation);
    (result.valid ? valid : rejected).push(result.valid ? result.value : { operation, error: result.error });
  }
  return { valid, rejected };
}
