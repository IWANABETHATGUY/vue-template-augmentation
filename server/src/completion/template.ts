import { SFCMetaData } from '../types';
import { VueTemplateAugmentation } from '..';
import {
  CompletionContext,
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind,
} from 'vscode-languageserver';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { getWordRangeAtPosition } from '../utils/completion';

type CompletionMap = {
  event: CompletionItem[];
  prop: CompletionItem[];
  slot: CompletionItem[];
};

type ComponentCompletionMap = {
  [componentName: string]: CompletionMap;
};

enum MyCompletionPositionKind {
  StartTag,
  DirectiveAttribute,
  Attribute,
}

const directiveAttributeRegExp = /[\w_@\-\:]+/;

// HACK: 目前的tagName 转化以及对比做的不好，需要优化

export class TemplateCompletion {
  private _componentMetaDataMap: Record<string, SFCMetaData> = {};
  private _completionMap: ComponentCompletionMap = {};
  private _augmentationContext: VueTemplateAugmentation;
  constructor(context: VueTemplateAugmentation) {
    this._augmentationContext = context;
  }

  async provideCompletionItems(
    document: TextDocument,
    position: Position,
    context: CompletionContext
  ): Promise<CompletionItem[]> {
    if (document.languageId !== 'vue') {
      return [];
    }
    let positionKind = MyCompletionPositionKind.StartTag;
    let matchTagName = '';
    let directiveName = '';
    let attributeName = '';

   
    const curTree = this._augmentationContext.treeSitterMap[
      document.uri.toString()
    ];
    if (!curTree) {
      return [];
    }
    let curNode = curTree.rootNode.namedDescendantForPosition({
      column: position.character,
      row: position.line,
    });

    // [39, 43].includes(curNode.parent.typeId)
    if (
      (curNode.parent &&
        // if curNode is a directive_attribut
        (curNode.type === 'directive_attribute' ||
          // if curNode is ERROR
          (curNode.typeId === 65535 &&
            (curNode.parent.typeId === 39 || curNode.parent.typeId === 43)))) ||
      // if in attribute and slot
      (curNode.type === 'quoted_attribute_value' &&
        curNode.parent?.type === 'attribute')
    ) {
      if (curNode.type === 'directive_attribute') {
        directiveName = curNode.descendantsOfType('directive_name')[0].text;
        positionKind = MyCompletionPositionKind.DirectiveAttribute;
      } else if (curNode.type === 'quoted_attribute_value') {
        positionKind = MyCompletionPositionKind.Attribute;
        curNode = curNode.parent;
        attributeName = curNode.descendantsOfType('attribute_name')[0]?.text;
      }
      if (curNode.parent) {
        curNode = curNode.parent;
      }
    }
    // assert here curNode type is start_tag
    if (curNode.type !== 'start_tag' && curNode.type !== 'self_closing_tag') {
      return [];
    }
    const nodelist = curNode.descendantsOfType('tag_name');
    matchTagName = nodelist[0].text;
    if (!matchTagName) {
      return [];
    }
    matchTagName = matchTagName.replace(/[-_]/g, '').toUpperCase();
    // 不再对tagname 是否存在mata dataMap 中做判断后续 代码需要 做下 option chaining 处理
    // if (!this._componentMetaDataMap[matchTagName]) {
    //   return [];
    // }
    const completionList: CompletionItem[] = [];
    if (context.triggerCharacter) {
      if (context.triggerCharacter === '@') {
        completionList.push(
          ...this.getSFCData(matchTagName, 'event').map(item => ({
            ...item,
            insertText: `${item.label}="$1"$2`,
            insertTextFormat: InsertTextFormat.Snippet,
          }))
        );
      } else if (context.triggerCharacter === ':') {
        // debugger;
        const range = getWordRangeAtPosition(
          document,
          position,
          directiveAttributeRegExp
        );
        if (!range) {
          return [];
        } else {
          const word = document.getText(range);
          if (word.startsWith(':')) {
            completionList.push(
              ...this.getSFCData(matchTagName, 'prop').map(item => ({
                ...item,
                insertText: `${item.label}="$1"$2`,
                insertTextFormat: InsertTextFormat.Snippet,
                //
              }))
            );
          } else if (
            word.startsWith('v-slot:') &&
            matchTagName === 'TEMPLATE'
          ) {
            completionList.push(
              ...this.getSlotCompletionFromCurNode(curNode.parent, this)
            );
          }
        }
      } else if (
        matchTagName === 'TEMPLATE' &&
        context.triggerCharacter === '#' &&
        positionKind === MyCompletionPositionKind.StartTag
      ) {
        completionList.push(
          ...this.getSlotCompletionFromCurNode(curNode.parent, this)
        );
      }
    } else {
      switch (positionKind) {
        case 1:
          if (directiveName === '@') {
            completionList.push(...this.getSFCData(matchTagName, 'event'));
          } else if (directiveName === ':') {
            completionList.push(...this.getSFCData(matchTagName, 'prop'));
          }
          break;
        case 2:
          if (attributeName === 'slot') {
            completionList.push(
              ...this.getSlotCompletionFromCurNode(curNode.parent, this)
            );
          }
          break;
      }
      // if (positionKind === CompletionPositionKind.DirectiveAttribute) {

      // } else if (positionKind === CompletionPositionKind.Attribute) {
      // }
    }
    // console.timeEnd('completion process');
    return completionList;
  }

