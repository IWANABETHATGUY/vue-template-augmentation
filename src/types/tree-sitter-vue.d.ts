declare module 'tree-sitter-vue' {
  import VueTreeSitter from 'tree-sitter-vue';
}

declare module 'tree-sitter' {
  namespace Parser { 
    interface SyntaxNode {
      typeId: number;
    }
  }
}