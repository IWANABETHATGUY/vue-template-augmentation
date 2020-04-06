import {
  ExtensionContext,
  languages,
  CompletionItemProvider,
  window,
  TextDocument,
  workspace,
} from 'vscode';
import { TemplateCompletion } from './completion/template';
import { parser, ParserResult } from '@vuese/parser';
import * as path from 'path';
import * as fs from 'fs';
import { Nullable } from './types';


function asyncFileExist(path: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      fs.exists(path, (exist) => {
        resolve(exist);
      });
    } catch (err) {
      reject(err);
    }
  });
}

function generateSFCMetaData(absolutePath: string): Promise<ParserResult> {
  return new Promise((resolve, reject) => {
    fs.readFile(absolutePath, { encoding: 'utf8' }, (err, data) => {
      if (err) {
        reject(err);
      } else {
        try {
          resolve(parser(data));
        } catch (error) {
          reject(error);
        }
      }
    });
  });
}


export class VueTemplateCompletion {
  private _context: ExtensionContext;
  private _completion!: TemplateCompletion;
  private _sfcMetaDataMap!: Record<string, ParserResult>;

  constructor(context: ExtensionContext) {
    this._context = context;
    this.init();
    window.onDidChangeActiveTextEditor(async (event) => {
      if (event) {
        await this.recollectDeppendencies(event.document);
        this.resetComponentMedaData()
      }
    });
  }

  
  init(): void {
    this.initCompletion();
  }

  private resetComponentMedaData(): void {
    this._completion.setComponentMetaDataMap(this._sfcMetaDataMap);
  }

  private initCompletion(): void {
    this._completion = new TemplateCompletion();
    this._context.subscriptions.push(
      languages.registerCompletionItemProvider(
        [{ language: 'vue', scheme: 'file' }],
        this._completion,
        ':',
        '@'
      )
    );
  }
  // 重新收集依赖的 引入的组件 元信息， 比如 props,event 等等
  private async recollectDeppendencies(document: TextDocument): Promise<void> {
    this._sfcMetaDataMap = {};
    const importReg = /import\s+([\w]+)\s+from\s*(?:('(?:.*)'|"(?:.*)"))/g;
    // importMap , the key is component name, value is absolutePath
    const importMap: Record<string, string> = {};

    let execResult: Nullable<RegExpExecArray> = null;
    const ws = workspace.getWorkspaceFolder(document.uri);
    if (!ws) {
      return;
    }
    if (document.languageId !== 'vue') {
      return;
    }
    const index = ws.index;
    const content = document.getText();
    // get this file's dirname e.g: /test/test.vue -> `/test`
    const dirName = path.dirname(document.fileName)
    while ((execResult = importReg.exec(content))) {
      // eslint-disable-next-line prefer-const
      let [, componentName, pathOrAlias] = execResult;
      pathOrAlias = pathOrAlias.slice(1, -1);

      let absolutePath = path.resolve(dirName, pathOrAlias);
      const extname = path.extname(absolutePath);
      if (!extname) {
        absolutePath += '.vue';
      }
      if (!absolutePath.endsWith('.vue')) {
        continue;
      }
      if (await asyncFileExist(absolutePath)) {
        importMap[componentName] = absolutePath
      }
    }
    Object.keys(importMap).forEach(async componentName => {
      try {
        const ParserResult = await generateSFCMetaData(importMap[componentName])
        if (ParserResult) {
          this._sfcMetaDataMap[componentName.toUpperCase()] = ParserResult
        }
      } catch (err){
        console.error(err)
      }
      
    })
  }
}



