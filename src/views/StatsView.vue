<!--
  @file 前端视图 - Stats View

  承载 Stats View 的界面结构、响应式状态和用户交互，是 前端视图 模块的可视入口之一。
  注释重点标明模板结构、脚本状态、事件派发和样式隔离边界。
-->

<script setup lang="ts">
// 脚本区：组织 Stats View 的响应式状态、计算属性、事件处理和外部模块协作。
import { computed, onMounted, ref, watch } from 'vue';
import { NButton, NCard, NPopconfirm, NSelect, useMessage } from 'naive-ui';
import { useDark } from '@vueuse/core';
import VChart from 'vue-echarts';

import { useTodosStore } from '@/stores/todos';
import type { TodoActivityPoint, TodoDailyTrendRequest, TodoTrendPoint } from '@/types/steno';

// 类型 TrendRange：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
type TrendRange = 30 | 60 | 90;
// 类型 ActivityRange：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
type ActivityRange = 30 | 60 | 90 | 365;
// 类型 StatusFilter：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
type StatusFilter = NonNullable<TodoDailyTrendRequest['statusFilter']>;

// 局部常量 todos：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const todos = useTodosStore();
// 局部常量 message：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const message = useMessage();
// 局部常量 isDark：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const isDark = useDark();

// 局部常量 activity：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const activity = ref<TodoActivityPoint[]>([]);
// 局部常量 trend：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const trend = ref<TodoTrendPoint[]>([]);
// 局部常量 activityRange：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const activityRange = ref<ActivityRange>(30);
// 局部常量 trendRange：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const trendRange = ref<TrendRange>(30);
// 局部常量 statusFilter：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const statusFilter = ref<StatusFilter>('all');
// 局部常量 loadingActivity：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const loadingActivity = ref(false);
// 局部常量 loadingTrend：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const loadingTrend = ref(false);
// 局部常量 resetting：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const resetting = ref(false);

// 局部常量 rangeOptions：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const rangeOptions = [
  { label: '最近 30 天', value: 30 },
  { label: '最近 60 天', value: 60 },
  { label: '最近 90 天', value: 90 }
] satisfies Array<{ label: string; value: TrendRange }>;

// 局部常量 activityRangeOptions：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const activityRangeOptions = [...rangeOptions, { label: '最近 1 年', value: 365 }] satisfies Array<{
  label: string;
  value: ActivityRange;
}>;

const statusOptions: Array<{ label: string; value: StatusFilter }> = [
  { label: '全部', value: 'all' },
  { label: '未开始', value: 'todo' },
  { label: '进行中', value: 'doing' },
  { label: '暂停', value: 'paused' },
  { label: '已完成', value: 'done' }
];

// 局部常量 palette：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const palette = computed(() =>
  isDark.value
    ? {
        text: '#e8e8ea',
        muted: '#9a9aa3',
        axis: '#3b3b43',
        empty: '#26262d',
        heat: ['#26262d', '#1f6f4a', '#268b5e', '#42b883', '#8fd19e'],
        created: '#77b7ff',
        started: '#f5b451',
        completed: '#55c67a'
      }
    : {
        text: '#25252b',
        muted: '#70707a',
        axis: '#e4e4e8',
        empty: '#f0f1f4',
        heat: ['#f0f1f4', '#d8f0df', '#9bd9aa', '#54ba75', '#23824b'],
        created: '#2563eb',
        started: '#d97706',
        completed: '#16a34a'
      }
);

// 局部常量 today：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const today = computed(() => new Date());
// 局部常量 activityStart：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const activityStart = computed(() => {
  // 局部常量 start：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const start = new Date(today.value);
  start.setDate(start.getDate() - activityRange.value + 1);
  return formatDate(start);
});
// 局部常量 activityEnd：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const activityEnd = computed(() => formatDate(today.value));
// 局部常量 trendStart：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const trendStart = computed(() => {
  // 局部常量 start：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const start = new Date(today.value);
  start.setDate(start.getDate() - trendRange.value + 1);
  return formatDate(start);
});
// 局部常量 trendEnd：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const trendEnd = computed(() => formatDate(today.value));

