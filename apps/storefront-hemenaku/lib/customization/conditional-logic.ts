// =====================================================
// CONDITIONAL LOGIC EVALUATOR
// Evaluates if a step should be shown based on conditions
// =====================================================

import {
  ConditionalLogicGroup,
  ShowCondition,
  CustomizationStep,
  ConditionOperator,
} from "@/types/product-customization";

/**
 * Evaluate a single condition
 */
function evaluateCondition(
  condition: ShowCondition,
  values: Record<string, unknown>
): boolean {
  const stepValue = values[condition.step_key];
  const { operator, value: expectedValue } = condition;

  switch (operator) {
    case "equals":
      return stepValue === expectedValue;

    case "not_equals":
      return stepValue !== expectedValue;

    case "contains":
      if (typeof stepValue === "string") {
        return stepValue.includes(String(expectedValue));
      }
      if (Array.isArray(stepValue)) {
        return stepValue.includes(expectedValue as string);
      }
      return false;

    case "not_contains":
      if (typeof stepValue === "string") {
        return !stepValue.includes(String(expectedValue));
      }
      if (Array.isArray(stepValue)) {
        return !stepValue.includes(expectedValue as string);
      }
      return true;

    case "greater_than":
      return Number(stepValue) > Number(expectedValue);

    case "less_than":
      return Number(stepValue) < Number(expectedValue);

    case "greater_than_or_equal":
      return Number(stepValue) >= Number(expectedValue);

    case "less_than_or_equal":
      return Number(stepValue) <= Number(expectedValue);

    case "is_empty":
      return (
        stepValue === undefined ||
        stepValue === null ||
        stepValue === "" ||
        (Array.isArray(stepValue) && stepValue.length === 0)
      );

    case "is_not_empty":
      return (
        stepValue !== undefined &&
        stepValue !== null &&
        stepValue !== "" &&
        (!Array.isArray(stepValue) || stepValue.length > 0)
      );

    case "matches_regex":
      if (typeof stepValue !== "string" || typeof expectedValue !== "string") {
        return false;
      }
      try {
        const regex = new RegExp(expectedValue);
        return regex.test(stepValue);
      } catch {
        return false;
      }

    default:
      return false;
  }
}

/**
 * Evaluate a logic group (AND/OR combination of conditions)
 */
function evaluateLogicGroup(
  group: ConditionalLogicGroup,
  values: Record<string, unknown>
): boolean {
  if (group.conditions.length === 0) {
    return true;
  }

  const results = group.conditions.map((condition) => {
    if ("operator" in condition && "conditions" in condition) {
      // Nested group
      return evaluateLogicGroup(condition as ConditionalLogicGroup, values);
    } else {
      // Simple condition
      return evaluateCondition(condition as ShowCondition, values);
    }
  });

  if (group.operator === "and") {
    return results.every(Boolean);
  } else {
    // or
    return results.some(Boolean);
  }
}

/**
 * Main function to evaluate if conditions are met
 */
export function evaluateConditions(
  conditions: ConditionalLogicGroup | undefined,
  values: Record<string, unknown>,
  allSteps?: CustomizationStep[]
): boolean {
  if (!conditions || conditions.conditions.length === 0) {
    return true;
  }

  return evaluateLogicGroup(conditions, values);
}

/**
 * Get steps that affect the visibility of a given step
 */
export function getDependentSteps(
  step: CustomizationStep,
  allSteps: CustomizationStep[]
): CustomizationStep[] {
  if (!step.show_conditions) return [];

  const dependentKeys = new Set<string>();

  const extractKeys = (group: ConditionalLogicGroup) => {
    for (const condition of group.conditions) {
      if ("step_key" in condition) {
        dependentKeys.add(condition.step_key);
      } else if ("conditions" in condition) {
        extractKeys(condition as ConditionalLogicGroup);
      }
    }
  };

  extractKeys(step.show_conditions);

  return allSteps.filter((s) => dependentKeys.has(s.key));
}

/**
 * Check if changing a step value would affect other steps' visibility
 */
export function getAffectedSteps(
  changedStepKey: string,
  allSteps: CustomizationStep[]
): CustomizationStep[] {
  return allSteps.filter((step) => {
    if (!step.show_conditions) return false;

    const checkCondition = (group: ConditionalLogicGroup): boolean => {
      for (const condition of group.conditions) {
        if ("step_key" in condition) {
          if (condition.step_key === changedStepKey) return true;
        } else if ("conditions" in condition) {
          if (checkCondition(condition as ConditionalLogicGroup)) return true;
        }
      }
      return false;
    };

    return checkCondition(step.show_conditions);
  });
}
