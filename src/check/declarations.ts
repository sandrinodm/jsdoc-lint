import * as ts from 'typescript/unstable/ast';

import { createSchemaPropertyClassifier, type SchemaJsDocOptions } from './schema-declarations.ts';
import type { DocumentableDeclaration, FailureEntry } from './types.ts';

/**
 * Walks a source file and reports documentable declarations missing JSDoc.
 *
 * @param sourceFile Parsed source file to inspect.
 * @param onFailure Callback invoked for each missing-doc hit.
 * @param options Optional schema-member rules.
 * @returns Nothing.
 */
export function visitSourceFile(
  sourceFile: ts.SourceFile,
  onFailure: (entry: Pick<FailureEntry, 'kind' | 'line' | 'name'>) => void,
  options: SchemaJsDocOptions = {}
): void {
  const classifySchemaProperty = createSchemaPropertyClassifier(sourceFile, options);

  /**
   * Visits each node in the source file and reports missing JSDoc on documentable declarations.
   *
   * @param node AST node to inspect.
   * @returns Nothing.
   */
  const visit = (node: ts.Node): void => {
    const candidate = getDocumentableDeclaration(node, classifySchemaProperty);
    if (candidate) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(candidate.reportTarget.getStart(sourceFile));

      if (!hasRequiredJsDoc(candidate, sourceFile)) {
        onFailure({
          kind: candidate.kind,
          line: line + 1,
          name: candidate.name,
        });
      } else if (!hasRequiredMemberSpacing(candidate, sourceFile)) {
        onFailure({
          kind: `${candidate.kind}Spacing`,
          line: line + 1,
          name: candidate.name,
        });
      }
    }

    node.forEachChild(visit);
  };

  visit(sourceFile);
}

/**
 * Identifies declarations that should own a JSDoc block.
 *
 * @param node AST node under inspection.
 * @returns Declaration metadata or null.
 */
