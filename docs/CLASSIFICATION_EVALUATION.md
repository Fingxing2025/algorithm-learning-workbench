# 模板分类评测契约

本工具用于离线、可重复地评估 C++ 模板主分类与送审行为。它不会自动读取应用中的 Provider 配置，不读取用户真实模板，也不发起网络请求。

## 当前评测集

- 135 份可单独交给 C++17 编译器的源文件。
- 27 个不同的基础实现；每个基础实现生成 5 份变体，因此不能宣称覆盖了 135 种独立算法。
- 16 个 base / 80 份样本属于 development，11 个 base / 55 份样本属于 holdout。同一 `baseImplementationId` 不跨 split。
- 覆盖基础算法、数据结构、图论、字符串、动态规划、数学、C++ 工具、竞赛输入输出与日期计算，另有 2 个复合 base 和 2 个当前 taxonomy 外的未知 base。
- 变体包括中性改名、误导文件名、误导注释、长文件中段关键实现和跨批次原样重复。同一 base 的 canonical 与干扰变体分在不同 `batchId`，避免模型在同批输入中直接用原名反推干扰样本。

`manifest.json` 的 `labelStatus` 固定为 `provisional-ai-drafted-unreviewed`。当前标签是 AI 草拟的回归预期，尚未由人类算法专家签字，不是人工金标准。holdout 是按 base 分组的流程隔离，不是密码学隔离；调参时不应读取 holdout 标签。

## 文件与生成

- `tests/fixtures/classification-evaluation/manifest.json`：数据集、稳定 category ID、split、base 和配对关系。
- `tests/fixtures/classification-evaluation/sources/*.cpp`：实际发送给分类服务的自包含源码。
- `tests/fixtures/classification-evaluation/mock-perfect.predictions.json`：只用于验证评分管线的 mock；它从预期标签生成，绝不是真实预测。
- `scripts/classification-evaluation/generate-fixtures.mjs`：确定性重建上述数据集。

评测目录不是另一份 taxonomy：专项回归会把 manifest 的全部 `categoryId` 与
`src/core/domain/template-taxonomy.ts` 导出的 canonical taxonomy v2 做精确集合比对，并同时
校验 `taxonomyVersion`。taxonomy 演进时必须先更新评测生成器和标签，再接受该回归；不得保留
已从业务 taxonomy 移除的中间类别。

重建会覆盖这个仓库内的 fixture 目录：

```bash
npm run evaluation:classification:generate
```

## 数据集与源码验证

```bash
npm run evaluation:classification:validate
```

该命令会：

1. 严格解析 manifest，拒绝重复 sample/category/source path、未知标签和计数不一致。
2. 校验每份源码的 SHA-256。
3. 阻止同一 base 跨 development/holdout。
4. 对两个 split 的 canonical 源码计算去注释、标识符归一化后的 7-token shingle Jaccard；相似度大于等于 0.90 时拒绝，防止明显近重复泄漏。该检查不是通用克隆检测器。
5. 对全部 `.cpp` 运行现有 `clang++` 或 `g++ -std=c++17 -fsyntax-only`。

当前 135 份都是完整翻译单元，`fragmentCount` 为 0。语法通过不等于算法语义或 provisional 标签已经人工证实。

## 真实分类服务接口

先导出不含 `gold`、`primaryCategoryId` 或 `componentCategoryIds` 的输入：

```bash
npm run evaluation:classification:prepare -- --output /absolute/path/service-inputs.json
```

输入中每项只有 `sampleId`、`batchId`、`fileName`、`content` 和 `sourceSha256`，整体绑定 `datasetId` 与 `taxonomyVersion`。这是与应用分类服务/ProviderAdapter 的中立数据边界。

接线层必须由用户显式选定 Provider 配置和模型，再调用现有 Adapter；本工具默认不联网。`createRealProviderPredictionExport` 将服务结果转换为评分文件，并严格绑定：

- `runId`
- `provider` 与 `model`
- `classificationServiceVersion` 与 `promptVersion`
- `taxonomyVersion`
- 每份样本的 `sampleId`、`batchId` 和 `sourceSha256`

评分器要求每个样本恰好一条预测，并拒绝缺失、重复、未知 sample ID、未知 category ID、批次不一致、源码哈希不一致或 taxonomy 版本不一致。

## 评分

```bash
npm run evaluation:classification:score -- \
  --predictions /absolute/path/real-provider.predictions.json \
  --output /absolute/path/report.json
```

所有比例同时输出 `successes`、`total` 和 `estimate`。`metrics` 与 `metricsBySplit` 把 5 份同 base 变体视为相关观测，只提供描述性比例，`wilson95` 为 `null`，避免用 135 个非独立样本得到过窄区间。`canonicalBaseMetrics` 和 `canonicalBaseMetricsBySplit` 仅使用每个 base 的 canonical 样本，输出 95% Wilson 区间。分母为 0 时比例与区间都是 `null`。

| 指标                                      | 口径                                                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 总体主分类正确率                          | 仅对 single 样本计算；正确 categoryId 计成功，送审也计未命中。                                                                          |
| 分族主分类正确率                          | 按 `family` 对 single 样本使用同一口径。                                                                                                |
| 低歧义建议 precision                      | 分类服务实际以 `decision=classify` 输出的全部硬建议中，主分类命中的比例。未知/复合被硬分类会进入分母并计错，这是 98% 待校准目标的口径。 |
| 低歧义建议 coverage                       | 全部样本中 `decision=classify` 的比例。                                                                                                 |
| provisional 低歧义子集 precision/coverage | 另以 `gold.ambiguity=low` 的 single 样本计算，只作诊断，不替代上述全部硬建议口径。                                                      |
| 未知/复合送审率                           | 对应 kind 中 `decision=review` 的比例。                                                                                                 |
| 错误硬分类率                              | 所有样本中，single 分错或未知/复合被硬分类的比例；保守送审不计错误硬分类。                                                              |
| 命名扰动稳定性                            | canonical 与改名/误导名/误导注释/长文件变体的 `decision + categoryId` 一致率。                                                          |
| 批次稳定性                                | canonical 与另一批中原样重复的 `decision + categoryId` 一致率。                                                                         |

稳定地分错仍然可以获得高稳定性，因此稳定性必须与正确率和错误硬分类率一起解读。`metricsBySplit` 与 `canonicalBaseMetricsBySplit` 分别报告 development/holdout，不用混合数值代替留出表现。`confidence` 不在评分器内重新阈值化；硬分类/送审决策必须来自被测分类服务。

## Mock 只验证管线

```bash
npm run evaluation:classification:score -- \
  --predictions tests/fixtures/classification-evaluation/mock-perfect.predictions.json
```

这个报告会得到理想化指标，但 `providerEvaluation.status` 必须是 `not-run`。它只证明契约、配对和统计管线可运行，不证明任何真实 AI 准确率。

当前未运行真实 Provider。95% 总体正确率和 98% 低歧义 precision 是待校准目标，不是已达到结论。
