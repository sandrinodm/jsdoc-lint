import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_EXCLUDE_FILES,
  DEFAULT_EXCLUDE_PATHS,
  DEFAULT_INCLUDE_EXTENSIONS,
  DEFAULT_ROOTS,
} from './constants.ts';
import type { LoadConfigOptions, LoadedConfig, NormalizedOptions, NormalizeOptionsInput } from './types.ts';

/**
 * Loads jsdoc checker config from disk.
 *
 * @param options Config lookup options.
 * @returns Loaded config and resolved path.
 */
export function loadConfig({ cwd = process.cwd(), configPath }: LoadConfigOptions = {}): LoadedConfig {
  const resolvedConfigPath = configPath ? path.resolve(cwd, configPath) : findConfigPath(cwd);
  if (!resolvedConfigPath) {
    return { config: {}, configPath: null, configRoot: cwd };
  }

  if (!fs.existsSync(resolvedConfigPath)) {
    throw new Error(`Config file not found: ${resolvedConfigPath}`);
  }

  const rawConfig = fs.readFileSync(resolvedConfigPath, 'utf8');
  return {
    config: JSON.parse(rawConfig) as Record<string, unknown>,
    configPath: resolvedConfigPath,
    configRoot: path.dirname(resolvedConfigPath),
  };
}

/**
 * Normalizes checker options from defaults, config, and CLI overrides.
 *
 * @param options Raw option values.
 * @returns Normalized checker options.
 */
export function normalizeOptions({
  cwd = process.cwd(),
  workspaceRoot = cwd,
  config = {},
  roots = [],
  targets = [],
  excludePaths = [],
  excludeFiles = [],
  includeExtensions = [],
  requireDrizzleJsDoc,
  requireZodJsDoc,
}: NormalizeOptionsInput = {}): NormalizedOptions {
  const configRoots = readStringArray(config.roots);
  const configExcludePaths = readStringArray(config.excludePaths);
  const configExcludeFiles = readStringArray(config.excludeFiles);
  const configIncludeExtensions = readStringArray(config.includeExtensions);
  const configRequireDrizzleJsDoc = readBoolean(config.requireDrizzleJsDoc);
  const configRequireZodJsDoc = readBoolean(config.requireZodJsDoc);

  const resolvedRoots = roots.length > 0 ? roots : configRoots.length > 0 ? configRoots : DEFAULT_ROOTS;
  const resolvedIncludeExtensions =
    includeExtensions.length > 0
      ? includeExtensions
      : configIncludeExtensions.length > 0
        ? configIncludeExtensions
        : DEFAULT_INCLUDE_EXTENSIONS;

  return {
    workspaceRoot,
    roots: dedupeStrings(resolvedRoots),
    targetFilters: targets.map((target) => path.resolve(cwd, target)),
    includeExtensions: new Set(normalizeExtensions(resolvedIncludeExtensions)),
    excludePaths: dedupeStrings([...DEFAULT_EXCLUDE_PATHS, ...configExcludePaths, ...excludePaths]).map(
      normalizePathFragment
    ),
    excludeFilePatterns: [...DEFAULT_EXCLUDE_FILES, ...configExcludeFiles, ...excludeFiles].map(createPattern),
    requireDrizzleJsDoc: requireDrizzleJsDoc ?? configRequireDrizzleJsDoc ?? false,
    requireZodJsDoc: requireZodJsDoc ?? configRequireZodJsDoc ?? false,
  };
}

/**
 * Finds the nearest jsdoc.json by walking upward from a starting directory.
 *
 * @param startDir Directory to start searching from.
 * @returns Absolute config path when found.
 */
function findConfigPath(startDir: string): string | null {
  let currentDir = startDir;

  while (true) {
    const candidatePath = path.join(currentDir, 'jsdoc.json');
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

/**
 * Normalizes an exclude-path fragment to a POSIX-style relative fragment.
 *
 * @param value Raw exclude-path value.
 * @returns Normalized path fragment.
 */
function normalizePathFragment(value: string): string {
  return normalizeToPosix(value)
    .replace(/^\.?\//u, '')
    .replace(/\/$/u, '');
}

/**
 * Normalizes configured extensions so each one starts with a dot.
 *
 * @param extensions Raw extension values.
 * @returns Normalized extensions.
 */
function normalizeExtensions(extensions: string[]): string[] {
  return extensions.map((extension) => (extension.startsWith('.') ? extension : `.${extension}`));
}

/**
 * Creates a RegExp from a config or CLI pattern string.
 *
 * @param value Raw regex string.
 * @returns Compiled regex.
 */
function createPattern(value: string): RegExp {
  try {
    return new RegExp(value, 'u');
  } catch (error) {
    throw new Error(`Invalid exclude-file pattern "${value}": ${(error as Error).message}`);
  }
}

/**
 * Reads a string array from config, ignoring invalid values.
 *
 * @param value Raw config value.
 * @returns String array value.
 */
function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/**
 * Reads a boolean from config, ignoring invalid values.
 *
 * @param value Raw config value.
 * @returns Boolean value when valid.
 */
function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Normalizes path separators to POSIX style.
 *
 * @param value Path value to normalize.
 * @returns POSIX-style path string.
 */
function normalizeToPosix(value: string): string {
  return value.replaceAll(path.sep, '/');
}

/**
 * Removes duplicates while preserving insertion order.
 *
 * @param values String values.
 * @returns Deduplicated string values.
 */
function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}
