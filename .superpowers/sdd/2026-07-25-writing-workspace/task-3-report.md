# Task 3：图片资源服务与安全协议报告

## 实现

- 新增 `WriterAssetService`：在写入前以 20MB 上限、文件名扩展名、声明 MIME 和 PNG/JPEG/WebP/GIF magic bytes 四重校验图片；使用 SHA-256 文件名与 `wx` 写入实现同文档去重。
- 新增垃圾回收：只删除 assets 顶层未引用的普通文件，保留目录、`.tmp` 文件与符号链接。
- 新增纯函数 `resolveLuminaResource`，可通过 `LuminaProtocolRoots` 注入根目录；writing 仅允许合法文档的单层白名单图片，拒绝 URL 编码穿越、双重编码、反斜杠及未知 MIME。
- 协议切换到 `protocol.handle` 与 `net.fetch(pathToFileURL(...))`，响应显式设置白名单 `Content-Type`、`nosniff` 和 `private, max-age=31536000, immutable`。论文 pages/assets 与 `source.pdf` 的既有映射保持可用。

## TDD 证据

- RED：先创建两个测试文件后运行指定命令，因 `WriterAssetService` 与 `luminaProtocolResolver` 模块不存在而失败（2 个 `ERR_MODULE_NOT_FOUND`）。
- GREEN：实现后同一命令通过 8/8。
- 回归 RED：审查发现 `PaperOriginalPdfView` 依赖 `lumina://paper/<id>/source.pdf`，新增测试先失败（解析器返回“论文资源路径无效”），补充 PDF 映射后通过 5/5。

## 验证

- `node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/main/services/writer/WriterAssetService.test.ts src/main/core/luminaProtocolResolver.test.ts`：GREEN 8/8。
- `yarn test:writer`：PASS 25/25。
- `yarn test:paper`：PASS 63/63。
- `yarn typecheck:node`：PASS。
- `git diff --check`：PASS。

## Fix round 2

- RED：新增“writing 协议拒绝文档目录符号链接跨文档读取 assets”后，运行 `node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/main/core/luminaProtocolResolver.test.ts`，失败为 `true !== false`；请求 ID 的目录链接到同根另一文档时被错误放行。
- GREEN：读取前对 `documents`、URL 对应的文档目录和 `assets` 根逐级执行非符号链接目录验证，并验证 canonical 层级；同一聚焦命令通过 8/8。
- 回归：`yarn test:writer` PASS 29/29；`yarn test:paper` PASS 63/63；`yarn typecheck:node` PASS；`git diff --check` PASS。

## 文件变更

- 新增：`WriterAssetService.ts`、其测试、`luminaProtocolResolver.ts`、其测试。
- 修改：`protocol.ts`、writer 服务出口、writer 共享类型、`package.json` 的 `test:writer`。

## 安全自检与关注点

- 覆盖：超限大小、SVG/可执行签名、扩展名和声明 MIME 不匹配、双重扩展名、哈希去重、URL 编码/双重编码遍历、GC 越界引用、GC 符号链接与子目录。
- 服务会拒绝资源目录符号链接；协议解析器为无 I/O 纯函数，依赖受控的写作资源目录结构。测试运行时保留 Node loader 的既有 ExperimentalWarning / MODULE_TYPELESS_PACKAGE_JSON 警告，未引入新的测试失败。

## Fix round 1

### 1. 协议真实路径与符号链接

- RED：`node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/main/services/writer/WriterAssetService.test.ts src/main/core/luminaProtocolResolver.test.ts` 中的“writing 协议拒绝通过符号链接逃逸 assets 根目录的文件”因 `resolveLuminaResourceFile is not a function` 失败。
- GREEN：新增异步读取前验证；对资源根目录与目标分别执行 `lstat`/`realpath`，拒绝符号链接、非普通文件和 canonical path 越界。协议处理器仅使用验证后的 canonical path。该命令通过 12/12。

### 2. 同哈希并发导入

- RED：同一聚焦命令中的“并发导入同一哈希的图片不会读取未完成文件”失败，8 个结果并非全部成功。
- GREEN：先写同目录随机临时普通文件并 `fsync`，再以原子 hard link 发布；若并发方已发布，校验完整哈希后复用，最后清理临时文件。该命令通过 12/12。

### 3. 论文协议兼容性

- RED：同一聚焦命令中的“paper 路由保留未知扩展名并降级为安全 MIME”返回“论文资源类型无效”。
- GREEN：paper 恢复任意规范化的论文根内路径映射，已知图片/PDF 使用白名单 MIME，未知类型降级 `application/octet-stream`；writing 仍只允许四种图像。该命令通过 12/12。

### Fix round 验证

- `yarn test:writer`：PASS 28/28。
- `yarn test:paper`：PASS 63/63。
- `yarn typecheck:node`：PASS。
- `git diff --check`：PASS。
