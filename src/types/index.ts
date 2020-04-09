import { ParserResult } from "@vuese/parser";

export type Nullable<T> = T | null;

export type SFCMetaData = {
  parseResult: ParserResult;
  absolutePath: string;
  componentName: string;
}
