<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
}>();
</script>

<template>
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
