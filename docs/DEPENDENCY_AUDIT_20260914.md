# 长期开发分支的依赖审计修复

2026-09-14，质量工作流 `34804003594` 在 `npm audit --audit-level=moderate` 阶段拒绝旧锁文件，尚未进入源码检查。保留审计门禁，单独更新允许范围内的开发工具依赖锁定版本。

| 依赖                     | 原锁定  | 修复锁定 | 依据                                                                                           |
| ------------------------ | ------- | -------- | ---------------------------------------------------------------------------------------------- |
| Vitest 及内部工具        | 4.1.10  | 4.1.11   | [维护者安全通告](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9) |
| @xmldom/xmldom           | 0.8.13  | 0.8.15   | [安全通告](https://github.com/advisories/GHSA-965w-775f-mr7g)                                  |
| browserslist             | 4.28.6  | 4.28.9   | [安全通告](https://github.com/advisories/GHSA-c83g-rgw3-j3cx)                                  |
| baseline-browser-mapping | 2.10.43 | 2.11.23  | [安全通告](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv)                                  |

同时更新上述包解析需要的浏览器版本数据及测试工具传递依赖。没有新增依赖类别，package.json 约束保持不变；Electron、SQLite、生产业务依赖与原生模块版本未变。

新锁文件已通过独立 `npm ci`，安装后审计零漏洞；TypeScript、52 个 Vitest 文件 / 401 项测试、2 项评测读取边界测试和 9 项发布脚本测试全部通过。这是 S2 已合入、S1/S3/S4 尚未合入时的验证；最终集成验证见模板整理执行计划及对应验收报告。
