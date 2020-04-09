import {
  CompletionItemProvider,
  Position,
  CancellationToken,
  CompletionList,
  CompletionItem,
  CompletionContext,
  TextDocument,
  CompletionItemKind,
  Disposable,
  MarkdownString,
  SnippetString,
} from 'vscode';
import Parser from 'tree-sitter';
import Vue from 'tree-sitter-vue';
import { SFCMetaData } from '../types';

type CompletionMap = {
  event: CompletionItem[];
  prop: CompletionItem[];
};

type ComponentCompletionMap = {
  [componentName: string]: CompletionMap;
};

const parser = new Parser();
parser.setLanguage(Vue);
export class TemplateCompletion implements CompletionItemProvider {
  private _disposable: Disposable;
  private _componentMetaDataMap: Record<string, SFCMetaData> = {};
  private _completionMap: ComponentCompletionMap = {};
  // private _preTree!: Tree;
  constructor() {
    const subscriptions: Disposable[] = [];
    this._disposable = Disposable.from(...subscriptions);
  }

  public setComponentMetaDataMap(map: Record<string, SFCMetaData>): void {
    this._componentMetaDataMap = map;
    if (Object.keys(this._componentMetaDataMap).length) {
      this.generationCompletion();
    }
  }
  /**
   * 预先生成completion，缓存
   */
  private generationCompletion(): void {
    // cname means component
    Object.keys(this._componentMetaDataMap).forEach((tagName) => {
      const componentName = this._componentMetaDataMap[tagName].componentName
      const propsList = this._componentMetaDataMap[tagName].parseResult.props;
      const eventList = this._componentMetaDataMap[tagName].parseResult.events;

      this._completionMap[tagName] = { event: [], prop: [] };
      if (propsList) {
        const propsCompletion: CompletionItem[] = propsList.map((prop) => {
          const documentation = JSON.stringify(prop, null, 2);
          return {
            label: prop.name,
            sortText: ` ${prop.name}`,
            kind: CompletionItemKind.Property,
            detail: `${componentName}:prop`,
            documentation: new MarkdownString('').appendCodeblock(
              documentation,
              'json'
            ),
          };
        });
        this._completionMap[tagName].prop = propsCompletion;
      }
      if (eventList) {
        const eventsCompletion: CompletionItem[] = eventList
          .filter((event) => !event.isSync)
          .map((event) => {
            const documentation = JSON.stringify(event, null, 2);
            return {
              label: event.name,
              sortText: ` ${event.name}`,
              kind: CompletionItemKind.Method,
              detail: `${componentName}:event`,
              documentation: new MarkdownString('').appendCodeblock(
                documentation,
                'json'
              ),
            };
          });
        this._completionMap[tagName].event = eventsCompletion;
      }
    });
  }

  dispose(): void {
    this._disposable.dispose();
  }
  async provideCompletionItems(
    document: TextDocument,
    position: Position,
    token: CancellationToken,
    context: CompletionContext
  ): Promise<CompletionItem[] | CompletionList> {
    if (document.languageId !== 'vue') {
      return [];
    }
    let isDirectiveAttribute = false;
    let matchTagName = '';
    let directiveName = '';
    const curTree = parser.parse(document.getText());
    // use any due to SyntaxNode don't have typeId but run time have.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let curNode: any = curTree.rootNode.namedDescendantForPosition({
      column: position.character,
      row: position.line,
    });
    // [39, 43].includes(curNode.parent.typeId)
    if (
      curNode.parent &&
      // if curNode is a directive_attribut
      (curNode.type === 'directive_attribute' ||
        // if curNode is ERROR
        (curNode.typeId === 65535 &&
          (curNode.parent.typeId === 39 || curNode.parent.typeId === 43)))
    ) {
      if (curNode.type === 'directive_attribute') {
        directiveName = curNode.descendantsOfType('directive_name')[0].text;
        isDirectiveAttribute = true;
      }
      curNode = curNode.parent;
    }
    const nodelist = curNode.descendantsOfType('tag_name');
    matchTagName = nodelist[0].text;
    if (!matchTagName) {
      return [];
    }
    matchTagName = matchTagName.replace(/[-_]/g, '').toUpperCase();
    if (!this._componentMetaDataMap[matchTagName]) {
      return [];
    }
    const completionList: CompletionItem[] = [];
    if (context.triggerCharacter) {
      if (context.triggerCharacter === '@') {
        completionList.push(
          ...this._completionMap[matchTagName].event.map((item) => ({
            ...item,
            insertText: new SnippetString(`${item.label}="$1"$2`),
          }))
        );
      } else if (context.triggerCharacter === ':') {
        completionList.push(
          ...this._completionMap[matchTagName].prop.map((item) => ({
            ...item,
            insertText: new SnippetString(`${item.label}="$1"$2`),
          }))
        );
      }
    } else if (isDirectiveAttribute) {
      if (directiveName === '@') {
        completionList.push(
          ...this._completionMap[matchTagName].event,
        );
      } else if(directiveName === ':') {
        completionList.push(
          ...this._completionMap[matchTagName].prop
        );
      }
    }
    return completionList;
  }
}
