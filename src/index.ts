import { ExtensionContext, languages, CompletionItemProvider } from 'vscode';
import { TemplateCompletion } from './completion/template';

export class VueTemplateCompletion {
  private _context: ExtensionContext;
  private _completion!: CompletionItemProvider;

  constructor(context: ExtensionContext) {
    this._context = context;
    this.init();
  }

  init(): void {
    this.initCompletion();
  }
  
  private initCompletion(): void {
    this._completion = new TemplateCompletion();
    this._context.subscriptions.push(
      languages.registerCompletionItemProvider(
        [
          { language: 'vue', scheme: 'file' },
        ],
        this._completion,
        ':',
        '@',
      )
    );
  }
}
