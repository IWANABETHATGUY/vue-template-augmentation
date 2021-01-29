import { Position, Range, TextDocument } from 'vscode-languageserver-textdocument';

type IWordAtPosition = {
  word: string;
  startColumn: number;
  endColumn: number;
};
const _defaultConfig = {
  maxLen: 1000,
  windowSize: 15,
  timeBudget: 150000000000,
};

function getFirstBiggerIndex(arr: number[], target: number): number {
  let i = 0;
  let j = arr.length - 1;
  while (i <= j) {
    const mid = i + ~~((j - i) / 2);
    if (arr[mid] <= target) {
      i = mid + 1;
    } else {
      j = mid - 1;
    }
  }
  return i;
}

export function getLineAtPosition(
  document: TextDocument,
  position: Position
): string {
  const lineOffsets = (document as any)._lineOffsets;
  if (!lineOffsets) {
    return '';
  }
  const offset = document.offsetAt(position);
  const index = getFirstBiggerIndex(lineOffsets, offset);
  const content = document.getText();
  if (index == lineOffsets.length) {
    return content.slice(lineOffsets[index - 1], content.length);
  } else {
    return content.slice(lineOffsets[index - 1], lineOffsets[index]);
  }
}
function _findRegexMatchEnclosingPosition(
  wordDefinition: RegExp,
  text: string,
  pos: number,
  stopPos: number
): RegExpMatchArray | null {
  let match: RegExpMatchArray | null;
  while ((match = wordDefinition.exec(text))) {
    const matchIndex = match.index || 0;
    if (matchIndex <= pos && wordDefinition.lastIndex >= pos) {
      return match;
    } else if (stopPos > 0 && matchIndex > stopPos) {
      return null;
    }
  }
  return null;
}


export function getWordAtText(
  column: number,
  wordDefinition: RegExp,
  text: string,
  textOffset: number,
  config = _defaultConfig
): IWordAtPosition | null {
  if (text.length > config.maxLen) {
    // don't throw strings that long at the regexp
    // but use a sub-string in which a word must occur
    let start = column - config.maxLen / 2;
    if (start < 0) {
      start = 0;
    } else {
      textOffset += start;
    }
    text = text.substring(start, column + config.maxLen / 2);
    return getWordAtText(column, wordDefinition, text, textOffset, config);
  }

  const t1 = Date.now();
  const pos = column - 1 - textOffset;

  let prevRegexIndex = -1;
  let match: RegExpMatchArray | null = null;

  for (let i = 1; ; i++) {
    // check time budget
    if (Date.now() - t1 >= config.timeBudget) {
      break;
    }

    // reset the index at which the regexp should start matching, also know where it
    // should stop so that subsequent search don't repeat previous searches
    const regexIndex = pos - config.windowSize * i;
    wordDefinition.lastIndex = Math.max(0, regexIndex);
    const thisMatch = _findRegexMatchEnclosingPosition(
      wordDefinition,
      text,
      pos,
      prevRegexIndex
    );

    if (!thisMatch && match) {
      // stop: we have something
      break;
    }

    match = thisMatch;

    // stop: searched at start
    if (regexIndex <= 0) {
      break;
    }
    prevRegexIndex = regexIndex;
  }

  if (match) {
    const result = {
      word: match[0],
      startColumn: textOffset + 1 + match.index!,
      endColumn: textOffset + 1 + match.index! + match[0].length,
    };
    wordDefinition.lastIndex = 0;
    return result;
  }

  return null;
}

export function ensureValidWordDefinition(wordDefinition: RegExp): RegExp {
  let result: RegExp = wordDefinition;

  if (wordDefinition && wordDefinition instanceof RegExp) {
    if (!wordDefinition.global) {
      let flags = 'g';
      if (wordDefinition.ignoreCase) {
        flags += 'i';
      }
      if (wordDefinition.multiline) {
        flags += 'm';
      }
      if ((wordDefinition as any).unicode) {
        flags += 'u';
      }
      result = new RegExp(wordDefinition.source, flags);
    } else {
      result = wordDefinition;
    }
  }

  result.lastIndex = 0;

  return result;
}

function newRange(
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number
): Range {
  return {
    start: {
      character: startColumn,
      line: startLine,
    },
    end: {
      character: endColumn,
      line: endLine,
    },
  };
}

export function getWordRangeAtPosition(
  document: TextDocument,
  position: Position,
  regexp: RegExp
): Range | undefined {
  const line = getLineAtPosition(document, position);
  // if (!line) {
  //   return undefined;
  // }
  const wordAtText = getWordAtText(
    position.character + 1,
    ensureValidWordDefinition(regexp),
    line,
    0
  );

  if (wordAtText) {
    return newRange(
      position.line,
      wordAtText.startColumn - 1,
      position.line,
      wordAtText.endColumn - 1
    );
  }
  return undefined;
}
