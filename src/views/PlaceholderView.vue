<!--
  @file 前端视图 - Placeholder View

  承载 Placeholder View 的界面结构、响应式状态和用户交互，是 前端视图 模块的可视入口之一。
  注释重点标明模板结构、脚本状态、事件派发和样式隔离边界。
-->

<script setup lang="ts">
// 脚本区：组织 Placeholder View 的响应式状态、计算属性、事件处理和外部模块协作。
/**
 * @component PlaceholderView
 * @description 未实现功能的占位页面 — 展示"即将推出"提示。
 *              用于 clipboard / todo / screenshot / ocr / translate 等规划中模块。
 *
 * @props
 * - `title: string` — 功能名称
 * - `description: string` — 功能描述
 */

defineProps<{
  /** 功能名称（如"粘贴板"、"待办"）。 */
  title: string;
  /** 功能描述（如"功能规划中"）。 */
  description: string;
}>();
</script>

<template>
  <!-- 模板区：描述 Placeholder View 的 DOM 层级、可交互区域和条件渲染边界。 -->
  <section class="placeholder-root">
    <div class="placeholder-card">
      <p class="placeholder-eyebrow">即将推出</p>
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
      <span>该模块将在后续版本中设计实现。</span>
    </div>
  </section>
</template>

<style scoped>
/* 样式区：限定 Placeholder View 的布局、主题色和响应式细节。 */
.placeholder-root {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 40px 24px;
}

.placeholder-card {
  width: min(460px, 100%);
  padding: 28px;
  border: 1px dashed rgba(55, 46, 36, 0.18);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.62);
  text-align: center;
}

.placeholder-eyebrow {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9a4d20;
}

.placeholder-card h2 {
  margin: 0 0 10px;
  font-size: 22px;
  font-weight: 600;
  color: #2a2a2a;
}

.placeholder-card p {
  margin: 0 0 10px;
  font-size: 14px;
  color: #5f564d;
}

.placeholder-card span {
  font-size: 12px;
  color: #7a7067;
}
</style>
