import { SyntaxNode } from 'tree-sitter'
declare module 'tree-sitter' {
    interface SyntaxNode {
        typeId: number;
    }

}