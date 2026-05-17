# npm run lint fails on Obsidian plugin rules

## 基本信息

- 日期：2026-05-17
- 严重程度：Medium
- 状态：Fixed locally
- 影响范围：`npm run lint` 不能通过，阻塞提交前质量检查
- 关联 Commit：待补充

## 问题描述

用户要求修复 `npm run lint` 的问题。当前 ESLint 使用 `eslint-plugin-obsidianmd` 推荐规则，失败项覆盖 UI 文案、设置页标题、直接写 DOM inline style、Node global、类型安全、卸载生命周期等。

## 复现路径

1. 在项目根目录运行 `npm run lint`。
2. ESLint 输出多个 error，命令以非 0 状态退出。

## 代码位置

- `src/main.ts`
- `src/settings.ts`
- `src/doc-creator.ts`
- `src/feishu-view.ts`
- `src/lark-cli.ts`
- `src/lark-cli-resolver.ts`
- `styles.css`
- `eslint.config.mts`

## 根因分析

`eslint-plugin-obsidianmd` 推荐规则比普通 TypeScript 项目更严格，当前失败来自几类问题：

- UI 文案中包含项目特有品牌词和缩写（Feishu、Lark、CLI、URL、CSS），但 lint 配置没有声明这些词，导致 sentence-case 规则误判。
- 设置页手写 `h2` / `h3` 标题，不符合 Obsidian 设置页应使用 `Setting#setHeading()` 的规则。
- 弹窗输入框、WebView 容器和 frame 元素通过 `element.style.*` 写静态样式，不符合插件样式应集中放到 `styles.css` 的规则。
- `onunload()` 主动 `detachLeavesOfType()`，会重置用户移动过的 leaf 位置，不符合 Obsidian 生命周期建议。
- ESLint 只声明了 browser globals，未声明 desktop-only 插件中使用的 Node globals。
- `child_process` stream 的 `data` 参数被推断成 `any`，触发 unsafe call/member access。

## 修复方案

采用方案：

- 在 `eslint.config.mts` 中加入 Node globals，并为 sentence-case 规则声明项目品牌词和缩写。
- 将设置页标题改为 `new Setting(containerEl).setName(...).setHeading()`。
- 将 modal 输入框和 Feishu frame 静态样式迁移到 `styles.css`。
- 保留动态 zoom 尺寸计算，但移除静态 inline style。
- 删除 `onunload()` 中的 `detachLeavesOfType()`。
- 移除未使用 imports，修正 `loadData()` 类型断言和 child process stream `data` 处理。
- 保持用户可见文案中的 Feishu、Lark、CLI、URL、CSS 等正确大小写。

未采用方案：

- 没有通过禁用 Obsidian lint 规则绕过问题；只补充了该项目确实需要的品牌词和缩写配置。
- 没有大规模重构 modal 或 view 结构，只做 lint 指向的最小质量修复。

## 测试策略

- `npm run lint`：验证 Obsidian ESLint 规则全部通过。
- `npm run build`：验证 TypeScript 与生产 bundle 通过。
- `npm test`：验证 `.lark` front matter 回归测试仍通过。

## 验证结果

- `npm run lint`：通过。
- `npm run build`：通过。
- `npm test`：通过。

## 经验总结

- Obsidian 插件项目里，UI 品牌词和缩写最好显式配置到 sentence-case 规则，否则容易为了过 lint 把正常品牌名改坏。
- 静态布局样式应默认放到 `styles.css`；只有真正动态的值才留在代码里。
- 社区插件 lint 会检查用户工作区体验，例如卸载时不要主动 detach leaves。
