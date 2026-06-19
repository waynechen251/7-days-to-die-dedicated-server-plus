"use strict";

const schema = require("./data/sandbox-schema.json");

const optionList = [...schema.options].sort((a, b) => a.enumIndex - b.enumIndex);
const optionById = new Map(optionList.map((option) => [option.id, option]));
const optionByCodeKey = new Map(optionList.map((option) => [option.codeKey, option]));
const valueSetById = new Map(schema.valueSets.map((valueSet) => [valueSet.id, valueSet]));

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function indexToAlpha(index) {
  if (!Number.isInteger(index) || index < 0 || index > 25) {
    throw new RangeError(`Value index out of range: ${index}`);
  }
  return String.fromCharCode(65 + index);
}

function alphaToIndex(value) {
  const ch = String(value || "").toUpperCase();
  if (!/^[A-Z]$/.test(ch)) {
    throw new Error(`Invalid value code: ${value}`);
  }
  return ch.charCodeAt(0) - 65;
}

function alpha2ToIndex(value) {
  const key = String(value || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(key)) {
    throw new Error(`Invalid option code: ${value}`);
  }
  return (key.charCodeAt(0) - 65) * 26 + (key.charCodeAt(1) - 65);
}

function indexToAlpha2(index) {
  if (!Number.isInteger(index) || index < 0 || index >= 26 * 26) {
    throw new RangeError(`Option index out of range: ${index}`);
  }
  return `${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(
    65 + (index % 26)
  )}`;
}

function getValueSet(option) {
  return option ? valueSetById.get(option.valueSetId) || null : null;
}

function buildResolvedSelection(option, valueIndex) {
  const valueSet = getValueSet(option);
  if (!valueSet) {
    return null;
  }
  const valueEntry = valueSet.values[valueIndex];
  if (!valueEntry) {
    return null;
  }
  return {
    optionId: option.id,
    optionLabel: option.label,
    optionCode: option.codeKey,
    optionIndex: option.enumIndex,
    category: option.category,
    type: option.type,
    valueSetId: option.valueSetId,
    valueIndex,
    valueCode: valueEntry.code,
    value: valueEntry.value,
    rawValue: valueEntry.rawValue,
    isDefault: valueIndex === option.defaultIndex,
  };
}

function buildDefaultState() {
  const state = {};
  optionList.forEach((option) => {
    state[option.id] = buildResolvedSelection(option, option.defaultIndex);
  });
  return state;
}

function normalizeSelectionValue(input) {
  if (Number.isInteger(input)) {
    return input;
  }
  if (input && typeof input === "object" && Number.isInteger(input.valueIndex)) {
    return input.valueIndex;
  }
  return null;
}

function getClientSchema() {
  return {
    schemaVersion: schema.schemaVersion,
    codeVersion: schema.codeVersion,
    generatedAt: schema.generatedAt,
    categories: [...schema.categories],
    valueSets: clone(schema.valueSets),
    options: clone(optionList),
  };
}

function decode(code, { includeDefaults = true } = {}) {
  const errors = [];
  const warnings = [];
  const rawCode = String(code || "").trim();
  const state = includeDefaults ? buildDefaultState() : {};
  const delta = {};

  if (!rawCode) {
    errors.push("SandboxCode is empty.");
    return {
      valid: false,
      code: rawCode,
      version: "",
      expectedVersion: schema.codeVersion,
      includeDefaults,
      errors,
      warnings,
      state,
      delta,
    };
  }

  const version = rawCode[0];
  if (version !== schema.codeVersion) {
    errors.push(
      `Unsupported SandboxCode version '${version}'. Expected '${schema.codeVersion}'.`
    );
    return {
      valid: false,
      code: rawCode,
      version,
      expectedVersion: schema.codeVersion,
      includeDefaults,
      errors,
      warnings,
      state,
      delta,
    };
  }

  const body = rawCode.slice(1);
  if (body.length % 3 !== 0) {
    errors.push("SandboxCode payload length is not divisible by 3.");
  }

  for (let offset = 0; offset + 2 < body.length; offset += 3) {
    const optionCode = body.slice(offset, offset + 2).toUpperCase();
    const valueCode = body[offset + 2].toUpperCase();
    const option = optionByCodeKey.get(optionCode);

    try {
      alpha2ToIndex(optionCode);
    } catch (err) {
      errors.push(err.message);
      continue;
    }

    if (!option) {
      errors.push(`Unknown Sandbox option code '${optionCode}'.`);
      continue;
    }

    let valueIndex;
    try {
      valueIndex = alphaToIndex(valueCode);
    } catch (err) {
      errors.push(err.message);
      continue;
    }

    const resolved = buildResolvedSelection(option, valueIndex);
    if (!resolved) {
      errors.push(
        `Value index '${valueIndex}' is invalid for Sandbox option '${option.id}'.`
      );
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(delta, option.id)) {
      warnings.push(`Duplicate Sandbox option '${option.id}' found; last value wins.`);
    }

    delta[option.id] = resolved;
    if (includeDefaults) {
      state[option.id] = resolved;
    } else {
      state[option.id] = resolved;
    }
  }

  return {
    valid: errors.length === 0,
    code: rawCode,
    version,
    expectedVersion: schema.codeVersion,
    includeDefaults,
    errors,
    warnings,
    delta,
    state,
  };
}

function encode(selections, { includeDefaults = false } = {}) {
  const errors = [];
  const warnings = [];
  const input = selections && typeof selections === "object" ? selections : {};
  const chunks = [];
  const normalized = {};

  Object.keys(input).forEach((optionId) => {
    if (!optionById.has(optionId)) {
      warnings.push(`Unknown Sandbox option '${optionId}' was ignored.`);
    }
  });

  optionList.forEach((option) => {
    const valueSet = getValueSet(option);
    if (!valueSet) {
      errors.push(`Missing value set '${option.valueSetId}' for option '${option.id}'.`);
      return;
    }

    const incoming = normalizeSelectionValue(input[option.id]);
    const valueIndex = incoming == null ? option.defaultIndex : incoming;

    if (!Number.isInteger(valueIndex)) {
      errors.push(`Option '${option.id}' is missing a valid valueIndex.`);
      return;
    }
    if (!valueSet.values[valueIndex]) {
      errors.push(`Option '${option.id}' received invalid valueIndex '${valueIndex}'.`);
      return;
    }

    normalized[option.id] = buildResolvedSelection(option, valueIndex);

    if (!includeDefaults && valueIndex === option.defaultIndex) {
      return;
    }

    chunks.push(`${option.codeKey}${indexToAlpha(valueIndex)}`);
  });

  return {
    valid: errors.length === 0,
    code: errors.length ? "" : `${schema.codeVersion}${chunks.join("")}`,
    includeDefaults,
    errors,
    warnings,
    normalized,
    encodedCount: chunks.length,
  };
}

module.exports = {
  getClientSchema,
  decode,
  encode,
  indexToAlpha,
  indexToAlpha2,
  alphaToIndex,
  alpha2ToIndex,
};