function getDocumentableDeclaration(
  node: ts.Node,
  classifySchemaProperty: ReturnType<typeof createSchemaPropertyClassifier>
): DocumentableDeclaration | null {
  if (ts.isClassDeclaration(node)) {
    return createDocumentableDeclaration('ClassDeclaration', node.name?.getText() ?? '<anonymous>', node, node);
  }

  if (ts.isInterfaceDeclaration(node)) {
    return createDocumentableDeclaration('InterfaceDeclaration', node.name.getText(), node, node);
  }

  if (ts.isTypeAliasDeclaration(node)) {
    return createDocumentableDeclaration('TypeAliasDeclaration', node.name.getText(), node, node);
  }

  if (ts.isFunctionDeclaration(node)) {
    return createDocumentableDeclaration('FunctionDeclaration', node.name?.getText() ?? '<anonymous>', node, node);
  }

  if (ts.isMethodDeclaration(node) && isDocumentableMethodLikeDeclaration(node)) {
    return createDocumentableDeclaration('MethodDeclaration', node.name.getText(), node, node);
  }

  if (ts.isGetAccessorDeclaration(node) && isDocumentableMethodLikeDeclaration(node)) {
    return createDocumentableDeclaration('GetAccessor', node.name.getText(), node, node);
  }

  if (ts.isSetAccessorDeclaration(node) && isDocumentableMethodLikeDeclaration(node)) {
    return createDocumentableDeclaration('SetAccessor', node.name.getText(), node, node);
  }

  if (ts.isPropertyDeclaration(node) && node.initializer) {
    if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
      return createDocumentableDeclaration(
        ts.isArrowFunction(node.initializer) ? 'ArrowFunctionProperty' : 'FunctionExpressionProperty',
        node.name.getText(),
        node,
        node
      );
    }
  }

  if (ts.isPropertyDeclaration(node) && isNamedDeclarationMember(node.parent)) {
    return createDocumentableDeclaration('PropertyDeclaration', node.name.getText(), node, node);
  }

  if (ts.isPropertySignatureDeclaration(node) && isDocumentableTypeMember(node.parent)) {
    return createDocumentableDeclaration('PropertySignature', node.name.getText(), node, node);
  }

  if (ts.isMethodSignatureDeclaration(node) && isDocumentableTypeMember(node.parent)) {
    return createDocumentableDeclaration('MethodSignature', node.name.getText(), node, node);
  }

  if (ts.isVariableStatement(node) && isTopLevelConstStatement(node)) {
    const declaration = node.declarationList.declarations[0];
    if (!declaration || isFunctionLikeInitializer(declaration.initializer)) {
      return null;
    }

    return createDocumentableDeclaration('TopLevelConstDeclaration', declaration.name.getText(), node, declaration);
  }

  if (ts.isVariableDeclaration(node) && node.initializer) {
    if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
      const statement = findVariableStatement(node);
      const declarationCount = (node.parent as ts.VariableDeclarationList).declarations.length;

      return createDocumentableDeclaration(
        ts.isArrowFunction(node.initializer) ? 'ArrowFunction' : 'FunctionExpression',
        node.name.getText(),
        declarationCount === 1 && statement ? statement : node,
        node
      );
    }
  }

  if (ts.isPropertyAssignment(node) && isTopLevelConstObjectProperty(node)) {
    if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
      return createDocumentableDeclaration(
        ts.isArrowFunction(node.initializer) ? 'ArrowFunctionProperty' : 'FunctionExpressionProperty',
        node.name.getText(),
        node,
        node
      );
    }

    return createDocumentableDeclaration('TopLevelConstPropertyAssignment', node.name.getText(), node, node);
  }

  if (ts.isShorthandPropertyAssignment(node) && isTopLevelConstObjectProperty(node)) {
    return createDocumentableDeclaration('TopLevelConstShorthandProperty', node.name.getText(), node, node);
  }

  const schemaPropertyKind = classifySchemaProperty(node);
  if (schemaPropertyKind) {
    const schemaProperty = node as ts.PropertyAssignment | ts.ShorthandPropertyAssignment;
    return createDocumentableDeclaration(schemaPropertyKind, schemaProperty.name.getText(), node, node);
  }

  return null;
}

/**
 * Checks whether a method-like declaration is a class member or a direct member of a top-level object constant.
 *
 * @param node Method-like declaration to inspect.
 * @returns True when the declaration belongs to a documentable boundary.
 */
function isDocumentableMethodLikeDeclaration(
  node: ts.MethodDeclaration | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration
): boolean {
  return (
    ts.isClassDeclaration(node.parent) ||
    (ts.isObjectLiteralExpression(node.parent) && isTopLevelConstObjectLiteral(node.parent))
  );
}

/**
 * Checks whether a node is a class declaration whose members should be documented individually.
 *
 * @param node AST node to inspect.
 * @returns True when the node is a named class declaration.
 */
function isNamedDeclarationMember(node: ts.Node): boolean {
  return ts.isClassDeclaration(node);
}

/**
 * Checks whether a type member belongs to a supported documentable type.
 *
 * @param node AST node to inspect.
 * @returns True when the member belongs to a documentable type.
 */
function isDocumentableTypeMember(node: ts.Node): boolean {
  if (ts.isInterfaceDeclaration(node)) {
    return true;
  }

  /* v8 ignore next 3 -- TypeScript property and method signatures only have interface or type-literal parents. */
  if (!ts.isTypeLiteralNode(node)) {
    return false;
  }

  return ts.isTypeAliasDeclaration(node.parent) || isClassExtendsTypeArgument(node);
}

/**
 * Checks whether a type literal is a type argument in a class extends expression.
 *
 * @param node Type literal node to inspect.
 * @returns True when the type literal describes an extended class's inline type argument.
 */
