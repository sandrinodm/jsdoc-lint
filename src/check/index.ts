import { visitSourceFile } from './declarations.ts';
import { collectPackageInfos, collectSourceFiles, parseSourceFiles, shouldScanPath, toRelativePath } from './files.ts';
import type { CheckResult, FailureEntry, NormalizedOptions } from './types.ts';

export { loadConfig, normalizeOptions } from './config.ts';
export { formatJsonReport, formatReport } from './report.ts';
export type {
  CheckResult,
  FailureEntry,
  LoadConfigOptions,
  LoadedConfig,
  NormalizedOptions,
  NormalizeOptionsInput,
} from './types.ts';

/**
 * Runs the JSDoc checker for the provided options.
 *
 * @param options Normalized checker options.
 * @returns Checker result.
 */
export function runCheck(options: NormalizedOptions): CheckResult {
  const packageInfos = collectPackageInfos(options);
  const failures: FailureEntry[] = [];

  for (const packageInfo of packageInfos) {
    if (!shouldScanPath(packageInfo.root, options.targetFilters)) {
      continue;
    }

    const filePaths = collectSourceFiles(packageInfo.root, options).filter((filePath) =>
      shouldScanPath(filePath, options.targetFilters)
    );
    const sourceFiles = parseSourceFiles(filePaths);

    for (const [index, sourceFile] of sourceFiles.entries()) {
      const filePath = filePaths[index] as string;
      visitSourceFile(
        sourceFile,
        (entry) => {
          failures.push({
            packageName: packageInfo.name,
            packageRelativeRoot: packageInfo.relativeRoot,
            relativeFilePath: toRelativePath(filePath, options.workspaceRoot),
            ...entry,
          });
        },
        {
          requireDrizzleJsDoc: options.requireDrizzleJsDoc ?? false,
          requireZodJsDoc: options.requireZodJsDoc ?? false,
        }
      );
    }
  }

  return { failures };
}
