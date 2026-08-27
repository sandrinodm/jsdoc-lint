import process from 'node:process';

import { formatJsonReport, formatReport, loadConfig, normalizeOptions, runCheck } from '../check/index.ts';
import { getHelpText, parseArgs } from './args.ts';
import type { CliContext } from './types.ts';

/**
 * Runs the JSDoc checker CLI.
 *
 * @param argv CLI argument list.
 * @param context Optional IO and process context.
 * @returns Exit code.
 */
export async function runCli(argv: string[] = process.argv.slice(2), context: CliContext = {}): Promise<number> {
  const cwd = context.cwd ?? process.cwd();
  const stdout = context.stdout ?? ((value: string) => console.log(value));
  const stderr = context.stderr ?? ((value: string) => console.error(value));

  try {
    const parsedArgs = parseArgs(argv);
    if (parsedArgs.help) {
      stdout(getHelpText());
      return 0;
    }

    const loadConfigOptions = parsedArgs.configPath ? { cwd, configPath: parsedArgs.configPath } : { cwd };
    const { config, configRoot } = loadConfig(loadConfigOptions);
    const options = normalizeOptions({
      cwd,
      workspaceRoot: configRoot,
      config,
      roots: parsedArgs.roots,
      targets: parsedArgs.targets,
      excludePaths: parsedArgs.excludePaths,
      excludeFiles: parsedArgs.excludeFiles,
      includeExtensions: parsedArgs.includeExtensions,
      ...(parsedArgs.requireDrizzleJsDoc ? { requireDrizzleJsDoc: true } : {}),
      ...(parsedArgs.requireZodJsDoc ? { requireZodJsDoc: true } : {}),
    });
    const result = runCheck(options);

    if (parsedArgs.json) {
      stdout(formatJsonReport(result));
    } else if (result.failures.length === 0) {
      stdout(formatReport(result));
    } else {
      stderr(formatReport(result));
    }

    return result.failures.length === 0 ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : /* v8 ignore next */ String(error);
    stderr(message);
    return 2;
  }
}
