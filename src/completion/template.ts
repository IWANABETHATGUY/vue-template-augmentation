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
  EndOfLine,
} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Nullable } from '../types';
export class TemplateCompletion implements CompletionItemProvider {
  private _disposable: Disposable;

  constructor() {
    const subscriptions: Disposable[] = [];
    this._disposable = Disposable.from(...subscriptions);
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
    console.time('completionVueTemplate');
    const reg = /<([\w-]+)[\s\S]*?((?:\/)?>)/g;
    let execResult: Nullable<RegExpExecArray>;
    // TODO: benchmark 测试下先使用 template 在 经一部 正则匹配
    let matchTagName = '';
    const content = document.getText();
    const offset = document.offsetAt(position);
    // 查看是否在某一个 tag 的前半部分内， -> <Compoment> 或者<Component/>
    while ((execResult = reg.exec(content))) {
      const [match, tagName, endPart] = execResult;
      const lowerBound = execResult.index + tagName.length;
      const upperBound = execResult.index + match.length - endPart.length;
      if (offset > lowerBound && offset <= upperBound) {
        matchTagName = tagName;
        break
      } else if (offset < lowerBound) {
        break;
      }
    }

    if (!matchTagName) {
      return []
    }
    const completionList: CompletionItem[] = [];

    console.timeEnd('completionVueTemplate');

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
