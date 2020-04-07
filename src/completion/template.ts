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
} from 'vscode';
import Parser, { Tree } from 'tree-sitter';
import Vue from 'tree-sitter-vue';
import { ParserResult } from '@vuese/parser';

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
  private _componentMetaDataMap: Record<string, ParserResult> = {};
  private _completionMap: ComponentCompletionMap = {};
  private _preTree!: Tree;
  constructor() {
    const subscriptions: Disposable[] = [];
    this._disposable = Disposable.from(...subscriptions);
  }

  public setComponentMetaDataMap(map: Record<string, ParserResult>): void {
    debugger
    this._componentMetaDataMap = map;
    this.generationCompletion();
  }
  private generationCompletion(): void {
    debugger
    Object.keys(this._componentMetaDataMap).forEach((componentName) => {
      const propsList = this._componentMetaDataMap[componentName].props;
      const eventList = this._componentMetaDataMap[componentName].events;
      if (propsList) {
        const propsCompletion: CompletionItem[] = propsList.map((prop) => {
          const documentation = JSON.stringify(prop, null, 4);
          return {
            label: prop.name,
            sortText: ` ${prop.name}`,
            kind: CompletionItemKind.Property,
            detail: `${componentName}:prop`,
            documentation,
          };
        });
        this._completionMap[componentName].prop = propsCompletion;
      }
      if (eventList) {
        const eventsCompletion: CompletionItem[] = eventList.map((event) => {
          const documentation = JSON.stringify(event, null, 4);
          return {
            label: event.name,
            sortText: ` ${event.name}`,
            kind: CompletionItemKind.Function,
            detail: `${componentName}:event`,
            documentation: new MarkdownString('').appendCodeblock(
              documentation,
              'json'
            ),
          };
        });
        this._completionMap[componentName].event = eventsCompletion;
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
    debugger
    let matchTagName = '';
    const curTree = parser.parse(document.getText(), this._preTree);
    const curNode = curTree.rootNode.namedDescendantForPosition({
      column: position.character,
      row: position.line,
    });

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
    completionList.push(...this._completionMap[matchTagName].event)
    completionList.push(...this._completionMap[matchTagName].prop)
    return completionList;
  }
}

