# 统一 Lark 元数据前缀

## 基本信息

- 日期：2026-05-23
- 严重程度：中
- 状态：Fixed locally
- 影响范围：`.lark.md` front matter、Lark Documents Base、标题同步与打开索引
- 关联 Commit：待补充

## 问题描述

插件已经更名为 Lark Doc，但新建的 `.lark.md` 文件和自动生成的 Base 仍使用 `feishu_doc_id`、`feishu_url`、`feishu_title` 字段。用户在 Obsidian Base 中看到 `feishu_title` 和 `feishu_url` 列，与当前插件命名不一致。

## 复现路径

1. 在插件中创建或关联一个 Lark 文档。
2. 打开默认笔记目录下生成的 `Lark Documents.base`。
3. 观察 Base 表格列名和 `.lark.md` 的 front matter。

## 代码位置

- `src/lark-note.ts`：生成 `.lark.md` front matter。
- `src/base-manager.ts`：生成 Base 文件内容。
- `src/feishu-frontmatter.ts`、`src/indexer.ts`、`src/title-sync.ts`、`src/main.ts`、`src/feishu-view.ts`：读取和使用关联字段。

## 根因分析

项目重命名后，运行时识别和生成逻辑仍沿用了早期 `feishu_*` 元数据字段名。Base 直接展示这些属性名，因此用户可见界面仍然出现 Feishu 前缀。

## 修复方案

将当前生成和识别的关联字段直接切换为：

- `lark_doc_id`
- `lark_url`
- `lark_title`

本项目尚未正式对外发布，本次不做旧 `feishu_*` 字段兼容。

## 测试策略

先更新单元测试断言到 `lark_*` 字段，确认旧实现无法通过；再修改实现并运行完整验证。

## 验证结果

- 已先将相关单元测试断言切换到 `lark_*` 字段，并确认旧实现失败。
- `npm test`：49 个测试全部通过。
- `npm run lint`：通过。
- `npm run test:coverage`：通过，核心单元覆盖率保持 100% statements、branches、functions、lines。
- `npm run build`：通过。
- `npm run release:validate`：通过。
- `git diff --check`：通过。

## 经验总结

项目命名迁移时，不能只更新 UI 文案和插件名；Base 属性名、front matter key、索引对象字段和同步逻辑必须一起迁移。否则 Obsidian Base 会直接暴露旧字段名，用户会看到不一致的产品状态。
