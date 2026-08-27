import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import {
  createSchemaPropertyClassifier,
  type SchemaJsDocOptions,
  type SchemaPropertyKind,
} from './schema-declarations.js';

describe('createSchemaPropertyClassifier', () => {
  test('recognizes supported imports, shorthand properties, and wrapped schema objects', () => {
    const sourceText = [
      "import drizzleDefault from 'drizzle-orm/default';",
      "import { pgTable as rootTable } from 'drizzle-orm';",
      "import * as drizzle from 'drizzle-orm/pg-core';",
      "import zod from 'zod';",
      "import { object as defineObject } from 'zod/v4';",
      "import 'zod';",
      'const id = drizzle.uuid();',
      "drizzle.pgTable('namespaced', ((({ namespaceColumn: drizzle.text(), id } as const) satisfies Record<string, unknown>)!));",
      "rootTable('root', <Record<string, unknown>>{ rootColumn: drizzle.text() });",
      'zod.looseObject(({ defaultZod: zod.string() }));',
      'defineObject({ namedObject: zod.string() });',
      'void drizzleDefault;',
    ].join('\n');

    expect(
      classifySchemaProperties(sourceText, {
        requireDrizzleJsDoc: true,
        requireZodJsDoc: true,
      })
    ).toEqual([
      { kind: 'DrizzleSchemaProperty', name: 'namespaceColumn' },
      { kind: 'DrizzleSchemaProperty', name: 'id' },
      { kind: 'DrizzleSchemaProperty', name: 'rootColumn' },
      { kind: 'ZodSchemaProperty', name: 'defaultZod' },
      { kind: 'ZodSchemaProperty', name: 'namedObject' },
    ]);
  });

  test('rejects unsupported imports, call targets, factories, and argument positions', () => {
    const sourceText = [
      "import * as drizzle from 'drizzle-orm/pg-core';",
      "import { varchar } from 'drizzle-orm/pg-core';",
      "import * as zod from 'zod';",
      "import { string as zodString } from 'zod';",
      "import { pgTable } from 'not-drizzle';",
      "drizzle['pgTable']('element-access', { elementAccess: 1 });",
      "getDrizzle().pgTable('computed-base', { computedBase: 1 });",
      "other.pgTable('wrong-namespace', { wrongNamespace: 1 });",
      "drizzle.defineSchema('wrong-factory', { wrongFactory: 1 });",
      "pgTable('unbound', { unboundDrizzle: 1 });",
      "zod['object']({ zodElementAccess: 1 });",
      'getZod().object({ zodComputedBase: 1 });',
      'other.object({ zodWrongNamespace: 1 });',
      'zod.string({ zodWrongFactory: 1 });',
      'object({ unboundZod: 1 });',
      'drizzle.pgTable({ wrongDrizzlePosition: 1 });',
      "zod.object('name', { wrongZodPosition: 1 });",
      'const nested = { value: { notACallArgument: 1 } };',
      'void varchar;',
      'void zodString;',
      'void nested;',
    ].join('\n');

    expect(
      classifySchemaProperties(sourceText, {
        requireDrizzleJsDoc: true,
        requireZodJsDoc: true,
      })
    ).toEqual([]);
    expect(classifySchemaProperties(sourceText)).toEqual([]);
  });
});

function classifySchemaProperties(
  sourceText: string,
  options: SchemaJsDocOptions = {}
): Array<{ kind: SchemaPropertyKind; name: string }> {
  const sourceFile = ts.createSourceFile('source.ts', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const classify = createSchemaPropertyClassifier(sourceFile, options);
  const results: Array<{ kind: SchemaPropertyKind; name: string }> = [];

  const visit = (node: ts.Node): void => {
    const kind = classify(node);
    if (kind && (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node))) {
      results.push({ kind, name: node.name.getText(sourceFile) });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return results;
}