// 局部常量 activityOption：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const activityOption = computed(() => {
  // 局部常量 counts：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const counts = new Map(activity.value.map(point => [point.date, point.count]));
  // 局部常量 data：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const data = eachDay(activityStart.value, activityEnd.value).map(date => [date, counts.get(date) ?? 0]);
  // 局部常量 colors：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const colors = palette.value;

  return {
    textStyle: { color: colors.text },
    tooltip: {
      formatter: (params: { value: [string, number] }) => {
        const [date, count] = params.value;
        return count > 0 ? `${date}: 完成 ${count} 个任务` : `${date}: 无完成任务`;
      }
    },
    visualMap: {
      type: 'piecewise',
      show: false,
      min: 0,
      max: 10,
      pieces: [
        { min: 10, color: colors.heat[4] },
        { min: 6, max: 9, color: colors.heat[3] },
        { min: 3, max: 5, color: colors.heat[2] },
        { min: 1, max: 2, color: colors.heat[1] },
        { value: 0, color: colors.empty }
      ]
    },
    calendar: {
      top: 34,
      left: 46,
      right: 20,
      bottom: 18,
      range: [activityStart.value, activityEnd.value],
      cellSize: ['auto', 14],
      splitLine: { show: false },
      itemStyle: {
        borderWidth: 2,
        borderColor: isDark.value ? '#1f1f24' : '#ffffff'
      },
      yearLabel: { show: false },
      monthLabel: { color: colors.muted, fontSize: 11 },
      dayLabel: {
        firstDay: 1,
        color: colors.muted,
        fontSize: 11,
        nameMap: ['日', '一', '二', '三', '四', '五', '六']
      }
    },
    series: [
      {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data
      }
    ]
  };
});

// 局部常量 trendOption：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const trendOption = computed(() => {
  // 局部常量 colors：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const colors = palette.value;
  // 局部常量 dates：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const dates = trend.value.map(point => point.date);
  return {
    color: [colors.created, colors.started, colors.completed],
    textStyle: { color: colors.text },
    tooltip: { trigger: 'axis' },
    legend: {
      top: 0,
      textStyle: { color: colors.muted },
      data: ['创建', '开始', '完成']
    },
    grid: { top: 42, left: 42, right: 18, bottom: 34 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dates,
      axisLine: { lineStyle: { color: colors.axis } },
      axisLabel: { color: colors.muted }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: colors.axis } },
      axisLabel: { color: colors.muted }
    },
    series: [
      {
        name: '创建',
        type: 'line',
        smooth: true,
        data: trend.value.map(point => point.created)
      },
      {
        name: '开始',
        type: 'line',
        smooth: true,
        data: trend.value.map(point => point.started)
      },
      {
        name: '完成',
        type: 'line',
        smooth: true,
        data: trend.value.map(point => point.completed)
      }
    ]
  };
});

onMounted(() => {
  void loadAll();
});

watch([trendRange, statusFilter], () => {
  void loadTrend();
});

watch(activityRange, () => {
  void loadActivity();
});

// 函数 loadAll：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function loadAll() {
  await Promise.all([loadActivity(), loadTrend()]);
}

// 函数 loadActivity：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function loadActivity() {
  loadingActivity.value = true;
  try {
    activity.value = await todos.getActivity({
      start: activityStart.value,
      end: activityEnd.value
    });
  } catch (error) {
    message.error(`加载任务活跃度失败：${String(error)}`);
  } finally {
    loadingActivity.value = false;
  }
}

// 函数 loadTrend：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function loadTrend() {
  loadingTrend.value = true;
  try {
    trend.value = await todos.getDailyTrend({
      start: trendStart.value,
      end: trendEnd.value,
      statusFilter: statusFilter.value
    });
  } catch (error) {
    message.error(`加载每日趋势失败：${String(error)}`);
  } finally {
    loadingTrend.value = false;
  }
}

