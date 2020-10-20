/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');


fs.copyFileSync(path.resolve(__dirname, '../parser/tree-sitter.wasm'), path.resolve(__dirname, '../dist/tree-sitter.wasm'))