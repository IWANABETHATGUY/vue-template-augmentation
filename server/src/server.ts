/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  Location,
  CompletionItemTag,
  WorkspaceEdit,
} from 'vscode-languageserver';

import {
  TextDocument,
  TextDocumentContentChangeEvent,
  TextEdit,
} from 'vscode-languageserver-textdocument';
import Parser from 'web-tree-sitter';
import { getTreeSitterEditFromChange } from './utils';
import { connect } from 'tls';
import { VueTemplateAugmentation } from '.';
import { getWordRangeAtPosition } from './utils/completion';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// init treeParser
// const parser = new Parser();

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;
let vueTemplateAugmentation: any;
connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;
  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  capabilities.workspace?.workspaceFolders;
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Tell the client that this server supports code completion.
      completionProvider: {
        resolveProvider: true,
      },
      // definitionProvider: true,
      // renameProvider: true,
      referencesProvider: true,
    },
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }
  return result;
});

connection.onInitialized(() => {
  vueTemplateAugmentation = new VueTemplateAugmentation(connection.workspace);
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(_event => {
      connection.console.log('Workspace folder change event received.');
    });
  }
  connection.onDidOpenTextDocument(params => {
    vueTemplateAugmentation.onDidOpenTextDocument(params);
    // const { uri, version, languageId, text } = params.textDocument;
    // documentManager[uri] = TextDocument.create(uri, languageId, version, text);
    // console.time("open parse text");
    // parseTreeManager[uri] = parser.parse(text);
    // console.timeEnd("open parse text");
    // A text document was opened in VS Code.
    // params.uri uniquely identifies the document. For documents stored on disk, this is a file URI.
    // params.text the initial full content of the document.
  });
  connection.onNotification('template-augmentation/changeActiveTextEditor', (event) => {
    console.log(event)
  })
  // connection.onDidSaveTextDocument(params => {
  //   const { uri } = params.textDocument;
  //   const document = documentManager[uri];
  //   if (document && params.textDocument.version !== null) {
  //     const parseTree = parseTreeManager[uri];
  //     // edit the parseTree
  //     console.time("parseTree");
  //     // edit the parseTree end
  //     parseTreeManager[uri] = parser.parse(document.getText());
  //     console.timeEnd("parseTree");
  //   }
  // });
  // TODO: 现在只考虑 只有一个文件的情况因此只用考虑 保存一个 parseTree, 如果有多个文件的话， 需要考虑多个ParseTree,
  // 类似于documentManager
  connection.onDidChangeTextDocument(params => {
    vueTemplateAugmentation.onDidChangeTextDocument(params);
  });

  connection.onDidCloseTextDocument(params => {
    // delete parseTreeManager[params.textDocument.uri];
    // delete documentManager[params.textDocument.uri];
  });

  // This handler provides the initial list of the completion items.
  connection.onCompletion((p): CompletionItem[] => {
    const document =
      vueTemplateAugmentation.documentManager[p.textDocument.uri];
    // console.log(getLineAtPosition(document, p.position));
    // /[\w_@\-\:]+/
    const range = getWordRangeAtPosition(document, p.position, /[\w_@\-\:]+/);
    if (range) {
      console.log(document.getText(range));
    }
    // The pass parameter contains the position of the text document in
    // which code complete got requested. For the example we ignore this
    // info and always provide the same completion items.
    return [];
  });
});

// connection.onDefinition(
//   (params): UndefineAble<Location> => {
//     const parseTree = parseTreeManager[params.textDocument.uri];
//     const scopeMap = symbolTableManager[params.textDocument.uri];
//     const definition = getDefinitionSymbolFromVscodePosition(parseTree, scopeMap, params.position);
//     if (!definition) {
//       return;
//     }
//     return {
//       uri: params.textDocument.uri,
//       range: getRangeFromSyntaxNode(definition.syntaxNode),
//     };
//   }
// );
connection.onDidChangeConfiguration(params => {
  console.log(params.settings);
});

// The example settings
interface ExampleSettings {
  maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
const globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

// connection.onDidChangeConfiguration(change => {
//   if (hasConfigurationCapability) {
//     // Reset all cached document settings
//     documentSettings.clear();
//   } else {
//     globalSettings = <ExampleSettings>(change.settings.languageServerExample || defaultSettings);
//   }

//   // Revalidate all open text documents
//   documents.all().forEach(validateTextDocument);
// });

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: 'languageServerExample',
    });
    documentSettings.set(resource, result);
  }
  return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
  documentSettings.delete(e.document.uri);
});
// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.

connection.onDidChangeWatchedFiles(_change => {
  // Monitored files have change in VSCode
  connection.console.log('We received an file change event');
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
