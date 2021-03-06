import * as fs from 'fs';
import { ParserResult, parser } from '@vuese/parser';
import * as path from 'path';
export function isRelativePath(path: string): boolean {
  return path.startsWith('./') || path.startsWith('../');
}

/**
 *
 * @param path 判断绝对路径是否存在
 * @returns Promise<boolean>
 */
export function asyncFileExist(path: string): Promise<boolean> {
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
export function asyncReadFile(path: string): Promise<string> {
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
export function pathAliasMappingGenerator(
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
export function generateSFCMetaData(
  absolutePath: string
): Promise<ParserResult> {
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
 *
 * @export
 * @param {Record<string, string>} aliasMap 路径别名映射到相对目录的map
 * @param {string} pathAlias 带有路径别名的路径
 * @returns {string} 最终的相对路径
 */
export function aliasToRelativePath(
  aliasMap: Record<string, string>,
  pathAlias: string
): string {
  const [alias, ...restPath] = pathAlias.split('/');
  if (!aliasMap[alias]) {
    return '';
  }
  return path.resolve(aliasMap[alias], ...restPath);
}
