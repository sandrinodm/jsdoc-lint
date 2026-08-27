import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { normalizeOptions, runCheck } from '../index.js';

describe('runCheck', () => {
  test('reports documentable declarations without JSDoc across workspace packages', async () => {
    const workspaceRoot = await createWorkspace({
      'packages/utils/package.json': JSON.stringify({ name: '@scope/utils' }),
      'packages/utils/src/index.ts': [
        '/**',
        ' * Adds two numbers.',
        ' */',
        'export function documentedAdd(left: number, right: number) {',
        '  return left + right;',
        '}',
        '',
        'export function undocumentedAdd(left: number, right: number) {',
        '  return left + right;',
        '}',
        '',
        'export interface User {',
        '  id: string;',
        '}',
      ].join('\n'),
    });

    const result = runCheck(
      normalizeOptions({
        workspaceRoot,
        roots: ['packages'],
      })
    );

    expect(result.failures).toEqual([
      {
        packageName: '@scope/utils',
        packageRelativeRoot: 'packages/utils',
        relativeFilePath: 'packages/utils/src/index.ts',
        line: 8,
        kind: 'FunctionDeclaration',
        name: 'undocumentedAdd',
      },
      {
        packageName: '@scope/utils',
        packageRelativeRoot: 'packages/utils',
        relativeFilePath: 'packages/utils/src/index.ts',
        line: 12,
        kind: 'InterfaceDeclaration',
        name: 'User',
      },
      {
        packageName: '@scope/utils',
        packageRelativeRoot: 'packages/utils',
        relativeFilePath: 'packages/utils/src/index.ts',
        line: 13,
        kind: 'PropertySignature',
        name: 'id',
      },
    ]);
  });

  test('uses dot as the relative root for an unnamed workspace-root package', async () => {
    const workspaceRoot = await createWorkspace({
      'package.json': JSON.stringify({}),
      'src/root.ts': 'export function rootPackage() {}',
    });

    const result = runCheck(normalizeOptions({ workspaceRoot, roots: ['.'] }));

    expect(result.failures).toEqual([
      {
        packageName: '.',
        packageRelativeRoot: '.',
        relativeFilePath: 'src/root.ts',
        line: 1,
        kind: 'FunctionDeclaration',
        name: 'rootPackage',
      },
    ]);
  });

  test('skips packages outside target filters', async () => {
    const workspaceRoot = await createWorkspace({
      'packages/keep/package.json': JSON.stringify({ name: '@scope/keep' }),
      'packages/keep/src/index.ts': 'export function keepMe() {}',
      'packages/skip/package.json': JSON.stringify({ name: '@scope/skip' }),
      'packages/skip/src/index.ts': 'export function skipMe() {}',
    });

    const result = runCheck(
      normalizeOptions({
        cwd: workspaceRoot,
        workspaceRoot,
        roots: ['packages'],
        targets: ['packages/keep'],
      })
    );

    expect(result.failures.map((failure) => failure.name)).toEqual(['keepMe']);
  });

  test('supports normalized options created before schema rules were added', async () => {
    const workspaceRoot = await createWorkspace({
      'package.json': JSON.stringify({ name: 'legacy-options' }),
      'src/index.ts': '/**\n * Documented value.\n */\nexport const value = 1;',
    });
    const {
      requireDrizzleJsDoc: _drizzle,
      requireZodJsDoc: _zod,
      ...legacyOptions
    } = normalizeOptions({
      workspaceRoot,
      roots: ['.'],
    });

    expect(runCheck(legacyOptions)).toEqual({ failures: [] });
  });
});

async function createWorkspace(files: Record<string, string>): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'jsdoc-lint-check-'));

  await Promise.all(
    Object.entries(files).map(async ([filePath, contents]) => {
      const absolutePath = join(workspaceRoot, filePath);
      await mkdir(join(absolutePath, '..'), { recursive: true });
      await writeFile(absolutePath, contents);
    })
  );

  return workspaceRoot;
}
