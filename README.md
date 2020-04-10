# vue-template-augmentation
## 一个支持对SFC组件 标签提示 prop, slot, event，标签跳转的vscode 插件
- 提供对于组件标签的 props 和 event 提示补全, 点击 组件tag 跳转到定义
  ![props,event,tag-defination](https://vuethisstore.flatpeach.xyz/vue-template-completion-props.gif)
- 支持对于组件的标签的slot 类型补全
  ![slot](https://vuethisstore.flatpeach.xyz/vue-template-completion-slot.gif)
- 支持vue3中 新的 `v-slot`语法 以及相应的 `directive` **#**
  ![v-slot](https://vuethisstore.flatpeach.xyz/vue-template-completion-v-slot.gif)
## 提示
- 为什么我的组件通过路径别名引入无法得到补全？  
  本插件不能识别使用 webpack config alias 引入的 组件，你需要使用的`jsconfig.json`配置路径，这样 `vetur` 和 本插件都可以提供正常的提示。
  ```
  // Webpack
  module.exports = {
    resolve: {
      alias: {
        '@': 'src'
      }
    }
  }
  ```
  ```
  // tsconfig.json 或者 jsonconfig.json
  {
    "compilerOptions": {
      "baseUrl": ".",
      "paths": {
        "@/*": [
          "src/*"
        ]
      }
    }
  }
  ```
- 为什么我的补全跳转非常慢？  
  作者在测试中发现如果开着 `vetur` 同时打开大的工程时补全和跳转等功能是会受到影响，你可以尝试关闭 `vetur` 再测试，如果还是非常卡顿可以提issue