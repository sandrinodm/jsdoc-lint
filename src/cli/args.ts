import type { ParsedArgs } from './types.ts';

/**
 * Parses CLI flags and positional targets.
 *
 * @param argv CLI argument list.
 * @returns Parsed arguments.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const parsedArgs: ParsedArgs = {
    excludePaths: [],
    excludeFiles: [],
    includeExtensions: [],
    roots: [],
    targets: [],
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index] as string;

    if (value === '--') {
      parsedArgs.targets.push(...argv.slice(index + 1));
      break;
    }

    if (value === '--help' || value === '-h') {
      parsedArgs.help = true;
      continue;
    }

    if (value === '--json') {
      parsedArgs.json = true;
      continue;
    }

    if (value === '--require-drizzle-jsdoc') {
      parsedArgs.requireDrizzleJsDoc = true;
      continue;
    }

    if (value === '--require-zod-jsdoc') {
      parsedArgs.requireZodJsDoc = true;
      continue;
    }

    if (value === '--config') {
      parsedArgs.configPath = readFlagValue(argv, index, value);
      index += 1;
      continue;
    }

    if (value === '--exclude-path') {
      parsedArgs.excludePaths.push(readFlagValue(argv, index, value));
      index += 1;
      continue;
    }

    if (value === '--exclude-file') {
      parsedArgs.excludeFiles.push(readFlagValue(argv, index, value));
      index += 1;
      continue;
    }

    if (value === '--include-ext') {
      parsedArgs.includeExtensions.push(readFlagValue(argv, index, value));
      index += 1;
      continue;
    }

    if (value === '--root') {
      parsedArgs.roots.push(readFlagValue(argv, index, value));
      index += 1;
      continue;
    }

    if (value.startsWith('--')) {
      throw new Error(`Unknown option: ${value}`);
    }

    parsedArgs.targets.push(value);
  }

  return parsedArgs;
}

/**
 * Returns CLI help text.
 *
 * @returns Usage instructions.
 */
export function getHelpText(): string {
  return [
    'Usage: jsdoc-lint [targets...] [options]',
    '',
    'Options:',
    '  --config <path>         Load config from a specific JSON file.',
    '  --root <path>           Add a root to scan when no positional targets are provided.',
    '  --exclude-path <path>   Exclude a path segment or relative path prefix.',
    '  --exclude-file <regex>  Exclude filenames or relative paths matching a regex.',
    '  --include-ext <ext>     Restrict scanned file extensions.',
    '  --require-drizzle-jsdoc Require JSDoc on direct Drizzle table members.',
    '  --require-zod-jsdoc     Require JSDoc on direct Zod object members.',
    '  --json                  Emit machine-readable JSON.',
    '  -h, --help              Show help.',
  ].join('\n');
}

/**
 * Reads the value that follows a flag.
 *
 * @param argv CLI argument list.
 * @param index Current flag index.
 * @param flagName Flag name.
 * @returns Flag value.
 */
function readFlagValue(argv: string[], index: number, flagName: string): string {
  const nextValue = argv[index + 1];
  if (!nextValue || nextValue.startsWith('--')) {
    throw new Error(`Missing value for ${flagName}`);
  }

  return nextValue;
}
