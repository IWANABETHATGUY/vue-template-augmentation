import {
  DefinitionProvider,
  TextDocument,
  Position,
  CancellationToken,
  ProviderResult,
  Location,
  LocationLink,
  Disposable,
  Uri,
} from 'vscode';
import { VueTemplateCompletion } from '..';

export class TemplateTagDefinition implements DefinitionProvider {
  private _augmentationContext: VueTemplateCompletion;
  private _disposable: Disposable;
  constructor(context: VueTemplateCompletion) {
    const subscriptions: Disposable[] = [];
    this._augmentationContext = context;
    this._disposable = Disposable.from(...subscriptions);
  }
  dispose(): void {
    this._disposable.dispose();
  }
  provideDefinition(
    document: TextDocument,
    position: Position,
    token: CancellationToken
  ): ProviderResult<Location | Location[] | LocationLink[]> {
    if (document.languageId !== 'vue') {
      return [];
    }
    let matchTagName = '';
    // use any due to SyntaxNode don't have typeId but run time have.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // if (!this._augmentationContext.tree || document.isDirty) {
    //   console.time("definition parsing")
    //   this._augmentationContext.tree = this._augmentationContext.parser.parse(document.getText());
    //   console.timeEnd("definition parsing")
    // }
    // console.time('definition process');
    const curTree = this._augmentationContext.treeSitterMap[document.uri.toString()];
    if (!curTree) {
      return [];
    }
    const curNode = curTree.rootNode.namedDescendantForPosition(
      {
        column: position.character,
        row: position.line,
      }
    );
    // [39, 43].includes(curNode.parent.typeId)
    // assert here curNode type is start_tag
    if (curNode.type !== 'tag_name') {
      // console.timeEnd('definition process');
      return null;
    }
    matchTagName = curNode.text;
    if (!matchTagName) {
      // console.timeEnd('definition process');
      return [];
    }
    matchTagName = matchTagName.replace(/[-_]/g, '').toUpperCase();
    const absolutePath = this._augmentationContext._sfcMetaDataMap[matchTagName]
      ?.absolutePath;
    if (!absolutePath) {
      // console.timeEnd('definition process');
      return null;
    }
    // console.timeEnd('definition process');
    return new Location(Uri.file(absolutePath), new Position(0, 0));
  }
}
