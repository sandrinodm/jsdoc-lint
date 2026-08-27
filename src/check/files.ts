import fs from 'node:fs';
import path from 'node:path';

import type * as ts from 'typescript/unstable/ast';
import { createVirtualFileSystem } from 'typescript/unstable/fs';
import { API } from 'typescript/unstable/sync';

import type { NormalizedOptions, PackageInfo } from './types.ts';

/**
 * Collects workspace package metadata from configured roots.
 *
 * @param options Normalized checker options.
 * @returns Discovered packages.
 */
export function collectPackageInfos(options: NormalizedOptions): PackageInfo[] {
  const packageRoots = new Set<string>();

  for (const root of options.roots) {
    const resolvedRoot = path.resolve(options.workspaceRoot, root);
    if (!fs.existsSync(resolvedRoot)) {
      continue;
    }

    if (matchesExcludedPath(resolvedRoot, options.workspaceRoot, options.excludePaths)) {
      continue;
    }

    if (isPackageRoot(resolvedRoot)) {
      packageRoots.add(resolvedRoot);
      continue;
    }

    for (const entry of fs.readdirSync(resolvedRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const packageRoot = path.join(resolvedRoot, entry.name);
      if (matchesExcludedPath(packageRoot, options.workspaceRoot, options.excludePaths)) {
        continue;
      }

      if (isPackageRoot(packageRoot)) {
        packageRoots.add(packageRoot);
      }
    }
  }

  return [...packageRoots]
    .sort((left, right) => left.localeCompare(right))
    .map((packageRoot) => ({
      root: packageRoot,
      relativeRoot: toRelativePath(packageRoot, options.workspaceRoot),
      name: readPackageName(packageRoot, options.workspaceRoot),
    }));
}

/**
 * Collects supported source files under a package root.
 *
 * @param rootDir Absolute package root path.
 * @param options Normalized checker options.
 * @returns Absolute file paths.
 */
export function collectSourceFiles(rootDir: string, options: NormalizedOptions): string[] {
  const files: string[] = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.pop() as string;

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (
        matchesExcludedPath(entryPath, options.workspaceRoot, options.excludePaths) &&
        !isTargetedPath(entryPath, options.targetFilters)
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!options.includeExtensions.has(path.extname(entry.name))) {
        continue;
      }

      if (
        matchesExcludedFile(entryPath, options.workspaceRoot, options.excludeFilePatterns) &&
        !isExplicitFileTarget(entryPath, options.targetFilters)
      ) {
        continue;
      }

      files.push(entryPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

/**
 * Checks whether a path is directly relevant to explicit target filters.
 *
 * @param targetPath Absolute path to test.
 * @param filters Absolute filter paths.
 * @returns True when targets require visiting this path.
 */
function isTargetedPath(targetPath: string, filters: string[]): boolean {
  return filters.length > 0 && shouldScanPath(targetPath, filters);
}

/**
 * Checks whether a file was named exactly as a target.
 *
 * @param filePath Absolute file path to test.
 * @param filters Absolute filter paths.
 * @returns True when the file is an explicit CLI target.
 */
function isExplicitFileTarget(filePath: string, filters: string[]): boolean {
  return filters.includes(filePath);
}

/**
 * Parses JavaScript or TypeScript source files with the TypeScript API.
 *
 * @param filePaths Absolute file paths.
 * @returns Parsed source files in input order.
 */
export function parseSourceFiles(filePaths: string[]): ts.SourceFile[] {
  if (filePaths.length === 0) {
    return [];
  }

  const api = new API({ cwd: path.dirname(filePaths[0] as string) });

  try {
    const snapshot = api.updateSnapshot({ openFiles: filePaths });

    try {
      return filePaths.map((filePath) => {
        const sourceFile = snapshot.getDefaultProjectForFile(filePath)?.program.getSourceFile(filePath);
        /* v8 ignore next 3 -- opening an existing file guarantees a default project and parsed source file. */
        if (!sourceFile) {
          throw new Error(`TypeScript could not parse source file: ${filePath}`);
        }

        return sourceFile;
      });
    } finally {
      snapshot.dispose();
    }
  } finally {
    api.close();
  }
}

/**
 * Parses a JavaScript or TypeScript source file.
 *
 * @param filePath Absolute file path.
 * @returns Parsed source file.
 */
export function parseSourceFile(filePath: string): ts.SourceFile {
  return parseSourceFiles([filePath])[0] as ts.SourceFile;
}

/**
 * Parses in-memory source text with the TypeScript API.
 *
 * @param fileName Virtual source file name.
 * @param sourceText Source text to parse.
 * @returns Parsed source file.
 */
export function parseSourceText(fileName: string, sourceText: string): ts.SourceFile {
  const filePath = path.resolve('/virtual-jsdoc-lint', fileName);
  const api = new API({
    cwd: path.dirname(filePath),
    fs: createVirtualFileSystem({ [filePath]: sourceText }),
  });

  try {
    const snapshot = api.updateSnapshot({ openFiles: [filePath] });

    try {
      const sourceFile = snapshot.getDefaultProjectForFile(filePath)?.program.getSourceFile(filePath);
      /* v8 ignore next 3 -- the virtual filesystem always provides the opened source file. */
      if (!sourceFile) {
        throw new Error(`TypeScript could not parse source text: ${fileName}`);
      }

      return sourceFile;
    } finally {
      snapshot.dispose();
    }
  } finally {
    api.close();
  }
}

/**
 * Checks whether a path matches the requested scan filters.
 *
 * @param targetPath Absolute path to test.
 * @param filters Absolute filter paths.
 * @returns True when the path should be scanned.
 */
export function shouldScanPath(targetPath: string, filters: string[]): boolean {
  if (filters.length === 0) {
    return true;
  }

  return filters.some(
    (filterPath) =>
      targetPath === filterPath ||
      targetPath.startsWith(`${filterPath}${path.sep}`) ||
      filterPath.startsWith(`${targetPath}${path.sep}`)
  );
}

/**
 * Converts an absolute path into a workspace-relative path.
 *
 * @param targetPath Absolute path to convert.
 * @param workspaceRoot Workspace root path.
 * @returns Relative path, or "." for the root.
 */
export function toRelativePath(targetPath: string, workspaceRoot: string): string {
  return path.relative(workspaceRoot, targetPath) || '.';
}

/**
 * Checks whether a file or directory matches an excluded path fragment.
 *
 * @param targetPath Absolute path to test.
 * @param workspaceRoot Workspace root path.
 * @param excludePaths Normalized excluded path fragments.
 * @returns True when the path should be excluded.
 */
function matchesExcludedPath(targetPath: string, workspaceRoot: string, excludePaths: string[]): boolean {
  const relativePath = normalizeToPosix(toRelativePath(targetPath, workspaceRoot));
  const pathSegments = relativePath.split('/').filter(Boolean);

  return excludePaths.some((excludedPath) => {
    if (!excludedPath) {
      return false;
    }

    if (excludedPath.includes('/')) {
      return relativePath === excludedPath || relativePath.startsWith(`${excludedPath}/`);
    }

    return pathSegments.includes(excludedPath);
  });
}

/**
 * Checks whether a file path matches any excluded filename pattern.
 *
 * @param filePath Absolute file path.
 * @param workspaceRoot Workspace root path.
 * @param excludePatterns Filename exclusion patterns.
 * @returns True when the file should be excluded.
 */
function matchesExcludedFile(filePath: string, workspaceRoot: string, excludePatterns: RegExp[]): boolean {
  const baseName = path.basename(filePath);
  const relativePath = normalizeToPosix(toRelativePath(filePath, workspaceRoot));

  return excludePatterns.some((pattern) => pattern.test(baseName) || pattern.test(relativePath));
}

/**
 * Reads the package name from a package root.
 *
 * @param packageRoot Absolute package root path.
 * @param workspaceRoot Workspace root path.
 * @returns Package display name.
 */
function readPackageName(packageRoot: string, workspaceRoot: string): string {
  const packageJsonPath = path.join(packageRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { name?: string };
  return packageJson.name || toRelativePath(packageRoot, workspaceRoot);
}

/**
 * Checks whether a directory is a package root.
 *
 * @param targetPath Absolute directory path.
 * @returns True when the directory contains a package.json file.
 */
function isPackageRoot(targetPath: string): boolean {
  return fs.existsSync(path.join(targetPath, 'package.json'));
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
