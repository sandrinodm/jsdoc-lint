import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { runCli } from './index.js';

describe('runCli', () => {
  test('prints help and exits successfully', async () => {
    const output: string[] = [];

    const exitCode = await runCli(['--help'], {
      cwd: process.cwd(),
      stdout: (value) => output.push(value),
      stderr: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(output.join('')).toContain('Usage: jsdoc-lint [targets...] [options]');
    expect(output.join('')).toContain('--require-drizzle-jsdoc');
    expect(output.join('')).toContain('--require-zod-jsdoc');
  });

  test('returns a failing exit code and prints diagnostics', async () => {
    const workspaceRoot = await createWorkspace({
      'packages/utils/package.json': JSON.stringify({ name: '@scope/utils' }),
      'packages/utils/src/index.ts': 'export function add(left: number, right: number) {\n  return left + right;\n}\n',
    });
    const errorOutput: string[] = [];

    const exitCode = await runCli(['--root', 'packages'], {
      cwd: workspaceRoot,
      stdout: () => undefined,
      stderr: (value) => errorOutput.push(value),
    });

    expect(exitCode).toBe(1);
    expect(errorOutput.join('')).toContain('Missing multiline JSDoc comments in 1 declaration across 1 package.');
    expect(errorOutput.join('')).toContain('FunctionDeclaration');
    expect(errorOutput.join('')).toContain('add');
  });

  test('prints success and JSON reports to stdout', async () => {
    const workspaceRoot = await createWorkspace({
      'jsdoc.json': JSON.stringify({ roots: ['packages'], includeExtensions: ['ts'] }),
      'packages/utils/package.json': JSON.stringify({ name: '@scope/utils' }),
      'packages/utils/src/clean.ts': '/**\n * Add.\n */\nexport function add() {}\n',
      'packages/utils/src/dirty.ts': 'export function missing() {}\n',
    });
    const output: string[] = [];

    const successCode = await runCli(['packages/utils/src/clean.ts'], {
      cwd: workspaceRoot,
      stdout: (value) => output.push(value),
      stderr: () => undefined,
    });
    const jsonCode = await runCli(['--json', 'packages/utils/src/dirty.ts'], {
      cwd: workspaceRoot,
      stdout: (value) => output.push(value),
      stderr: () => undefined,
    });

    expect(successCode).toBe(0);
    expect(jsonCode).toBe(1);
    expect(output[0]).toBe('All checked declarations have multiline JSDoc.');
    expect(JSON.parse(output[1] ?? '{}').failures[0].name).toBe('missing');
  });

  test('checks explicitly targeted test files', async () => {
    const workspaceRoot = await createWorkspace({
      'packages/utils/package.json': JSON.stringify({ name: '@scope/utils' }),
      'packages/utils/src/add.test.ts': 'export function missingTestHelper() {}\n',
    });
    const errorOutput: string[] = [];

    const exitCode = await runCli(['packages/utils/src/add.test.ts'], {
      cwd: workspaceRoot,
      stdout: () => undefined,
      stderr: (value) => errorOutput.push(value),
    });

    expect(exitCode).toBe(1);
    expect(errorOutput.join('')).toContain('missingTestHelper');
  });

  test('parses all path flags, double dash targets, and short help', async () => {
    const workspaceRoot = await createWorkspace({
      'packages/utils/package.json': JSON.stringify({ name: '@scope/utils' }),
      'packages/utils/src/dirty.ts': 'export function missing() {}\n',
      'packages/utils/src/ignore-me.ts': 'export function ignoredFile() {}\n',
      'packages/utils/generated/ignored.ts': 'export function ignoredPath() {}\n',
    });
    const output: string[] = [];
    const errorOutput: string[] = [];

    const helpCode = await runCli(['-h'], {
      cwd: workspaceRoot,
      stdout: (value) => output.push(value),
      stderr: () => undefined,
    });
    const lintCode = await runCli(
      [
        '--root',
        'packages',
        '--exclude-path',
        'packages/utils/generated',
        '--exclude-file',
        'ignore-me',
        '--include-ext',
        'ts',
        '--',
        'packages/utils/src/dirty.ts',
      ],
      {
        cwd: workspaceRoot,
        stdout: () => undefined,
        stderr: (value) => errorOutput.push(value),
      }
    );

    expect(helpCode).toBe(0);
    expect(lintCode).toBe(1);
    expect(output.join('')).toContain('Usage: jsdoc-lint');
    expect(errorOutput.join('')).toContain('missing');
    expect(errorOutput.join('')).not.toContain('ignored');
  });

  test('loads an explicit config path', async () => {
    const workspaceRoot = await createWorkspace({
      'config/jsdoc.json': JSON.stringify({ roots: ['../packages'], includeExtensions: ['ts'] }),
      'packages/utils/package.json': JSON.stringify({ name: '@scope/utils' }),
      'packages/utils/src/dirty.ts': 'export function missing() {}\n',
    });
    const errorOutput: string[] = [];

    const exitCode = await runCli(['--config', 'config/jsdoc.json'], {
      cwd: workspaceRoot,
      stdout: () => undefined,
      stderr: (value) => errorOutput.push(value),
    });

    expect(exitCode).toBe(1);
    expect(errorOutput.join('')).toContain('missing');
  });

  test('enables optional schema JSDoc rules from CLI flags', async () => {
    const workspaceRoot = await createWorkspace({
      'packages/schemas/package.json': JSON.stringify({ name: '@scope/schemas' }),
      'packages/schemas/src/drizzle.ts': [
        "import { pgTable, uuid } from 'drizzle-orm/pg-core';",
        '/**',
        ' * Workspace table.',
        ' */',
        "export const workspaces = pgTable('workspaces', {",
        '  id: uuid().primaryKey(),',
        '});',
      ].join('\n'),
      'packages/schemas/src/zod.ts': [
        "import { z } from 'zod';",
        '/**',
        ' * Workspace input.',
        ' */',
        'export const workspaceInput = z.object({',
        '  displayName: z.string(),',
        '});',
      ].join('\n'),
    });
    const successOutput: string[] = [];
    const errorOutput: string[] = [];

    const defaultCode = await runCli(['--root', 'packages'], {
      cwd: workspaceRoot,
      stdout: (value) => successOutput.push(value),
      stderr: () => undefined,
    });
    const enabledCode = await runCli(['--root', 'packages', '--require-drizzle-jsdoc', '--require-zod-jsdoc'], {
      cwd: workspaceRoot,
      stdout: () => undefined,
      stderr: (value) => errorOutput.push(value),
    });

    expect(defaultCode).toBe(0);
    expect(successOutput.join('')).toContain('All checked declarations have multiline JSDoc.');
    expect(enabledCode).toBe(1);
    expect(errorOutput.join('')).toContain('DrizzleSchemaProperty');
    expect(errorOutput.join('')).toContain('id');
    expect(errorOutput.join('')).toContain('ZodSchemaProperty');
    expect(errorOutput.join('')).toContain('displayName');
  });

  test('returns usage errors for invalid arguments', async () => {
    const errorOutput: string[] = [];

    await expect(
      runCli(['--unknown'], {
        stderr: (value) => errorOutput.push(value),
      })
    ).resolves.toBe(2);
    await expect(
      runCli(['--config'], {
        stderr: (value) => errorOutput.push(value),
      })
    ).resolves.toBe(2);

    expect(errorOutput.join('\n')).toContain('Unknown option: --unknown');
    expect(errorOutput.join('\n')).toContain('Missing value for --config');
  });

  test('uses console output defaults when no IO context is provided', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(runCli(['--help'])).resolves.toBe(0);
      await expect(runCli(['--unknown'])).resolves.toBe(2);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Usage: jsdoc-lint'));
      expect(error).toHaveBeenCalledWith('Unknown option: --unknown');
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });
});

async function createWorkspace(files: Record<string, string>): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'jsdoc-lint-cli-'));

  await Promise.all(
    Object.entries(files).map(async ([filePath, contents]) => {
      const absolutePath = join(workspaceRoot, filePath);
      await mkdir(join(absolutePath, '..'), { recursive: true });
      await writeFile(absolutePath, contents);
    })
  );

  return workspaceRoot;
}
