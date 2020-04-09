import {
  ExtensionContext,
  languages,
  window,
  TextDocument,
  workspace,
} from 'vscode';
import { TemplateCompletion } from './completion/template';
import * as path from 'path';
import { Nullable, SFCMetaData } from './types';
import { isRelativePath, asyncFileExist, asyncReadFile, pathAliasMappingGenerator, aliasToRelativePath, generateSFCMetaData } from './utils';




export class VueTemplateCompletion {
  private _context: ExtensionContext;
  private _completion!: TemplateCompletion;
  private _sfcMetaDataMap!: Record<string, SFCMetaData>;
  private _aliasMap: Record<string, string> = {};
  constructor(context: ExtensionContext) {
    this._context = context;
    this.init();
    window.onDidChangeActiveTextEditor(async (event) => {
      if (event) {
        await this.recollectDeppendencies(event.document);
        this.resetComponentMedaData();
      }
    });
  }

  init(): void {
    this.initPathAliasMap();
    this.initCompletion();
  }

  private async initPathAliasMap(): Promise<void> {
    const folders = workspace.workspaceFolders;
    let workdir = '';
    if (folders) {
      workdir = workspace.getWorkspaceFolder(folders[0].uri)?.uri.path ?? '';
    }
    if (!workdir) {
      return;
    }
    const absoluteJsConfigJsonPath = path.resolve(workdir, 'jsconfig.json');
    if (!(await asyncFileExist(absoluteJsConfigJsonPath))) {
      return;
    }
    const file = await asyncReadFile(absoluteJsConfigJsonPath);
    const jsConfig = JSON.parse(file);
    const baseUrl = jsConfig?.compilerOptions?.baseUrl ?? '.';
    const paths: Record<string, Array<string>> =
      jsConfig?.compilerOptions?.paths ?? {};
    for (const [k, v] of Object.entries(paths)) {
      const { alias, path: relativePath } = pathAliasMappingGenerator(k, v);
      if (alias) {
        this._aliasMap[alias] = path.resolve(workdir, baseUrl, relativePath);
      }
    }
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
        '@',
        '#'
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
    // const index = ws.index;
    const content = document.getText();
    // get this file's dirname e.g: /test/test.vue -> `/test`
    const dirName = path.dirname(document.fileName);
    while ((execResult = importReg.exec(content))) {
      // eslint-disable-next-line prefer-const
      let [, componentName, pathOrAlias] = execResult;
      pathOrAlias = pathOrAlias.slice(1, -1);
      let absolutePath: string;
      if (!isRelativePath(pathOrAlias)) {
        pathOrAlias = aliasToRelativePath(this._aliasMap, pathOrAlias);
        if (!pathOrAlias) {
          continue;
        }
        absolutePath = pathOrAlias;
      } else {
        absolutePath = path.resolve(dirName, pathOrAlias);
      }

      const extname = path.extname(absolutePath);
      if (!extname) {
        absolutePath += '.vue';
      }
      if (!absolutePath.endsWith('.vue')) {
        continue;
      }
      if (await asyncFileExist(absolutePath)) {
        importMap[componentName] = absolutePath;
      } else if (await asyncFileExist(absolutePath.slice(0, -4) + '/index.vue')) {
        importMap[componentName] = absolutePath.slice(0, -4) + '/index.vue'
      }
    }
    const promiseList = Object.keys(importMap).map(async (componentName) => {
      try {
        const ParserResult = await generateSFCMetaData(
          importMap[componentName]
        );
        if (ParserResult) {
          this._sfcMetaDataMap[componentName.toUpperCase()] = {
            absolutePath: importMap[componentName],
            parseResult: ParserResult,
            componentName,

          };
        }
      } catch (err) {
        console.error(err);
      }
    });
    await Promise.all(promiseList)
  }
}
