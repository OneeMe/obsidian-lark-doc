# Lark CLI cannot find node from desktop PATH

## 基本信息

- 日期：2026-05-23
- 严重程度：High
- 状态：Fixed locally
- 影响范围：在 Obsidian Desktop 中创建新的 Lark 文档时，`lark-cli` 无法启动 Node.js
- 关联 Commit：待补充

## 问题描述

用户在创建新的 Lark 文档时看到错误：

```text
Failed to create Lark document: env: node:
No such file or directory
```

这表示插件已经找到了 `lark-cli` 可执行文件，但 `lark-cli` 的 shebang 通过 `/usr/bin/env node` 启动 Node.js 时，Obsidian Desktop 进程的 `PATH` 中没有 `node`。

## 复现路径

1. 在 Obsidian Desktop 中配置 `Lark CLI path` 为 fnm/nvm 管理的绝对 `lark-cli` 路径。
2. 执行 `Create Lark document`。
3. `lark-cli` 启动失败，并报 `env: node: No such file or directory`。

## 代码位置

- `src/lark-cli.ts`：通过 `child_process.spawn()` 调用 `lark-cli`。
- `tests/lark-cli.test.mjs`：覆盖 CLI spawn 参数。

## 根因分析

`src/lark-cli.ts` 使用 `child_process.spawn(cliPath, args, {shell: false})` 调用配置的 `lark-cli`。为了降低社区审核中的 shell / filesystem 风险，之前移除了登录 shell PATH 探测。

用户当前配置的 `lark-cli` 是 fnm multishell 下的绝对路径：

```text
/Users/onee/.local/state/fnm_multishells/.../bin/lark-cli
```

这个目录中同时存在 `node`。但 Obsidian Desktop 进程的 `PATH` 不一定包含该目录。`lark-cli` 的入口脚本通过 shebang 使用 `/usr/bin/env node`，因此即使插件能找到 `lark-cli` 本身，`env` 也可能在 Obsidian 的 PATH 中找不到 `node`，最终报：

```text
env: node: No such file or directory
```

## 修复方案

采用确定性、无 shell、无 filesystem 探测的修复：

1. 保持 `spawn(..., {shell: false})`。
2. 如果解析后的 `cliPath` 带目录，则把 `dirname(cliPath)` prepend 到本次子进程的 `PATH`。
3. 如果 `cliPath` 只是 `lark-cli` 这种命令名，则不改写环境变量，仍继承 Obsidian 进程环境。

这样 fnm/nvm 这类 `bin/lark-cli` 与 `bin/node` 同目录的安装方式可以正常启动，同时不恢复登录 shell 执行或文件系统扫描。

## 测试策略

新增 `tests/lark-cli.test.mjs` 回归测试：

1. 当 `getEffectiveLarkCliPath()` 返回绝对 `.../bin/lark-cli` 时，`spawn` options 中的 `env.PATH` 必须以该 `bin` 目录开头。
2. 当原始 `PATH` 为空时，`env.PATH` 应只包含 CLI 所在目录。
3. 当有效 CLI 路径只是 `lark-cli` 命令名时，不强行传入 `env`，保持原行为。

## 验证结果

- `node --test tests/lark-cli.test.mjs`：通过。
- `env -i PATH=/usr/bin:/bin .../bin/lark-cli --version`：复现 `env: node: No such file or directory`。
- `env -i PATH=.../bin:/usr/bin:/bin .../bin/lark-cli --version`：通过，输出 `lark-cli version 1.0.39`。
- `npm run lint`：通过。
- `npm test`：49 个测试全部通过。
- `npm run test:coverage`：通过，核心单元覆盖率保持 100% statements、branches、functions、lines。
- `npm run build`：通过。
- `npm run release:validate`：通过。

## 经验总结

桌面应用启动的环境变量通常不同于用户终端。Node 包装的 CLI 即使自身路径是绝对路径，也可能依赖 `/usr/bin/env node` 再次查找 `node`。处理这类问题时不需要恢复 shell 探测；把“用户明确配置的 CLI 所在目录”加入该子进程 PATH，能在权限和可靠性之间保持更窄的行为边界。
