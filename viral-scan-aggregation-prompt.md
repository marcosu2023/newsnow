# 选题扫描新功能：多源聚合 + 独家标记

## 需求

在选题扫描结果中增加两个标记：
1. 🔥 多源热点：同一事件被2个以上源报道时标记（2源=🔥，3源+=🔥🔥）
2. 💎 独家：只出现在某一个五大源中的新闻，做视觉突出

**关键规则：都只做标记显示，不影响评分。**

## 修改文件1：server/api/viral-scan.ts

在调用 scoreAndRank 之前（或之后），增加一个聚合步骤：

### 聚合逻辑

```typescript
// 1. 对所有抓到的新闻，用标题前20个字做聚合key
function getGroupKey(title: string): string {
  return title.replace(/\s+/g, "").slice(0, 20)
}

// 2. 按 groupKey 分组
const groups = new Map<string, { sources: Set<string>, items: ScoredItem[] }>()

for (const item of scoredItems) {
  const key = getGroupKey(item.title)
  if (!groups.has(key)) {
    groups.set(key, { sources: new Set(), items: [] })
  }
  const g = groups.get(key)!
  g.sources.add(item.sourceId.split("-")[0]) // caixin-latest → caixin
  g.items.push(item)
}

// 3. 给每个 item 打标记
const PRIORITY_SOURCES = new Set(["caixin", "reuters", "bloomberg", "wsj", "ft"])

for (const [key, g] of groups) {
  const sourceCount = g.sources.size
  const isHot = sourceCount >= 2
  const hotLevel = sourceCount >= 3 ? 2 : (sourceCount >= 2 ? 1 : 0)

  for (const item of g.items) {
    item.hotLevel = hotLevel // 0=普通, 1=🔥, 2=🔥🔥
    item.sourceCount = sourceCount // 报道源数量
    item.isExclusive = false // 默认非独家
  }

  // 独家判定：只有1个源报道，且该源是五大源之一
  if (sourceCount === 1) {
    const onlySource = [...g.sources][0]
    if (PRIORITY_SOURCES.has(onlySource)) {
      for (const item of g.items) {
        item.isExclusive = true
      }
    }
  }
}

// 4. 去重：同一个 groupKey 只保留得分最高的那条
const deduped: ScoredItem[] = []
for (const [key, g] of groups) {
  const best = g.items.sort((a, b) => b.finalScore - a.finalScore)[0]
  deduped.push(best)
}

// 5. 用 deduped 替代原来的 scoredItems 做排序输出
```

### 输出字段扩展

在返回的 JSON 中，每个 item 增加三个字段：
- `hotLevel`: number (0/1/2)
- `sourceCount`: number
- `isExclusive`: boolean

**注意：这些字段不参与 scoreAndRank 的评分计算，是在评分之后附加的。**

---

## 修改文件2：server/api/viral-picks.ts

在卡片的 HTML 模板中，增加 badge 显示：

### 在标题行右侧或来源信息旁边添加：

```typescript
// 热点 badge
const hotBadge = item.hotLevel >= 2
  ? "<span style=\"background:#FEF3C7;color:#92400E;padding:2px 6px;border-radius:10px;font-size:11px;margin-left:6px\">🔥🔥 多源热点</span>"
  : item.hotLevel === 1
    ? "<span style=\"background:#FEF3C7;color:#92400E;padding:2px 6px;border-radius:10px;font-size:11px;margin-left:6px\">🔥 多源热点</span>"
    : ""

// 独家 badge
const exclusiveBadge = item.isExclusive
  ? "<span style=\"background:#EDE9FE;color:#5B21B6;padding:2px 6px;border-radius:10px;font-size:11px;margin-left:6px\">💎 独家</span>"
  : ""

// 来源数量提示（在来源名称后面）
const sourceCountHint = item.sourceCount > 1
  ? ` <span style="color:#6b7280;font-size:11px">(${item.sourceCount}源报道)</span>`
  : ""
```

### badge 的位置

放在每张卡片的来源名称旁边，格式大致是：
```
[S级 32%]  某某新闻标题...
财新 (3源报道) 🔥🔥 多源热点    ← 多源情况
路透 💎 独家                    ← 独家情况
```

---

## ScoredItem 接口扩展

在 viral-scorer.ts 的 ScoredItem 接口中增加（或者在 viral-scan.ts 中用扩展类型）：

```typescript
// 可以在 viral-scan.ts 中定义扩展接口
interface EnrichedItem extends ScoredItem {
  hotLevel: number // 0=普通, 1=🔥(2源), 2=🔥🔥(3源+)
  sourceCount: number // 报道该事件的源数量
  isExclusive: boolean // 是否为五大源独家
}
```

---

## 不要改动的文件

- `server/lib/viral-scorer.ts` — 评分引擎完全不动
- 评分公式和权重不受影响
- scoreAndRank 的输入输出接口不变

---

## 测试要点

部署后访问 /api/viral-picks 确认：
1. 同一事件被多源报道时，只显示一张卡片（得分最高的），带🔥标记和"X源报道"
2. 五大源独家新闻带💎标记
3. 卡片的评分数值没有因为聚合/独家而变化
4. 总新闻数会比之前少（因为去重了），这是正常的
