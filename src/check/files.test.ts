import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as ts from 'typescript/unstable/ast';
import { describe, expect, test } from 'vitest';
import { normalizeOptions } from './config.js';
import {
  collectPackageInfos,
  collectSourceFiles,
  parseSourceFile,
  parseSourceFiles,
  shouldScanPath,
  toRelativePath,
} from './files.js';

describe('files', () => {
  test('collects packages and source files with path, extension, and filename filters', async () => {
    const workspaceRoot = await createWorkspace({
      'target/package.json': JSON.stringify({ name: '@scope/excluded-root' }),
      'target/src/index.ts': 'export function excludedRoot() {}',
      'single/package.json': JSON.stringify({ name: '@scope/single' }),
      'single/src/index.js': 'export function singleJs() {}',
      'packages/README.md': 'not a package',
      'packages/not-package/src/index.ts': 'export function notPackage() {}',
      'packages/skip/package.json': JSON.stringify({ name: '@scope/skip' }),
      'packages/skip/src/index.ts': 'export function skippedPackage() {}',
      'packages/keep/package.json': JSON.stringify({ name: '@scope/keep' }),
      'packages/keep/src/index.cjs': 'function cjsFile() {}',
      'packages/keep/src/loop.ts': 'for (const loopArrow = () => {}; false;) {}',
      'packages/keep/src/skip.test.ts': 'export function skippedTest() {}',
      'packages/keep/src/generated/skip.ts': 'export function skippedGenerated() {}',
      'packages/keep/src/nope.css': '.ignored {}',
    });
    await symlink(join(workspaceRoot, 'single/src/index.js'), join(workspaceRoot, 'packages/keep/src/link.js'));

    const options = normalizeOptions({
      workspaceRoot,
      roots: ['missing', 'target', 'single', 'packages'],
      excludePaths: ['target', 'packages/skip', './packages/keep/src/generated/', ''],
      excludeFiles: ['skip\\.test\\.ts$'],
      includeExtensions: ['.js', '.cjs', '.ts'],
    });

    const packageInfos = collectPackageInfos(options);
    expect(packageInfos.map((packageInfo) => packageInfo.name)).toEqual(['@scope/keep', '@scope/single']);

    const keepPackage = packageInfos.find((packageInfo) => packageInfo.name === '@scope/keep');
    expect(keepPackage).toBeDefined();
    expect(
      collectSourceFiles(keepPackage?.root ?? '', options).map((filePath) => toRelativePath(filePath, workspaceRoot))
    ).toEqual(['packages/keep/src/index.cjs', 'packages/keep/src/loop.ts']);
  });

  test('checks target filters and parser script kinds', async () => {
    const workspaceRoot = await createWorkspace({
      'src/file.js': 'export function jsFile() {}',
      'src/file.cjs': 'function cjsFile() {}',
      'src/file.mjs': 'export function mjsFile() {}',
      'src/file.jsx': 'export function jsxFile() { return <div />; }',
      'src/file.tsx': 'export function tsxFile() { return <div />; }',
      'src/file.ts': 'export function tsFile() {}',
    });

    expect(shouldScanPath(join(workspaceRoot, 'src'), [])).toBe(true);
    expect(shouldScanPath(join(workspaceRoot, 'src/file.ts'), [join(workspaceRoot, 'src/file.ts')])).toBe(true);
    expect(shouldScanPath(join(workspaceRoot, 'src/file.ts'), [join(workspaceRoot, 'src')])).toBe(true);
    expect(shouldScanPath(join(workspaceRoot, 'src'), [join(workspaceRoot, 'src/file.ts')])).toBe(true);
    expect(shouldScanPath(join(workspaceRoot, 'other'), [join(workspaceRoot, 'src/file.ts')])).toBe(false);
    expect(parseSourceFiles([])).toEqual([]);

    for (const extension of ['js', 'cjs', 'mjs', 'jsx', 'tsx', 'ts']) {
      expect(ts.isSourceFile(parseSourceFile(join(workspaceRoot, `src/file.${extension}`)))).toBe(true);
    }
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
