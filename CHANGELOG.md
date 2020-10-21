# Change Log
All notable changes to the "vue-template-completion" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]
- Initial release
- 0.9.0
  - use incremental parse instead of full parse, make intellisense much fast
  - cache every tree-sitter parse tree, don't reparse when you change your active text editor. 