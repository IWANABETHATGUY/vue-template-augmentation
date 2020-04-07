import {
  ExtensionContext,
  languages,
  window,
  TextDocument,
  workspace,
} from 'vscode';
import { TemplateCompletion } from './completion/template';
import { parser, ParserResult } from '@vuese/parser';
import * as path from 'path';
import * as fs from 'fs';
import { Nullable } from './types';
import { isRelativePath } from './utils';

/**
 *
 * @param path 判断绝对路径是否存在
 * @returns Promise<boolean>
 */
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
/**
 *
 * @param path 文件读取的绝对路径
 * @returns Promise<string> 返回一个文件内容的 Promise
 */
function asyncReadFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.readFile(path, { encoding: 'utf8' }, (err, data) => {
      if (err) {
        reject(err);
      }
      resolve(data);
    });
  });
}

/**
 *
 * @param rawAlias 原始路径别名
 * @param rowRelativePath 原始目标相对路径
 */
function pathAliasMappingGenerator(
  rawAlias: string,
  rawRelativePath: string[]
): { alias: string; path: string } {
  const alias = rawAlias.split('/').slice(0, -1).join('/');
  const path = rawRelativePath[0].split('/').slice(0, -1).join('/');
  return {
    alias,
    path,
  };
}

/**
 *
 * @param absolutePath 需要生成 元信息的组件的绝对路径
 */
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

/**
 *
 * @param aliasMap 路径别名映射到相对目录的map
 * @param pathAlias 带有路径别名的路径
 */
function aliasToRelativePath(
  aliasMap: Record<string, string>,
  pathAlias: string
): string {
  const [alias, ...restPath] = pathAlias.split('/');
  if (!aliasMap[alias]) {
    return '';
  }
  return path.resolve(aliasMap[alias], ...restPath);
}

export class VueTemplateCompletion {
  private _context: ExtensionContext;
  private _completion!: TemplateCompletion;
  private _sfcMetaDataMap!: Record<string, ParserResult>;
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
      }
    }
    Object.keys(importMap).forEach(async (componentName) => {
      try {
        const ParserResult = await generateSFCMetaData(
          importMap[componentName]
        );
        if (ParserResult) {
          this._sfcMetaDataMap[componentName.toUpperCase()] = ParserResult;
        }
      } catch (err) {
        console.error(err);
      }
    });
  }
}
