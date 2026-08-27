import * as ts from 'typescript/unstable/ast';

/**
 * Optional schema-member JSDoc rules.
 */
export interface SchemaJsDocOptions {
  /**
   * Whether direct Drizzle table members require JSDoc.
   */
  requireDrizzleJsDoc?: boolean;

  /**
   * Whether direct Zod object members require JSDoc.
   */
  requireZodJsDoc?: boolean;
}

/**
 * Schema-specific declaration kinds emitted by the checker.
 */
export type SchemaPropertyKind = 'DrizzleSchemaProperty' | 'ZodSchemaProperty';

/**
 * Imported bindings used to recognize supported schema declaration calls.
 */
interface SchemaBindings {
  /**
   * Local names bound to imported Drizzle table functions.
   */
  drizzleTableFunctions: Set<string>;

  /**
   * Local names bound to Drizzle namespace imports.
   */
  drizzleNamespaces: Set<string>;

  /**
   * Local names bound to imported Zod object functions.
   */
  zodObjectFunctions: Set<string>;

  /**
   * Local names that expose Zod object functions as properties.
   */
  zodNamespaces: Set<string>;
}

/**
 * Zod functions whose first argument declares an object schema's members.
 */
const ZOD_OBJECT_FUNCTION_NAMES = new Set(['object', 'strictObject', 'looseObject']);

/**
 * Creates a source-file-scoped classifier for enabled schema properties.
 *
 * @param sourceFile Source file whose imports should be inspected.
 * @param options Enabled schema-member rules.
 * @returns Function that classifies supported schema properties.
 */
export function createSchemaPropertyClassifier(
  sourceFile: ts.SourceFile,
  options: SchemaJsDocOptions = {}
): (node: ts.Node) => SchemaPropertyKind | null {
  const bindings = collectSchemaBindings(sourceFile, options);

  return (node) => getSchemaPropertyKind(node, bindings);
}

/**
 * Collects imported names used to recognize enabled schema declaration calls.
 *
 * @param sourceFile Source file whose imports should be inspected.
 * @param options Enabled schema-member rules.
 * @returns Imported schema bindings.
 */
function collectSchemaBindings(sourceFile: ts.SourceFile, options: SchemaJsDocOptions): SchemaBindings {
  const bindings: SchemaBindings = {
    drizzleTableFunctions: new Set(),
    drizzleNamespaces: new Set(),
    zodObjectFunctions: new Set(),
    zodNamespaces: new Set(),
  };

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }

    const importClause = statement.importClause;
    if (!importClause) {
      continue;
    }

    const moduleName = statement.moduleSpecifier.text;
    if (options.requireDrizzleJsDoc && isDrizzleModuleName(moduleName)) {
      collectDrizzleBindings(importClause, bindings);
    }

    if (options.requireZodJsDoc && isZodModuleName(moduleName)) {
      collectZodBindings(importClause, bindings);
    }
  }

  return bindings;
}

/**
 * Adds Drizzle table bindings from one import clause.
 *
 * @param importClause Drizzle import clause.
 * @param bindings Schema bindings to update.
 * @returns Nothing.
 */
function collectDrizzleBindings(importClause: ts.ImportClause, bindings: SchemaBindings): void {
  const namedBindings = importClause.namedBindings;
  if (namedBindings && ts.isNamespaceImport(namedBindings)) {
    bindings.drizzleNamespaces.add(namedBindings.name.text);
    return;
  }

  if (!namedBindings || !ts.isNamedImports(namedBindings)) {
    return;
  }

  for (const element of namedBindings.elements) {
    const importedName = element.propertyName?.text ?? element.name.text;
    if (isDrizzleTableFunctionName(importedName)) {
      bindings.drizzleTableFunctions.add(element.name.text);
    }
  }
}

/**
 * Adds Zod object-schema bindings from one import clause.
 *
 * @param importClause Zod import clause.
 * @param bindings Schema bindings to update.
 * @returns Nothing.
 */
function collectZodBindings(importClause: ts.ImportClause, bindings: SchemaBindings): void {
  if (importClause.name) {
    bindings.zodNamespaces.add(importClause.name.text);
  }

  const namedBindings = importClause.namedBindings;
  if (namedBindings && ts.isNamespaceImport(namedBindings)) {
    bindings.zodNamespaces.add(namedBindings.name.text);
    return;
  }

  if (!namedBindings || !ts.isNamedImports(namedBindings)) {
    return;
  }

  for (const element of namedBindings.elements) {
    const importedName = element.propertyName?.text ?? element.name.text;
    if (importedName === 'z') {
      bindings.zodNamespaces.add(element.name.text);
    } else if (ZOD_OBJECT_FUNCTION_NAMES.has(importedName)) {
      bindings.zodObjectFunctions.add(element.name.text);
    }
  }
}

