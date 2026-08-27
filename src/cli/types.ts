/**
 * IO and process context used by the CLI.
 */
export interface CliContext {
  /**
   * Working directory used for config lookup and target resolution.
   */
  cwd?: string;

  /**
   * Writes standard output.
   */
  stdout?: (value: string) => void;

  /**
   * Writes standard error.
   */
  stderr?: (value: string) => void;
}

/**
 * Parsed CLI options for the jsdoc-lint executable.
 */
export interface ParsedArgs {
  /**
   * Explicit config path passed on the command line.
   */
  configPath?: string;

  /**
   * Extra excluded path fragments from CLI flags.
   */
  excludePaths: string[];

  /**
   * Extra excluded filename patterns from CLI flags.
   */
  excludeFiles: string[];

  /**
   * Extensions allowed for the current run.
   */
  includeExtensions: string[];

  /**
   * Root overrides from CLI flags.
   */
  roots: string[];

  /**
   * Enables JSDoc checks for direct Drizzle table members.
   */
  requireDrizzleJsDoc?: true;

  /**
   * Enables JSDoc checks for direct Zod object members.
   */
  requireZodJsDoc?: true;

  /**
   * Positional target paths.
   */
  targets: string[];

  /**
   * Whether to emit JSON output.
   */
  json: boolean;

  /**
   * Whether to print help instead of running the scan.
   */
  help: boolean;
}
