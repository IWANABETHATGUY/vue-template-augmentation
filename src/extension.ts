'use strict';
import { ExtensionContext } from 'vscode';
import { VueTemplateCompletion } from '../server/src/index';
export function activate(context: ExtensionContext): void {
    new VueTemplateCompletion(context);
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
