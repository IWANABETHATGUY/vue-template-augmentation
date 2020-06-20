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
import {
  isRelativePath,
  asyncFileExist,
  asyncReadFile,
  pathAliasMappingGenerator,
  aliasToRelativePath,
  generateSFCMetaData,
} from './utils';
import { TemplateTagDefinition } from './definition';
import Parser, { Tree } from 'tree-sitter';
import Vue from 'tree-sitter-vue';
import os from 'os';
import glob from 'glob';
import { promisify } from 'util';

const globPromise = promisify(glob);

export class VueTemplateCompletion {
  private _context: ExtensionContext;
  private _completion!: TemplateCompletion;
  _sfcMetaDataMap!: Record<string, SFCMetaData>;
  private _aliasMap: Record<string, string> = {};
  tree!: Tree;
  parser: Parser;
  platform: string;
  private _tagDefinition!: TemplateTagDefinition;
  constructor(context: ExtensionContext) {
    this.platform = os.platform();
    this._context = context;
    this.parser = new Parser();
    this.parser.setLanguage(Vue);
    this.init();
    window.onDidChangeActiveTextEditor(async event => {
      if (event) {
        await this.recollectDependencies(event.document);
        this.resetComponentMetaData();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.tree = undefined as any;
      }
    });
  }

  private init(): void {
    this.initPathAliasMap();
    this.initCompletion();
    this.initDefinition();
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
    if (this.platform === 'win32') {
      workdir = workdir.slice(1);
    }
    let absoluteJsConfigJsonPathList: string[] = [];
    try {
      absoluteJsConfigJsonPathList = await globPromise(
        `${workdir}/jsconfig.json`
      );
    } catch (err) {
      console.error(err);
    }
    let absoluteJsConfigJsonPath: string =
      absoluteJsConfigJsonPathList?.[0] || '';
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

  private resetComponentMetaData(): void {
    this._completion.setComponentMetaDataMap(this._sfcMetaDataMap);
  }

  private initCompletion(): void {
    this._completion = new TemplateCompletion(this);
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

  private initDefinition(): void {
    this._tagDefinition = new TemplateTagDefinition(this);
    this._context.subscriptions.push(
      languages.registerDefinitionProvider(
        [{ language: 'vue', scheme: 'file' }],
        this._tagDefinition
      )
    );
  }
  // 重新收集依赖的 引入的组件 元信息， 比如 props,event 等等
  private async recollectDependencies(document: TextDocument): Promise<void> {
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
      } else if (
        await asyncFileExist(absolutePath.slice(0, -4) + '/index.vue')
      ) {
        importMap[componentName] = absolutePath.slice(0, -4) + '/index.vue';
      }
    }
    const promiseList = Object.keys(importMap).map(async componentName => {
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
    await Promise.all(promiseList);
  }
}
