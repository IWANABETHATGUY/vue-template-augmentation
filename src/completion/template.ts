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
  workspace,
  Range,
  languages,
} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Nullable } from '../types';
import Parser, { Tree } from 'tree-sitter';
import Vue from 'tree-sitter-vue';
import { ParserResult } from '@vuese/parser';

const parser = new Parser();
parser.setLanguage(Vue);
// TODO: remove
export class TemplateCompletion implements CompletionItemProvider {
  private _disposable: Disposable;
  private _componentMetaDataMap: Record<string, ParserResult> = {};
  private _preTree!: Tree;
  constructor() {
    const subscriptions: Disposable[] = [];
    this._disposable = Disposable.from(...subscriptions);
  }

  public setComponentMetaDataMap(map: Record<string, ParserResult>): void {
    this._componentMetaDataMap = map;
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
    const propsList = this._componentMetaDataMap[matchTagName].props;
    const eventList = this._componentMetaDataMap[matchTagName].events;
    if (propsList) {
      const propsCompletion: CompletionItem[] = propsList.map((prop) => {
        const documentation = JSON.stringify(prop, null, 4);
        return {
          label: prop.name,
          sortText: ` ${prop.name}`,
          kind: CompletionItemKind.Property,
          detail: `${matchTagName}:prop`,
          documentation,
        };
      });
      completionList.push(...propsCompletion);
    }
    if (eventList) {
      const eventsCompletion: CompletionItem[] = eventList.map((event) => {
        const documentation = JSON.stringify(event, null, 4);
        return {
          label: event.name,
          sortText: ` ${event.name}`,
          kind: CompletionItemKind.Function,
          detail: `${matchTagName}:event`,
          documentation,
        };
      });
      completionList.push(...eventsCompletion);
    }
    return completionList;
  }
}

function getInserPathRange(
  range: Range,
  document: TextDocument,
  length: number
): Range {
  const numberOfEndPoint = document.offsetAt(range.end);
  const end = document.positionAt(numberOfEndPoint - 1);
  const start = document.positionAt(numberOfEndPoint - length - 1);
  return new Range(start, end);
}