function isClassExtendsTypeArgument(node: ts.TypeLiteralNode): boolean {
  let expression: ts.Node = node.parent;

  while (ts.isCallExpression(expression)) {
    const parent = expression.parent;
    if (ts.isExpressionWithTypeArguments(parent)) {
      expression = parent;
      break;
    }

    if (!ts.isCallExpression(parent) || parent.expression !== expression) {
      return false;
    }

    expression = parent;
  }

  if (!ts.isExpressionWithTypeArguments(expression)) {
    return false;
  }

  const heritageClause = expression.parent;
  return (
    ts.isHeritageClause(heritageClause) &&
    heritageClause.token === ts.SyntaxKind.ExtendsKeyword &&
    ts.isClassDeclaration(heritageClause.parent)
  );
}

/**
 * Creates a normalized documentable-declaration descriptor.
 *
 * @param kind Failure kind label.
 * @param name Display name.
 * @param jsDocTarget Node that should own the JSDoc block.
 * @param reportTarget Node used for line reporting.
 * @returns Normalized descriptor.
 */
function createDocumentableDeclaration(
  kind: string,
  name: string,
  jsDocTarget: ts.Node,
  reportTarget: ts.Node
): DocumentableDeclaration {
  return {
    kind,
    name,
    jsDocTarget,
    reportTarget,
  };
}

/**
 * Finds the nearest enclosing variable statement for a variable declaration.
 *
 * @param node Variable declaration node.
 * @returns Enclosing variable statement when present.
 */
function findVariableStatement(node: ts.VariableDeclaration): ts.VariableStatement | null {
  let current: ts.Node | undefined = node.parent;

  while (current) {
    if (ts.isVariableStatement(current)) {
      return current;
    }

    current = current.parent;
  }

  return null;
}

/**
 * Checks whether a declaration has the required JSDoc shape.
 *
 * @param declaration Documentable declaration metadata.
 * @param sourceFile Source file that owns the declaration.
 * @returns True when the declaration satisfies the JSDoc requirement.
 */
function hasRequiredJsDoc(declaration: DocumentableDeclaration, sourceFile: ts.SourceFile): boolean {
  const jsDocBlocks = getJsDocBlocks(declaration.jsDocTarget);
  if (jsDocBlocks.length === 0) {
    return false;
  }

  return jsDocBlocks.some((block) => isMultiLineJsDoc(block, sourceFile));
}

/**
 * Checks whether a documented property member is separated from the next documented member by a blank line.
 *
 * @param declaration Documentable declaration metadata.
 * @param sourceFile Source file that owns the declaration.
 * @returns True when member spacing satisfies the rule.
 */
function hasRequiredMemberSpacing(declaration: DocumentableDeclaration, sourceFile: ts.SourceFile): boolean {
  if (
    declaration.kind !== 'PropertySignature' &&
    declaration.kind !== 'MethodSignature' &&
    declaration.kind !== 'PropertyDeclaration' &&
    declaration.kind !== 'DrizzleSchemaProperty' &&
    declaration.kind !== 'ZodSchemaProperty' &&
    declaration.kind !== 'TopLevelConstDeclaration' &&
    declaration.kind !== 'TopLevelConstPropertyAssignment' &&
    declaration.kind !== 'TopLevelConstShorthandProperty'
  ) {
    return true;
  }

  const nextMember = getNextSiblingDeclarationNode(declaration.jsDocTarget);
  const nextMemberJsDoc = getJsDocBlocks(nextMember ?? undefined);
  if (!nextMember || nextMemberJsDoc.length === 0) {
    return true;
  }

  const firstNextMemberJsDoc = nextMemberJsDoc[0] as ts.JSDoc;

  const currentEndLine = sourceFile.getLineAndCharacterOfPosition(declaration.reportTarget.getEnd()).line;
  const nextCommentStartLine = sourceFile.getLineAndCharacterOfPosition(firstNextMemberJsDoc.getStart(sourceFile)).line;
  return nextCommentStartLine - currentEndLine >= 2;
}

/**
 * Collects JSDoc blocks attached to a declaration node.
 *
 * @param node AST node to inspect.
 * @returns Attached JSDoc blocks.
 */