  public setComponentMetaDataMap(map: Record<string, SFCMetaData>): void {
    this._componentMetaDataMap = map;
    if (Object.keys(this._componentMetaDataMap).length) {
      this.generationCompletion();
    }
  }

  /**
   * 传入当前所在的vslot 节点，返回所有父节点的slot completion
   */
  private getSlotCompletionFromCurNode(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    curNode: any,
    context: TemplateCompletion
  ): CompletionItem[] {
    if (curNode.type === 'element' && curNode.parent) {
      curNode = curNode.parent;
    }
    let targetNode = curNode;
    while (targetNode && targetNode.type !== 'element') {
      targetNode = targetNode.parent;
    }
    if (targetNode.type !== 'element') {
      return [];
    }
    const tagNodeList = targetNode.descendantsOfType('tag_name');
    let matchTagName = tagNodeList[0].text;
    matchTagName = matchTagName.replace(/[-_]/g, '').toUpperCase();
    if (!matchTagName) {
      return [];
    }
    return context.getSFCData(matchTagName.toUpperCase(), 'slot');
  }

  public getSFCData<K extends keyof CompletionMap>(
    componentName: string,
    key: K
  ): CompletionItem[] {
    return this._completionMap[componentName]?.[key] ?? [];
  }

  /**
   * 预先生成completion，缓存
   */
  private generationCompletion(): void {
    // cname means component
    Object.keys(this._componentMetaDataMap).forEach(tagName => {
      const componentName = this._componentMetaDataMap[tagName].componentName;
      const propsList = this._componentMetaDataMap[tagName].parseResult.props;
      const eventList = this._componentMetaDataMap[tagName].parseResult.events;
      const slotList = this._componentMetaDataMap[tagName].parseResult.slots;
      this._completionMap[tagName] = { event: [], prop: [], slot: [] };
      if (propsList) {
        const propsCompletion: CompletionItem[] = propsList.map(prop => {
          const documentation = JSON.stringify(prop, null, 2);
          return {
            label: prop.name,
            sortText: `00000${prop.name}`,
            kind: CompletionItemKind.Reference,
            detail: `${componentName}:prop`,
            documentation,
          };
        });
        this._completionMap[tagName].prop = propsCompletion;
      }
      if (eventList) {
        const eventsCompletion: CompletionItem[] = eventList
          .filter(event => !event.isSync)
          .map(event => {
            const documentation = JSON.stringify(event, null, 2);
            return {
              label: event.name,
              sortText: `00000${event.name}`,
              kind: CompletionItemKind.Event,
              detail: `${componentName}:event`,
              documentation: {
                kind: MarkupKind.Markdown,
                value: documentation,
              },
            };
          });
        this._completionMap[tagName].event = eventsCompletion;
      }
      if (slotList) {
        const eventsCompletion: CompletionItem[] = slotList.map(slot => {
          const documentation = JSON.stringify(slot, null, 2);
          return {
            label: slot.name,
            sortText: `00000${slot.name}`,
            kind: CompletionItemKind.Operator,
            detail: `${componentName}:slot`,
            documentation: { kind: MarkupKind.Markdown, value: documentation },
           
          };
        });
        this._completionMap[tagName].slot = eventsCompletion;
      }
    });
  }
}
