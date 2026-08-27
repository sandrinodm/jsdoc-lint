import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { visitSourceFile } from './declarations.js';
import type { FailureEntry } from './types.js';

describe('visitSourceFile', () => {
  test('reports every supported documentable declaration kind', () => {
    const failures = collectDeclarationFailures(
      [
        'export class Widget {',
        '  value: string;',
        '  initialized = 1;',
        '  method() {}',
        '  get label() { return this.value; }',
        '  set label(value: string) { this.value = value; }',
        '  fieldArrow = () => {};',
        '  fieldFunction = function () {};',
        '}',
        'export interface Store {',
        '  all(...params: unknown[]): MaybePromise<unknown[]>;',
        '}',
        'export default class {',
        '}',
        'export type Shape = {',
        '  area: number;',
        '  get(...params: unknown[]): MaybePromise<unknown>;',
        '};',
        'export default function() {}',
        'export function makeWidget() {}',
        'const answer = 42;',
        'const arrow = () => {};',
        'const expression = function () {};',
        'const values = {',
        '  one: 1,',
        '  two,',
        '  skip() {},',
        '  nestedArrow: () => {},',
        '  nested: {',
        '    value: 1,',
        '    arrow: () => {},',
        '    fn: function () {}',
        '  },',
        '};',
        'const pair = 1, other = 2;',
        'let ignored = 1;',
        'const wrapped = ({',
        '  wrappedValue: 1',
        '} satisfies Record<string, number>);',
        'const nonNullWrapped = ({',
        '  nonNullValue: 1',
        '} as Record<string, number>)!;',
        'const two = 2;',
        'for (const loopArrow = () => {}; false;) {}',
      ].join('\n'),
      'all.tsx',
      ts.ScriptKind.TSX
    );

    expect(failures.map(({ kind, name }) => ({ kind, name }))).toEqual([
      { kind: 'ClassDeclaration', name: 'Widget' },
      { kind: 'PropertyDeclaration', name: 'value' },
      { kind: 'PropertyDeclaration', name: 'initialized' },
      { kind: 'MethodDeclaration', name: 'method' },
      { kind: 'GetAccessor', name: 'label' },
      { kind: 'SetAccessor', name: 'label' },
      { kind: 'ArrowFunctionProperty', name: 'fieldArrow' },
      { kind: 'FunctionExpressionProperty', name: 'fieldFunction' },
      { kind: 'InterfaceDeclaration', name: 'Store' },
      { kind: 'MethodSignature', name: 'all' },
      { kind: 'ClassDeclaration', name: '<anonymous>' },
      { kind: 'TypeAliasDeclaration', name: 'Shape' },
      { kind: 'PropertySignature', name: 'area' },
      { kind: 'MethodSignature', name: 'get' },
      { kind: 'FunctionDeclaration', name: '<anonymous>' },
      { kind: 'FunctionDeclaration', name: 'makeWidget' },
      { kind: 'TopLevelConstDeclaration', name: 'answer' },
      { kind: 'ArrowFunction', name: 'arrow' },
      { kind: 'FunctionExpression', name: 'expression' },
      { kind: 'TopLevelConstDeclaration', name: 'values' },
      { kind: 'TopLevelConstPropertyAssignment', name: 'one' },
      { kind: 'TopLevelConstShorthandProperty', name: 'two' },
      { kind: 'MethodDeclaration', name: 'skip' },
      { kind: 'TopLevelConstPropertyAssignment', name: 'nested' },
      { kind: 'ArrowFunctionProperty', name: 'arrow' },
      { kind: 'FunctionExpressionProperty', name: 'fn' },
      { kind: 'TopLevelConstDeclaration', name: 'wrapped' },
      { kind: 'TopLevelConstPropertyAssignment', name: 'wrappedValue' },
      { kind: 'TopLevelConstDeclaration', name: 'nonNullWrapped' },
      { kind: 'TopLevelConstPropertyAssignment', name: 'nonNullValue' },
      { kind: 'TopLevelConstDeclaration', name: 'two' },
      { kind: 'ArrowFunction', name: 'loopArrow' },
    ]);
  });

  test('accepts documented declarations and reports documented member spacing', () => {
    const failures = collectDeclarationFailures(
      [
        '/**',
        ' * Widget.',
        ' */',
        'export class Widget {',
        '  /**',
        '   * First.',
        '   */',
        '  first: string;',
        '  /**',
        '   * Second.',
        '   */',
        '  second: string;',
        '',
        '  /**',
        '   * Action.',
        '   */',
        '  action() {}',
        '}',
        '/**',
        ' * Named user.',
        ' */',
        'export interface User {',
        '  /** inline is not enough */',
        '  id: string;',
        '',
        '  /**',
        '   * Name.',
        '   */',
        '  name: string;',
        '',
        '  /**',
        '   * Find user.',
        '   */',
        '  find(id: string): User;',
        '  /**',
        '   * Update user.',
        '   */',
        '  update(id: string): User;',
        '}',
        '/**',
        ' * Alias.',
        ' */',
        'export type Alias = {',
        '  /**',
        '   * Enabled.',
        '   */',
        '  enabled: boolean;',
        '};',
        '/**',
        ' * Count.',
        ' */',
        'const count = 1;',
        '/**',
        ' * Config.',
        ' */',
        'const config = {',
        '  /**',
        '   * Host.',
        '   */',
        "  host: 'localhost'",
        '};',
        '/**',
        ' * Compute.',
        ' */',
        'const compute = () => 1;',
        '/**',
        ' * Final.',
        ' */',
        'const finalValue = 1;',
      ].join('\n')
    );

    expect(failures.map(({ kind, name }) => ({ kind, name }))).toEqual([
      { kind: 'PropertyDeclarationSpacing', name: 'first' },
      { kind: 'PropertySignature', name: 'id' },
      { kind: 'MethodSignatureSpacing', name: 'find' },
      { kind: 'TopLevelConstDeclarationSpacing', name: 'count' },
      { kind: 'TopLevelConstDeclarationSpacing', name: 'config' },
    ]);
  });

  test('reports single-line JSDoc on every documentable declaration kind', () => {
    const failures = collectDeclarationFailures(
      [
        '/** Widget. */',
        'export class Widget {',
        '  /** Value. */',
        '  value: string;',
        '  /** Method. */',
        '  method() {}',
        '  /** Label. */',
        '  get label() { return this.value; }',
        '  /** Label setter. */',
        '  set label(value: string) { this.value = value; }',
        '  /** Field arrow. */',
        '  fieldArrow = () => {};',
        '  /** Field function. */',
        '  fieldFunction = function () {};',
        '}',
        '/** User. */',
        'export interface User {',
        '  /** ID. */',
        '  id: string;',
        '  /** Find. */',
        '  find(id: string): User;',
        '}',
        '/** Alias. */',
        'export type Alias = {',
        '  /** Enabled. */',
        '  enabled: boolean;',
        '  /** Run. */',
        '  run(...params: unknown[]): unknown;',
        '};',
        '/** Make widget. */',
        'export function makeWidget() {}',
        '/** Count. */',
        'const count = 1;',
        '/** Compute. */',
        'const compute = () => 1;',
        '/** Expression. */',
        'const expression = function () {};',
        '/** Loader. */',
        'const loader = createLoader({',
        '  /** Component. */',
        '  component() {},',
        '  /** Nested arrow. */',
        '  nestedArrow: () => {},',
        '  /** Nested function. */',
        '  nestedFunction: function () {}',
        '});',
      ].join('\n')
    );

    expect(failures.map(({ kind, name }) => ({ kind, name }))).toEqual([
      { kind: 'ClassDeclaration', name: 'Widget' },
      { kind: 'PropertyDeclaration', name: 'value' },
      { kind: 'MethodDeclaration', name: 'method' },
      { kind: 'GetAccessor', name: 'label' },
      { kind: 'SetAccessor', name: 'label' },
      { kind: 'ArrowFunctionProperty', name: 'fieldArrow' },
      { kind: 'FunctionExpressionProperty', name: 'fieldFunction' },
      { kind: 'InterfaceDeclaration', name: 'User' },
      { kind: 'PropertySignature', name: 'id' },
      { kind: 'MethodSignature', name: 'find' },
      { kind: 'TypeAliasDeclaration', name: 'Alias' },
      { kind: 'PropertySignature', name: 'enabled' },
      { kind: 'MethodSignature', name: 'run' },
      { kind: 'FunctionDeclaration', name: 'makeWidget' },
      { kind: 'TopLevelConstDeclaration', name: 'count' },
      { kind: 'ArrowFunction', name: 'compute' },
      { kind: 'FunctionExpression', name: 'expression' },
      { kind: 'TopLevelConstDeclaration', name: 'loader' },
      { kind: 'MethodDeclaration', name: 'component' },
      { kind: 'ArrowFunctionProperty', name: 'nestedArrow' },
      { kind: 'FunctionExpressionProperty', name: 'nestedFunction' },
    ]);
  });

  test('reports undocumented members in an inline class heritage type argument', () => {
    const failures = collectDeclarationFailures(
      [
        '/**',
        ' * Preserves the Effect Config failure when startup settings are missing or invalid.',
        ' */',
        "export class RuntimeConfigError extends Data.TaggedError('RuntimeConfigError')<{",
        '  readonly cause: unknown;',
        '  readonly message: string;',
        '}> {}',
      ].join('\n')
    );

    expect(failures.map(({ kind, name }) => ({ kind, name }))).toEqual([
      { kind: 'PropertySignature', name: 'cause' },
      { kind: 'PropertySignature', name: 'message' },
    ]);
  });

  test('requires class JSDoc independently of inline class heritage member JSDoc', () => {
    const failures = collectDeclarationFailures(
      [
        "export class RuntimeConfigError extends Data.TaggedError('RuntimeConfigError')<{",
        '  /**',
        '   * Original failure.',
        '   */',
        '  readonly cause: unknown;',
        '',
        '  /**',
        '   * Safe failure message.',
        '   */',
        '  readonly message: string;',
        '}> {}',
      ].join('\n')
    );

    expect(failures.map(({ kind, name }) => ({ kind, name }))).toEqual([
      { kind: 'ClassDeclaration', name: 'RuntimeConfigError' },
    ]);
  });

  test('optionally reports undocumented Drizzle table members', () => {
    const sourceText = [
      "import { sql } from 'drizzle-orm';",
      "import { check, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';",
      '',
      '/**',
      ' * Canonical workspace persistence schema.',
      ' */',
      'export const workspaces = pgTable(',
      "  'workspaces',",
      '  {',
      '    id: uuid().defaultRandom().primaryKey(),',
      "    displayName: varchar('display_name', { length: 120 }).notNull(),",
      "    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),",
      "    updatedAt: timestamp('updated_at', { withTimezone: true })",
      '      .defaultNow()',
      '      .$onUpdate(() => new Date())',
      '      .notNull(),',
      '  },',
      `  (table) => [check('workspaces_display_name_not_blank', sql\`char_length(btrim(\${table.displayName})) > 0\`)],`,
      ');',
    ].join('\n');

    expect(collectDeclarationFailures(sourceText)).toEqual([]);
    expect(
      collectDeclarationFailures(sourceText, 'source.ts', ts.ScriptKind.TS, { requireDrizzleJsDoc: true }).map(
        ({ kind, name }) => ({ kind, name })
      )
    ).toEqual([
      { kind: 'DrizzleSchemaProperty', name: 'id' },
      { kind: 'DrizzleSchemaProperty', name: 'displayName' },
      { kind: 'DrizzleSchemaProperty', name: 'createdAt' },
      { kind: 'DrizzleSchemaProperty', name: 'updatedAt' },
    ]);
  });

  test('optionally reports undocumented Zod object members', () => {
    const sourceText = [
      "import { z } from 'zod';",
      '',
      '/**',
      ' * Workspace input schema.',
      ' */',
      'export const workspaceSchema = z.object({',
      '  id: z.uuid(),',
      '  profile: z.object({',
      '    displayName: z.string(),',
      '  }),',
      '});',
    ].join('\n');

    expect(collectDeclarationFailures(sourceText)).toEqual([]);
    expect(
      collectDeclarationFailures(sourceText, 'source.ts', ts.ScriptKind.TS, { requireZodJsDoc: true }).map(
        ({ kind, name }) => ({ kind, name })
      )
    ).toEqual([
      { kind: 'ZodSchemaProperty', name: 'id' },
      { kind: 'ZodSchemaProperty', name: 'profile' },
      { kind: 'ZodSchemaProperty', name: 'displayName' },
    ]);
  });

  test('recognizes aliased Drizzle and namespace Zod imports', () => {
    const sourceText = [
      "import { pgTable as defineTable, uuid } from 'drizzle-orm/pg-core';",
      "import * as schema from 'zod';",
      '',
      '/**',
      ' * Workspace table.',
      ' */',
      "export const workspaces = defineTable('workspaces', {",
      '  /**',
      '   * Workspace identifier.',
      '   */',
      '  id: uuid(),',
      '});',
      '',
      '/**',
      ' * Workspace input.',
      ' */',
      'export const workspaceInput = schema.strictObject({',
      '  /**',
      '   * Workspace display name.',
      '   */',
      '  displayName: schema.string(),',
      '});',
    ].join('\n');

    expect(
      collectDeclarationFailures(sourceText, 'source.ts', ts.ScriptKind.TS, {
        requireDrizzleJsDoc: true,
        requireZodJsDoc: true,
      })
    ).toEqual([]);
  });

  test('ignores members of inline parameter object types', () => {
    const failures = collectDeclarationFailures(
      [
        '/**',
        ' * Accepts inline input.',
        ' */',
        'export function accept(input: {',
        '  value: string;',
        '  run(): void;',
        '}) {',
        '  return input;',
        '}',
      ].join('\n')
    );

    expect(failures).toEqual([]);
  });
});

function collectDeclarationFailures(
  sourceText: string,
  fileName = 'source.ts',
  scriptKind = ts.ScriptKind.TS,
  options: { requireDrizzleJsDoc?: boolean; requireZodJsDoc?: boolean } = {}
): Pick<FailureEntry, 'kind' | 'line' | 'name'>[] {
  const failures: Pick<FailureEntry, 'kind' | 'line' | 'name'>[] = [];
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, scriptKind);

  visitSourceFile(sourceFile, (failure) => failures.push(failure), options);

  return failures;
}
