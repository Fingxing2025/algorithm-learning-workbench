import type { ProblemStatus, RelationType } from '@core/contracts/problem'

export const problemStatusLabels: Record<ProblemStatus, string> = {
  attempted: '尝试中',
  solved: '已解决',
  unattempted: '未开始',
}

export const relationTypeLabels: Record<RelationType, string> = {
  alternative: '备选',
  recommended: '推荐',
  used: '实际使用',
}
