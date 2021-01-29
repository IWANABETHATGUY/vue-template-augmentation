import { TemplateCompletion } from './completion/template';
import * as path from 'path';
import { Nullable, SFCMetaData, Dictionary } from './types';
import { toUnix } from 'upath';
import {
  isRelativePath,
  asyncFileExist,
  asyncReadFile,
  pathAliasMappingGenerator,
  aliasToRelativePath,
  generateSFCMetaData,
  getTreeSitterEditFromChange,
  transformUriToNormalizedPath,
} from './utils';
// import { TemplateTagDefinition } from './definition';
import Parser, { Tree } from 'web-tree-sitter';
import os from 'os';
import glob from 'glob';
import { promisify } from 'util';
import { parse } from 'jsonc-parser';
import {
  DocumentUri,
  TextDocument,
  TextDocumentContentChangeEvent,
} from 'vscode-languageserver-textdocument';
import {
  DidChangeTextDocumentParams,
  DidOpenTextDocumentParams,
  RemoteWorkspace,
  TextDocumentChangeEvent,
  WorkspaceFolder,
} from 'vscode-languageserver';
const globPromise = promisify(glob);

export class VueTemplateAugmentation {
  // private _context: ExtensionContext;
  // private _completion!: TemplateCompletion;
  _sfcMetaDataMap!: Record<string, SFCMetaData>;
  private _aliasMap: Record<string, string> = {};
  documentManager: Record<string, TextDocument> = {};
  treeSitterMap: Record<string, Tree> = {};
  workspace: RemoteWorkspace;
  parser!: Parser;
  platform: string;
  private _completion: any;
  // private _tagDefinition!: TemplateTagDefinition;
  constructor(workspace: RemoteWorkspace) {
    this.platform = os.platform();
    this.workspace = workspace;
    this.init();
    // window.onDidChangeActiveTextEditor(async event => {
  }
  async onDidOpenTextDocument(params: DidOpenTextDocumentParams) {
    const { uri, version, languageId, text } = params.textDocument;
    // this.updateComponentMetaData();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // lru
    // const objectKeys = Object.keys(this.treeSitterMap);
    // if (objectKeys.length > 5) {
    //   delete this.treeSitterMap[objectKeys[0]];
    // }
    console.time('init Parsing');
    this.documentManager[uri] = TextDocument.create(
      uri,
      languageId,
      version,
      text
    );
    if (this.parser) {
      this.treeSitterMap[uri] = this.parser.parse(text);
    }

    try {
      await this.recollectDependencies(this.documentManager[uri]);
      // this.updateComponentMetaData();
    } catch (err) {
      console.error(err);
    }
    console.timeEnd('init Parsing');
  }
  onDidChangeTextDocument(params: DidChangeTextDocumentParams) {
    const documentUri = params.textDocument.uri;
    let document = this.documentManager[documentUri];
    if (document && params.textDocument.version !== null) {
      let parseTree = this.treeSitterMap[documentUri];
      const version = params.textDocument.version;
      console.time('parseTree');
      if (parseTree) {
        params.contentChanges.forEach(change => {
          parseTree.edit(getTreeSitterEditFromChange(change, document));
          document = TextDocument.update(document, [change], version);
          parseTree = this.parser.parse(document.getText(), parseTree);
        });
      } else {
        document = TextDocument.update(
          document,
          params.contentChanges,
          params.textDocument.version
        );
        parseTree = this.parser.parse(document.getText());
      }
      this.treeSitterMap[documentUri] = parseTree;
      this.documentManager[documentUri] = document;
      // edit the parseTree end
      console.timeEnd('parseTree');
    }
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
    const folders = await this.workspace.getWorkspaceFolders();
    let workdir = '';
    if (folders) {
      workdir = transformUriToNormalizedPath((await this.getWorkspaceFolder(folders[0].uri))?.uri ?? '');
    }
    if (!workdir) {
      return;
    }
    // if (this.platform === 'win32') {
    //   workdir = workdir.slice(1);
    // }
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
    // this._completion.setComponentMetaDataMap(this._sfcMetaDataMap);
  }

  private initCompletion(): void {
    this._completion = new TemplateCompletion(this);
    // this._context.subscriptions.push(
    //   languages.registerCompletionItemProvider(
    //     [{ language: 'vue', scheme: 'file' }],
    //     this._completion,
    //     ':',
    //     '@',
    //     '#'
    //   )
    // );
  }

  private initDefinition(): void {
    // this._tagDefinition = new TemplateTagDefinition(this);
    // this._context.subscriptions.push(
    //   languages.registerDefinitionProvider(
    //     [{ language: 'vue', scheme: 'file' }],
    //     this._tagDefinition
    //   )
    // );
  }

  private async getWorkspaceFolder(
    uri: DocumentUri
  ): Promise<WorkspaceFolder | undefined> {
    const uriString = uri.toString();
    const workSpaceList = await this.workspace.getWorkspaceFolders();
    if (workSpaceList) {
      return workSpaceList.find(ws => ws.uri.toString() === uriString);
    }
  }
  // 重新收集依赖的 引入的组件 元信息， 比如 props,event 等等
  private async recollectDependencies(document: TextDocument): Promise<void> {
    this._sfcMetaDataMap = {};
    const importReg = /import\s+([\w]+)\s+from\s*(?:('(?:.*)'|"(?:.*)"))/g;
    // importMap , the key is component name, value is absolutePath
    const importMap: Record<string, string> = {};

    let execResult: Nullable<RegExpExecArray> = null;

    if (document.languageId !== 'vue') {
      return;
    }
    const content = document.getText();
    // get this file's dirname e.g: /test/test.vue -> `/test`
    const dirName = path.dirname(document.uri.toString());
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