function getJsDocBlocks(node: ts.Node | undefined): ts.JSDoc[] {
  if (!node) {
    return [];
  }

  return (node.jsDoc ?? []).filter(ts.isJSDoc);
}

/**
 * Checks whether a JSDoc block spans more than one source line.
 *
 * @param block JSDoc block to inspect.
 * @param sourceFile Source file that owns the block.
 * @returns True when the block is written over multiple lines.
 */
function isMultiLineJsDoc(block: ts.JSDoc, sourceFile: ts.SourceFile): boolean {
  return block.getText(sourceFile).includes('\n');
}

/**
 * Returns the next sibling declaration node for members or top-level statements.
 *
 * @param node Current declaration node.
 * @returns The next sibling declaration node when present.
 */
function getNextSiblingDeclarationNode(node: ts.Node): ts.Node | undefined {
  if (
    ts.isInterfaceDeclaration(node.parent) ||
    ts.isTypeLiteralNode(node.parent) ||
    ts.isClassDeclaration(node.parent)
  ) {
    const members = node.parent.members;
    const index = members.indexOf(node as never);
    return members[index + 1];
  }

  if (ts.isObjectLiteralExpression(node.parent)) {
    const properties = node.parent.properties;
    const index = properties.indexOf(node as never);
    return properties[index + 1];
  }

  const statements = (node.parent as ts.SourceFile).statements;
  const index = statements.indexOf(node as never);
  return statements[index + 1];
}

/**
 * Checks whether a variable statement is a top-level const with a single declaration.
 *
 * @param node Variable statement to inspect.
 * @returns True when the statement should be documented as a top-level const.
 */
function isTopLevelConstStatement(node: ts.VariableStatement): boolean {
  return (
    ts.isSourceFile(node.parent) &&
    (node.declarationList.flags & ts.NodeFlags.Const) !== 0 &&
    node.declarationList.declarations.length === 1
  );
}

/**
 * Checks whether a property belongs to the direct object literal initializer of a top-level const.
 *
 * @param node Object literal property to inspect.
 * @returns True when the property should be documented.
 */
function isTopLevelConstObjectProperty(node: ts.PropertyAssignment | ts.ShorthandPropertyAssignment): boolean {
  return ts.isObjectLiteralExpression(node.parent) && isTopLevelConstObjectLiteral(node.parent);
}

/**
 * Checks whether an object literal is the direct initializer of a top-level const declaration.
 *
 * @param node Object literal expression to inspect.
 * @returns True when the object literal belongs to a top-level const.
 */
function isTopLevelConstObjectLiteral(node: ts.ObjectLiteralExpression): boolean {
  const parent = node.parent;
  if (!ts.isVariableDeclaration(parent)) {
    const expressionParent = unwrapExpressionParent(parent);
    if (!expressionParent || !ts.isVariableDeclaration(expressionParent)) {
      return false;
    }

    return isTopLevelConstVariableDeclaration(expressionParent);
  }

  return isTopLevelConstVariableDeclaration(parent);
}

/**
 * Checks whether a variable declaration belongs to a top-level const statement.
 *
 * @param parent Variable declaration to inspect.
 * @returns True when the variable declaration belongs to a top-level const.
 */
function isTopLevelConstVariableDeclaration(parent: ts.VariableDeclaration): boolean {
  const statement = findVariableStatement(parent);
  return Boolean(statement && isTopLevelConstStatement(statement));
}

/**
 * Walks through expression wrappers back to the declaration that owns the expression.
 *
 * @param node Expression wrapper or parent node to inspect.
 * @returns The first non-wrapper parent node.
 */
function unwrapExpressionParent(node: ts.Node): ts.Node | undefined {
  let current = node;

  while (
    ts.isAsExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertion(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.parent;
  }

  return current;
}

/**
 * Checks whether an initializer is already handled by the function-like declaration rules.
 *
 * @param initializer Variable initializer.
 * @returns True when the initializer is a function expression or arrow function.
 */
function isFunctionLikeInitializer(initializer: ts.Expression | undefined): boolean {
  return Boolean(initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)));
}
