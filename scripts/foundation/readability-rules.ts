/** Enforces visible documentation without pretending to judge its semantic usefulness. */
export const documentation = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: { missing: 'Explain this class or method with a documentation header.' },
  },
  /** Registers syntax visitors without evaluating application code. */
  create(context: any): any {
    const source = context.sourceCode;
    const check = (node: any): void => {
      const target = node.parent?.type === 'ExportNamedDeclaration' ? node.parent : node;
      const comment = source.getCommentsBefore(target).at(-1);
      if (
        !comment ||
        comment.type !== 'Block' ||
        !comment.value.startsWith('*') ||
        !comment.value.replace(/[*\s]/g, '')
      )
        context.report({ node, messageId: 'missing' });
    };
    return {
      ClassDeclaration: check,
      ClassExpression: check,
      MethodDefinition: check,
      TSAbstractMethodDefinition: check,
      'Property[method=true]': check,
    };
  },
};

/** Separates declarations while keeping attached documentation with its declaration. */
export const spacing = {
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    schema: [],
    messages: { missing: 'Separate declarations with a blank line.' },
  },
  /** Registers syntax visitors without evaluating application code. */
  create(context: any): any {
    const source = context.sourceCode;
    const check = (nodes: any[]): void => {
      for (let index = 1; index < nodes.length; index++) {
        const previous = nodes[index - 1];
        const node = nodes[index];
        if (previous.type === 'ImportDeclaration' && node.type === 'ImportDeclaration') continue;
        const comments = source
          .getCommentsBefore(node)
          .filter((item: any) => item.range[0] >= previous.range[1]);
        const start = comments[0] ?? node;
        if (start.loc.start.line - previous.loc.end.line > 1) continue;
        context.report({
          node,
          messageId: 'missing',
          fix: (fixer: any) => fixer.insertTextAfter(previous, '\n'),
        });
      }
    };
    return { Program: (node: any) => check(node.body), ClassBody: (node: any) => check(node.body) };
  },
};
