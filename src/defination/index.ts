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
  private _context: VueTemplateCompletion;
  private _disposable: Disposable;
  constructor(context: VueTemplateCompletion) {
    const subscriptions: Disposable[] = [];
    this._context = context;
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
    if (!this._context.tree || document.isDirty) {
      this._context.tree = this._context.parser.parse(document.getText());
    }
    const curNode = this._context.tree.rootNode.namedDescendantForPosition({
      column: position.character,
      row: position.line,
    });
    // [39, 43].includes(curNode.parent.typeId)
    // assert here curNode type is start_tag
    if (curNode.type !== 'tag_name') {
      return null;
    }
    matchTagName = curNode.text;
    if (!matchTagName) {
      return [];
    }
    matchTagName = matchTagName.replace(/[-_]/g, '').toUpperCase();
    const absolutePath = this._context._sfcMetaDataMap[matchTagName]?.absolutePath
    if (!absolutePath) {
      return null;
    }
    return new Location(
      Uri.file(absolutePath),
      new Position(0, 0)
    );
  }
}