// 函数 onConfirmReset：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function onConfirmReset() {
  resetting.value = true;
  try {
    // 局部常量 count：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const count = await todos.resetStats();
    message.success(`已永久删除 ${count} 条历史任务`);
    await loadAll();
  } catch (error) {
    message.error(`重置数据失败：${String(error)}`);
  } finally {
    resetting.value = false;
  }
}

// 函数 formatDate：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function formatDate(date: Date): string {
  // 局部常量 y：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const y = date.getFullYear();
  // 局部常量 m：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const m = String(date.getMonth() + 1).padStart(2, '0');
  // 局部常量 d：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 函数 eachDay：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function eachDay(start: string, end: string): string[] {
  const dates: string[] = [];
  // 局部常量 current：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const current = parseDate(start);
  // 局部常量 endTime：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const endTime = parseDate(end).getTime();
  while (current.getTime() <= endTime) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// 函数 parseDate：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}
</script>

<template>
  <!-- 模板区：描述 Stats View 的 DOM 层级、可交互区域和条件渲染边界。 -->
  <div class="stats-view">
    <header class="stats-header">
      <div>
        <h1>任务活跃度</h1>
      </div>
    </header>

    <section class="stats-grid">
      <NCard class="stats-card" title="完成热力图">
        <template #header-extra>
          <NSelect
            v-model:value="activityRange"
            class="trend-select"
            :options="activityRangeOptions"
            size="small"
            data-testid="activity-range-select"
          />
        </template>
        <div class="chart-wrap" :aria-busy="loadingActivity">
          <VChart class="stats-chart" :option="activityOption" autoresize />
        </div>
      </NCard>

      <NCard class="stats-card" title="每日状态趋势">
        <template #header-extra>
          <div class="trend-controls">
            <NSelect
              v-model:value="trendRange"
              class="trend-select"
              :options="rangeOptions"
              size="small"
              data-testid="trend-range-select"
            />
            <NSelect
              v-model:value="statusFilter"
              class="trend-select"
              :options="statusOptions"
              size="small"
              data-testid="trend-status-select"
            />
          </div>
        </template>
        <div class="chart-wrap" :aria-busy="loadingTrend">
          <VChart class="stats-chart" :option="trendOption" autoresize />
        </div>
      </NCard>
    </section>

    <footer class="stats-footer">
      <NPopconfirm positive-text="确认重置" negative-text="取消" @positive-click="onConfirmReset">
        <template #trigger>
          <NButton type="error" secondary :loading="resetting">重置数据</NButton>
        </template>
        <template #default>
          <div class="reset-confirm">
            <strong>确认重置数据</strong>
            <p>将永久删除所有已完成和已删除的任务，不可恢复。</p>
          </div>
        </template>
      </NPopconfirm>
    </footer>
  </div>
</template>

<style scoped>
/* 样式区：限定 Stats View 的布局、主题色和响应式细节。 */
.stats-view {
  min-height: 100%;
  padding: 24px;
  background: var(--app-bg);
  color: var(--app-fg);
}

.stats-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.stats-header h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: 0;
}

.stats-header p {
  margin: 6px 0 0;
  color: var(--app-muted);
  font-size: 13px;
}

.stats-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

.stats-card {
  border-radius: 8px;
}

.chart-wrap {
  height: 260px;
  min-width: 0;
}

.stats-chart {
  width: 100%;
  height: 100%;
}

.trend-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.trend-select {
  width: 128px;
}

.stats-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
}

.reset-confirm {
  max-width: 260px;
}

.reset-confirm strong {
  display: block;
  margin-bottom: 4px;
  color: var(--app-fg);
}

.reset-confirm p {
  margin: 0;
  color: var(--app-muted);
  line-height: 1.5;
}

@media (max-width: 720px) {
  .stats-view {
    padding: 16px;
  }

  .stats-header {
    margin-bottom: 14px;
  }

  .trend-controls {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .trend-select {
    width: 116px;
  }

  .chart-wrap {
    height: 240px;
  }
}
</style>
