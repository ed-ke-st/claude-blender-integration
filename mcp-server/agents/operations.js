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
  if (operation.operation === "set_material_properties") {
    const parameters = operation.parameters;
    const numericProperties = ["metallic", "roughness", "ior", "alpha"];
    for (const property of numericProperties) {
      if (parameters[property] !== undefined && !Number.isFinite(parameters[property])) {
        return { valid: false, error: `Material property ${property} must be a finite number.` };
      }
    }
    if (parameters.baseColor !== undefined) {
      const color = parameters.baseColor;
      if (!Array.isArray(color) || ![3, 4].includes(color.length) || color.some((value) => !Number.isFinite(value))) {
        return { valid: false, error: "Material baseColor must be an array of 3 or 4 finite numbers." };
      }
    }
    if (!numericProperties.some((property) => parameters[property] !== undefined) && parameters.baseColor === undefined) {
      return { valid: false, error: "Material operation must specify at least one supported property." };
    }
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
