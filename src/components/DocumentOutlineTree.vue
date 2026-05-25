<script setup lang="ts">
/**
 * @component DocumentOutlineTree
 * @description 递归渲染 Markdown 大纲树 — 每个节点显示 `H{level}` 级别标签 + 标题文本。
 *              点击任意节点触发 `select` 事件，父组件滚动到对应标题位置。
 *
 * **递归策略**：组件自引用（`<DocumentOutlineTree :nodes="node.children" />`），
 * 通过 `depth` prop 控制缩进深度（由 CSS `padding-left` 实现）。
 *
 * @props
 * - `nodes: OutlineNode[]` — 大纲树节点数组
 * - `depth?: number` — 当前递归深度（内部使用，外部无需传）
 *
 * @emits
 * - `select(node: OutlineNode)` — 用户点击某个大纲条目
 */

import type { OutlineNode } from '@/composables/useMarkdownOutline';

defineOptions({
  name: 'DocumentOutlineTree',
});

defineProps<{
  /** 大纲树节点数组（`buildOutline` 的返回值）。 */
  nodes: OutlineNode[];
  /** 当前递归深度（仅内部自引用时传递，外部无需关心）。 */
  depth?: number;
}>();

const emit = defineEmits<{
  /** 用户点击大纲条目时触发，携带完整节点信息。 */
  select: [node: OutlineNode];
}>();

/** 将点击事件向上冒泡 — 父组件用 `node.line` 滚动编辑器到对应行。 */
function onSelect(node: OutlineNode) {
  emit('select', node);
}
</script>

<template>
  <div class="outline-tree">
    <p
      v-if="nodes.length === 0"
      class="outline-tree__empty"
      data-testid="outline-empty"
    >
      暂无大纲
    </p>
    <ul v-else class="outline-tree__list">
      <li v-for="node in nodes" :key="node.id" class="outline-tree__item">
        <button
          class="outline-tree__button"
          type="button"
          :data-testid="`outline-node-${node.id}`"
          @click="onSelect(node)"
        >
          <span
            class="outline-tree__badge"
            :data-testid="`outline-node-level-${node.id}`"
            :aria-label="`H${node.level}`"
          >H{{ node.level }}</span>
          <span class="outline-tree__text">{{ node.text }}</span>
        </button>
        <DocumentOutlineTree
          v-if="node.children.length > 0"
          :nodes="node.children"
          :depth="(depth ?? 0) + 1"
          @select="onSelect"
        />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.outline-tree {
  min-width: 0;
}

.outline-tree__empty {
  margin: 0;
  color: #8a8178;
  font-size: 12px;
  line-height: 1.5;
}

.outline-tree__list {
  list-style: none;
  margin: 0;
  padding: 0 0 0 12px;
}

.outline-tree__item + .outline-tree__item {
  margin-top: 6px;
}

.outline-tree__button {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: #4e463f;
  font: inherit;
  font-size: 13px;
  line-height: 1.45;
  text-align: left;
  cursor: pointer;
}

.outline-tree__button:hover {
  color: #2a2a2a;
}

.outline-tree__badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 16px;
  padding: 0 4px;
  border-radius: 4px;
  background: rgba(132, 82, 47, 0.1);
  color: #9a8d80;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1;
}

.outline-tree__text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
