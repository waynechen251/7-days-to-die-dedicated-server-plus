"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const sandboxDir = path.join(repoRoot, "temp", "Assembly-CSharp", "SandboxOptions");
const managerPath = path.join(sandboxDir, "SandboxOptionManager.cs");
const enumPath = path.join(sandboxDir, "SandboxOptions.cs");
const outputDir = path.join(__dirname, "..", "lib", "data");
const outputPath = path.join(outputDir, "sandbox-schema.json");

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required source file: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function extractBalanced(src, start, openChar, closeChar) {
  let depth = 0;
  let inString = false;

  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    const prev = src[i - 1];

    if (ch === "\"" && prev !== "\\") {
      inString = !inString;
    }
    if (inString) {
      continue;
    }
    if (ch === openChar) {
      depth += 1;
      continue;
    }
    if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return src.slice(start, i + 1);
      }
    }
  }

  throw new Error(`Unbalanced block: ${openChar}${closeChar}`);
}

function splitTopLevel(src) {
  const parts = [];
  let start = 0;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let inString = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    const prev = src[i - 1];

    if (ch === "\"" && prev !== "\\") {
      inString = !inString;
    }
    if (inString) {
      continue;
    }

    if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    else if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "[") bracketDepth += 1;
    else if (ch === "]") bracketDepth -= 1;
    else if (
      ch === "," &&
      parenDepth === 0 &&
      braceDepth === 0 &&
      bracketDepth === 0
    ) {
      parts.push(src.slice(start, i).trim());
      start = i + 1;
    }
  }

  parts.push(src.slice(start).trim());
  return parts.filter(Boolean);
}

function parseStringArray(body, key) {
  const match = body.match(
    new RegExp(`${key}\\s*=\\s*new string\\[[^\\]]*\\]\\s*\\{([\\s\\S]*?)\\}`)
  );
  if (!match) return [];
  return splitTopLevel(match[1]).map((value) => value.replace(/^"|"$/g, ""));
}

function parsePrimitiveArray(body, typeName, key) {
  const match = body.match(
    new RegExp(`${key}\\s*=\\s*new ${typeName}\\[[^\\]]*\\]\\s*\\{([\\s\\S]*?)\\}`)
  );
  if (!match) return [];
  return splitTopLevel(match[1]);
}

function parseNamedString(body, key) {
  const match = body.match(new RegExp(`${key}\\s*=\\s*"([^"]+)"`));
  return match ? match[1] : null;
}

function normalizeType(typeName) {
  if (typeName.includes("Float")) return "float";
  if (typeName.includes("Int")) return "int";
  if (typeName.includes("Bool")) return "bool";
  throw new Error(`Unsupported type: ${typeName}`);
}

function normalizeValue(type, rawValue) {
  const raw = String(rawValue || "").trim();
  if (type === "int") {
    return parseInt(raw, 10);
  }
  if (type === "float") {
    return parseFloat(raw.replace(/f$/i, ""));
  }
  if (type === "bool") {
    return /^true$/i.test(raw);
  }
  return raw;
}

function indexToAlpha(index) {
  if (index < 0 || index > 25) {
    throw new Error(`Index out of single-letter range: ${index}`);
  }
  return String.fromCharCode(65 + index);
}

function indexToAlpha2(index) {
  if (index < 0 || index >= 26 * 26) {
    throw new Error(`Index out of double-letter range: ${index}`);
  }
  return `${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(
    65 + (index % 26)
  )}`;
}