/**
 * Identifies an enabled schema property declaration.
 *
 * @param node AST node under inspection.
 * @param bindings Imported schema bindings.
 * @returns Schema-specific failure kind or null.
 */
function getSchemaPropertyKind(node: ts.Node, bindings: SchemaBindings): SchemaPropertyKind | null {
  if (
    (!ts.isPropertyAssignment(node) && !ts.isShorthandPropertyAssignment(node)) ||
    !ts.isObjectLiteralExpression(node.parent)
  ) {
    return null;
  }

  const callArgument = findContainingCallArgument(node.parent);
  if (!callArgument) {
    return null;
  }

  const [callExpression, argumentIndex] = callArgument;
  if (argumentIndex === 1 && isDrizzleTableCall(callExpression.expression, bindings)) {
    return 'DrizzleSchemaProperty';
  }

  if (argumentIndex === 0 && isZodObjectCall(callExpression.expression, bindings)) {
    return 'ZodSchemaProperty';
  }

  return null;
}

/**
 * Finds the call expression and argument index that directly contain an object literal.
 *
 * @param objectLiteral Object literal to inspect.
 * @returns Owning call and argument index, or null when the object is not a direct argument.
 */
function findContainingCallArgument(
  objectLiteral: ts.ObjectLiteralExpression
): readonly [ts.CallExpression, number] | null {
  let argument: ts.Node = objectLiteral;

  while (
    ts.isAsExpression(argument.parent) ||
    ts.isParenthesizedExpression(argument.parent) ||
    ts.isSatisfiesExpression(argument.parent) ||
    ts.isTypeAssertion(argument.parent) ||
    ts.isNonNullExpression(argument.parent)
  ) {
    argument = argument.parent;
  }

  if (!ts.isCallExpression(argument.parent)) {
    return null;
  }

  const argumentIndex = argument.parent.arguments.indexOf(argument as ts.Expression);
  return [argument.parent, argumentIndex];
}

/**
 * Checks whether a call target is an imported Drizzle table function.
 *
 * @param expression Call target expression.
 * @param bindings Imported schema bindings.
 * @returns True when the target creates a Drizzle table.
 */
function isDrizzleTableCall(expression: ts.Expression, bindings: SchemaBindings): boolean {
  if (ts.isIdentifier(expression)) {
    return bindings.drizzleTableFunctions.has(expression.text);
  }

  return (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    bindings.drizzleNamespaces.has(expression.expression.text) &&
    isDrizzleTableFunctionName(expression.name.text)
  );
}

/**
 * Checks whether a call target is an imported Zod object function.
 *
 * @param expression Call target expression.
 * @param bindings Imported schema bindings.
 * @returns True when the target creates a Zod object schema.
 */
function isZodObjectCall(expression: ts.Expression, bindings: SchemaBindings): boolean {
  if (ts.isIdentifier(expression)) {
    return bindings.zodObjectFunctions.has(expression.text);
  }

  return (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    bindings.zodNamespaces.has(expression.expression.text) &&
    ZOD_OBJECT_FUNCTION_NAMES.has(expression.name.text)
  );
}

/**
 * Checks whether a module specifier belongs to Drizzle ORM.
 *
 * @param moduleName Imported module name.
 * @returns True for Drizzle ORM package paths.
 */
function isDrizzleModuleName(moduleName: string): boolean {
  return moduleName === 'drizzle-orm' || moduleName.startsWith('drizzle-orm/');
}

/**
 * Checks whether an imported Drizzle name is a table declaration function.
 *
 * @param name Imported function name.
 * @returns True for dialect table declaration functions.
 */
function isDrizzleTableFunctionName(name: string): boolean {
  return name.endsWith('Table');
}

/**
 * Checks whether a module specifier belongs to Zod.
 *
 * @param moduleName Imported module name.
 * @returns True for Zod package paths.
 */
function isZodModuleName(moduleName: string): boolean {
  return moduleName === 'zod' || moduleName.startsWith('zod/');
}
