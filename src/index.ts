import {
  ExtensionContext,
  languages,
  window,
  TextDocument,
  workspace,
  Position,
} from 'vscode';
import { TemplateCompletion } from './completion/template';
import * as path from 'path';
import { Nullable, SFCMetaData, Dictionary } from './types';
import {
  isRelativePath,
  asyncFileExist,
  asyncReadFile,
  pathAliasMappingGenerator,
  aliasToRelativePath,
  generateSFCMetaData,
} from './utils';
import { TemplateTagDefinition } from './definition';
import Parser, { Tree } from 'web-tree-sitter';
import os from 'os';
import glob from 'glob';
import { promisify } from 'util';
import { parse } from 'jsonc-parser';
const globPromise = promisify(glob);

export class VueTemplateCompletion {
  private _context: ExtensionContext;
  private _completion!: TemplateCompletion;
  _sfcMetaDataMap!: Record<string, SFCMetaData>;
  private _aliasMap: Record<string, string> = {};

  treeSitterMap: Record<string, Tree> = {};
  parser!: Parser;
  platform: string;
  private _tagDefinition!: TemplateTagDefinition;
  constructor(context: ExtensionContext) {
    this.platform = os.platform();
    this._context = context;

    this.init().then(() => {
      if (window.activeTextEditor) {
        this.recollectDependencies(window.activeTextEditor.document);
      }
    });
    window.onDidChangeActiveTextEditor(async event => {
      if (event) {
        if (event.document.languageId !== 'vue') {
          return;
        }
        try {
          await this.recollectDependencies(event.document);
        } catch (err) {
          console.error(err);
        }
        this.updateComponentMetaData();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const uri = event.document.uri.toString();
        // console.time('init Parsing');
        if (!this.treeSitterMap[uri]) {
          this.treeSitterMap[uri] = this.parser.parse(event.document.getText());
        }
        // console.timeEnd('init Parsing');
      }
    });
    workspace.onDidChangeTextDocument(event => {
      if (event.document.languageId !== 'vue') {
        return;
      }
      // console.time('increasing parse');
      const uri = event.document.uri.toString();
      const currentTree = this.treeSitterMap[uri];
      if (currentTree) {
        for (const change of event.contentChanges) {
          const startIndex = change.rangeOffset;
          const oldEndIndex = change.rangeOffset + change.rangeLength;
          const newEndIndex = change.rangeOffset + change.text.length;
          const startPos = event.document.positionAt(startIndex);
          const oldEndPos = event.document.positionAt(oldEndIndex);
          const newEndPos = event.document.positionAt(newEndIndex);
          const startPosition = this.asPoint(startPos);
          const oldEndPosition = this.asPoint(oldEndPos);
          const newEndPosition = this.asPoint(newEndPos);
          const delta = {
            startIndex,
            oldEndIndex,
            newEndIndex,
            startPosition,
            oldEndPosition,
            newEndPosition,
          };
          currentTree.edit(delta);
        }
      }
      this.treeSitterMap[uri] = this.parser.parse(
        event.document.getText(),
        currentTree
      );
      // console.timeEnd('increasing parse');
    });
  }

  /**
   * transform Vscode.Point into a Treesitter Point
   *
   * @private
   * @param {Position} pos
   * @returns {Parser.Point}
   * @memberof VueTemplateCompletion
   */
  private asPoint(pos: Position): Parser.Point {
    return { row: pos.line, column: pos.character };
  }
  private async init(): Promise<void> {
    await this.initParser();
    await this.initPathAliasMap();
    this.initCompletion();
    this.initDefinition();
  }
  private async initParser(): Promise<void> {
    await Parser.init();
    const parser = new Parser();
    const Lang = await Parser.Language.load(
      path.resolve(__dirname, '../parser/tree-sitter-vue.wasm')
    );
    parser.setLanguage(Lang);
    this.parser = parser;
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
    let absoluteTsConfigJsonPathList: string[] = [];
    try {
      absoluteJsConfigJsonPathList = await globPromise(
        `${workdir}/jsconfig.json`
      );
      absoluteTsConfigJsonPathList = await globPromise(
        `${workdir}/tsconfig.json`
      );
      await Promise.all(
        absoluteJsConfigJsonPathList.map(async configPath => {
          await this.generateAliasPathFromConfigJson(configPath, workdir);
        })
      );
      await Promise.all(
        absoluteTsConfigJsonPathList.map(async configPath => {
          try {
            await this.generateAliasPathFromConfigJson(configPath, workdir);
          } catch (err) {
            console.warn(err);
          }
        })
      );
    } catch (err) {
      console.log(err);
    }
  }

  private async generateAliasPathFromConfigJson(
    absoluteConfigJsonPath: string,
    workdir: string
  ): Promise<void> {
    if (!(await asyncFileExist(absoluteConfigJsonPath))) {
      return;
    }
    const file = await asyncReadFile(absoluteConfigJsonPath);
    let config: Dictionary = {};
    try {
      config = parse(file);
    } catch (err) {
      console.error(err);
    }
    const baseUrl = config?.compilerOptions?.baseUrl ?? '.';
    const paths: Record<string, Array<string>> =
      config?.compilerOptions?.paths ?? {};
    for (const [k, v] of Object.entries(paths)) {
      const { alias, path: relativePath } = pathAliasMappingGenerator(k, v);
      if (alias) {
        this._aliasMap[alias] = path.resolve(workdir, baseUrl, relativePath);
      }
    }
  }

  private updateComponentMetaData(): void {
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
