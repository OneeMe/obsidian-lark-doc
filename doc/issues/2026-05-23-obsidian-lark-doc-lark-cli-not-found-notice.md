# Lark CLI not found notice is not actionable enough

## 基本信息

- 日期：2026-05-23
- 严重程度：中
- 状态：已修复
- 影响范围：Add linked Lark document、Create Lark document、标题同步等依赖 `lark-cli` 的入口
- 关联 Commit：c680ee4

## 问题描述

当 Obsidian Desktop 进程无法在 `PATH` 中找到 `lark-cli` 时，用户看到的 Notice 是：

```text
Failed to add linked Lark document: Failed to spawn Lark CLI: spawn lark-cli ENOENT
```

这个报错暴露了底层 `spawn`/`ENOENT` 细节，但没有说明用户应该如何处理，也没有跟随插件当前语言显示。

## 复现路径

1. 插件设置中的 `Lark CLI path` 使用默认值 `lark-cli`。
2. 从 Finder / Dock 打开 Obsidian，使其不继承终端中的 fnm/nvm PATH。
3. 执行 `Add linked Lark document`。
4. 插件调用 `child_process.spawn("lark-cli", ...)` 失败并显示底层错误。

## 代码位置

- `src/lark-cli.ts`：封装 `child_process.spawn()` 并把 spawn error 包装成 `LarkCliError`。
- `tests/lark-cli.test.mjs`：覆盖 CLI 启动失败时的错误提示。

## 根因分析

当前 `runCommand()` 在 `proc.on("error")` 中直接使用原始错误消息：

```ts
Failed to spawn Lark CLI: ${err.message}
```

当错误是 `ENOENT` 时，真正含义是配置的 CLI 命令或路径不可执行。对于默认 `lark-cli` 命令名，常见原因是 Obsidian Desktop 没有继承终端 PATH，尤其是使用 fnm/nvm 安装 Node 工具时。

## 修复方案

将 `ENOENT` spawn error 映射成可本地化、用户可操作的提示：

1. 明确说明 `Lark CLI` 没找到。
2. 提醒 Obsidian 可能没有继承终端 PATH。
3. 引导用户在插件设置中填写绝对路径。
4. 保留当前配置值，方便定位。
5. 在 `LarkCliError` 上附加 `translationKey` 和 `translationVars`，由 UI 层按当前语言翻译 Notice。

非 `ENOENT` 错误仍保留底层错误信息。

## 测试策略

先新增失败测试，模拟 `spawn` 抛出 `code: "ENOENT"`，断言错误携带 `error.larkCliNotFound` 和 `cliPath` 变量；再覆盖 `zh-CN` / `en` 翻译文本，以及 Add linked 弹窗使用翻译后的中文 Notice。

## 验证结果

- `node --test tests/lark-cli.test.mjs tests/i18n.test.mjs tests/add-linked-modal.test.mjs tests/doc-creator.test.mjs tests/main-routing.test.mjs`：通过，14 个测试全部通过。
- `npm test`：通过，53 个测试全部通过。
- `npm run test:coverage`：通过，核心模块 100% statements / branches / functions / lines。
- `npm run lint`：通过。
- `npm run build`：通过。
- `npm run release:validate`：通过。
- `git diff --check`：通过。

## 经验总结

桌面应用中的 CLI 集成不能假设继承终端环境。涉及 `spawn` 的底层错误需要转换成用户可以直接操作的设置建议，同时保留当前配置值帮助定位。
