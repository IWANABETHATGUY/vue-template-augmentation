import { SyntaxNode } from 'web-tree-sitter'
declare module 'web-tree-sitter' {
    interface SyntaxNode {
        typeId: number;
    }

}