function buildSchema() {
  const managerText = readRequired(managerPath);
  const enumText = readRequired(enumPath);

  const enumMatch = enumText.match(/public enum SandboxOptions\s*\{([\s\S]*?)\}/);
  if (!enumMatch) {
    throw new Error("Unable to parse SandboxOptions enum");
  }

  const enumNames = enumMatch[1]
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/,$/, ""))
    .filter(Boolean)
    .filter((name) => name !== "Max");

  const valueSets = {};
  let cursor = 0;

  while ((cursor = managerText.indexOf("ValueSets.Add(\"", cursor)) !== -1) {
    const idStart = cursor + "ValueSets.Add(\"".length;
    const idEnd = managerText.indexOf("\"", idStart);
    const id = managerText.slice(idStart, idEnd);
    const ctorStart = managerText.indexOf("new ", idEnd) + 4;
    const braceStart = managerText.indexOf("{", ctorStart);
    const ctorType = managerText.slice(ctorStart, braceStart).trim();
    const bodyBlock = extractBalanced(managerText, braceStart, "{", "}");
    const body = bodyBlock.slice(1, -1);
    const type = normalizeType(ctorType);
    const rawValues =
      type === "float"
        ? parsePrimitiveArray(body, "float", "FloatValues")
        : type === "int"
          ? parsePrimitiveArray(body, "int", "IntValues")
          : parsePrimitiveArray(body, "bool", "BoolValues");

    valueSets[id] = {
      id,
      type,
      displayValues: parseStringArray(body, "DisplayValues"),
      alternateDisplayValues: parseStringArray(body, "AlternateDisplayValues"),
      displayFormat: parseNamedString(body, "DisplayFormat"),
      values: rawValues.map((rawValue, index) => ({
        index,
        code: indexToAlpha(index),
        rawValue: String(rawValue).trim(),
        value: normalizeValue(type, rawValue),
      })),
    };

    cursor = braceStart + bodyBlock.length;
  }

  const options = [];
  cursor = 0;

  while ((cursor = managerText.indexOf("AddSandboxOption(new SandboxOption", cursor)) !== -1) {
    const ctorTypeStart = managerText.indexOf("new ", cursor) + 4;
    const ctorParenStart = managerText.indexOf("(", ctorTypeStart);
    const ctorType = managerText.slice(ctorTypeStart, ctorParenStart).trim();
    const ctorArgsBlock = extractBalanced(managerText, ctorParenStart, "(", ")");
    const args = splitTopLevel(ctorArgsBlock.slice(1, -1));
    const type = normalizeType(ctorType);
    const id = (args[0].match(/SandboxOptions\.([A-Za-z0-9_]+)/) || [])[1];

    if (!id) {
      throw new Error(`Unable to parse option id from: ${args[0]}`);
    }

    const valueSetId = args[3].replace(/^"|"$/g, "");
    const defaultRaw = (args[4] || "").replace(/^defaultValue\s*:\s*/, "").trim();
    const defaultValue = normalizeValue(type, defaultRaw);
    const valueSet = valueSets[valueSetId];
    const enumIndex = enumNames.indexOf(id);
    const defaultIndex = valueSet
      ? valueSet.values.findIndex((entry) => entry.value === defaultValue)
      : -1;

    options.push({
      id,
      enumIndex,
      codeKey: indexToAlpha2(enumIndex),
      type,
      label: args[1].replace(/^"|"$/g, ""),
      category: args[2].replace(/^"|"$/g, ""),
      valueSetId,
      defaultRawValue: defaultRaw,
      defaultValue,
      defaultIndex,
    });

    cursor = ctorParenStart + ctorArgsBlock.length;
  }

  return {
    schemaVersion: 1,
    codeVersion: "A",
    generatedAt: new Date().toISOString(),
    source: {
      enum: path.relative(repoRoot, enumPath).replace(/\\/g, "/"),
      manager: path.relative(repoRoot, managerPath).replace(/\\/g, "/"),
    },
    categories: [...new Set(options.map((option) => option.category))],
    valueSets: Object.values(valueSets),
    options,
  };
}

function main() {
  const schema = buildSchema();
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2), "utf8");
  process.stdout.write(
    `Generated ${path.relative(repoRoot, outputPath)} with ${schema.options.length} options.\n`
  );
}

main();
