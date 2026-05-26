<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { NButton, NCard, NPopconfirm, NSelect, useMessage } from 'naive-ui';
import { useDark } from '@vueuse/core';
import VChart from 'vue-echarts';

import { useTodosStore } from '@/stores/todos';
import type {
  TodoActivityPoint,
  TodoDailyTrendRequest,
  TodoTrendPoint,
} from '@/types/steno';

type TrendRange = 30 | 60 | 90;
type ActivityRange = 30 | 60 | 90 | 365;
type StatusFilter = NonNullable<TodoDailyTrendRequest['statusFilter']>;

const todos = useTodosStore();
const message = useMessage();
const isDark = useDark();

const activity = ref<TodoActivityPoint[]>([]);
const trend = ref<TodoTrendPoint[]>([]);
const activityRange = ref<ActivityRange>(30);
const trendRange = ref<TrendRange>(30);
const statusFilter = ref<StatusFilter>('all');
const loadingActivity = ref(false);
const loadingTrend = ref(false);
const resetting = ref(false);

const rangeOptions = [
  { label: '最近 30 天', value: 30 },
  { label: '最近 60 天', value: 60 },
  { label: '最近 90 天', value: 90 },
] satisfies Array<{ label: string; value: TrendRange }>;

const activityRangeOptions = [
  ...rangeOptions,
  { label: '最近 1 年', value: 365 },
] satisfies Array<{ label: string; value: ActivityRange }>;

const statusOptions: Array<{ label: string; value: StatusFilter }> = [
  { label: '全部', value: 'all' },
  { label: '未开始', value: 'todo' },
  { label: '进行中', value: 'doing' },
  { label: '暂停', value: 'paused' },
  { label: '已完成', value: 'done' },
];

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
        completed: '#55c67a',
      }
    : {
        text: '#25252b',
        muted: '#70707a',
        axis: '#e4e4e8',
        empty: '#f0f1f4',
        heat: ['#f0f1f4', '#d8f0df', '#9bd9aa', '#54ba75', '#23824b'],
        created: '#2563eb',
        started: '#d97706',
        completed: '#16a34a',
      },
);

const today = computed(() => new Date());
const activityStart = computed(() => {
  const start = new Date(today.value);
  start.setDate(start.getDate() - activityRange.value + 1);
  return formatDate(start);
});
const activityEnd = computed(() => formatDate(today.value));
const trendStart = computed(() => {
  const start = new Date(today.value);
  start.setDate(start.getDate() - trendRange.value + 1);
  return formatDate(start);
});
const trendEnd = computed(() => formatDate(today.value));

const activityOption = computed(() => {
  const counts = new Map(activity.value.map(point => [point.date, point.count]));
  const data = eachDay(activityStart.value, activityEnd.value).map(date => [
    date,
    counts.get(date) ?? 0,
  ]);
  const colors = palette.value;

  return {
    textStyle: { color: colors.text },
    tooltip: {
      formatter: (params: { value: [string, number] }) => {
        const [date, count] = params.value;
        return count > 0 ? `${date}: 完成 ${count} 个任务` : `${date}: 无完成任务`;
      },
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
        { value: 0, color: colors.empty },
      ],
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
        borderColor: isDark.value ? '#1f1f24' : '#ffffff',
      },
      yearLabel: { show: false },
      monthLabel: { color: colors.muted, fontSize: 11 },
      dayLabel: {
        firstDay: 1,
        color: colors.muted,
        fontSize: 11,
        nameMap: ['日', '一', '二', '三', '四', '五', '六'],
      },
    },
    series: [
      {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data,
      },
    ],
  };
});

const trendOption = computed(() => {
  const colors = palette.value;
  const dates = trend.value.map(point => point.date);
  return {
    color: [colors.created, colors.started, colors.completed],
    textStyle: { color: colors.text },
    tooltip: { trigger: 'axis' },
    legend: {
      top: 0,
      textStyle: { color: colors.muted },
      data: ['创建', '开始', '完成'],
    },
    grid: { top: 42, left: 42, right: 18, bottom: 34 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dates,
      axisLine: { lineStyle: { color: colors.axis } },
      axisLabel: { color: colors.muted },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: colors.axis } },
      axisLabel: { color: colors.muted },
    },
    series: [
      {
        name: '创建',
        type: 'line',
        smooth: true,
        data: trend.value.map(point => point.created),
      },
      {
        name: '开始',
        type: 'line',
        smooth: true,
        data: trend.value.map(point => point.started),
      },
      {
        name: '完成',
        type: 'line',
        smooth: true,
        data: trend.value.map(point => point.completed),
      },
    ],
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

async function loadAll() {
  await Promise.all([loadActivity(), loadTrend()]);
}

async function loadActivity() {
  loadingActivity.value = true;
  try {
    activity.value = await todos.getActivity({
      start: activityStart.value,
      end: activityEnd.value,
    });
  } catch (error) {
    message.error(`加载任务活跃度失败：${String(error)}`);
  } finally {
    loadingActivity.value = false;
  }
}

async function loadTrend() {
  loadingTrend.value = true;
  try {
    trend.value = await todos.getDailyTrend({
      start: trendStart.value,
      end: trendEnd.value,
      statusFilter: statusFilter.value,
    });
  } catch (error) {
    message.error(`加载每日趋势失败：${String(error)}`);
  } finally {
    loadingTrend.value = false;
  }
}

async function onConfirmReset() {
  resetting.value = true;
  try {
    const count = await todos.resetStats();
    message.success(`已永久删除 ${count} 条历史任务`);
    await loadAll();
  } catch (error) {
    message.error(`重置数据失败：${String(error)}`);
  } finally {
    resetting.value = false;
  }
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function eachDay(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = parseDate(start);
  const endTime = parseDate(end).getTime();
  while (current.getTime() <= endTime) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}
</script>

<template>
  <div class="stats-view">
    <header class="stats-header">
      <div>
        <h1>统计</h1>
        <p>查看待办完成活跃度与每日状态趋势</p>
      </div>
    </header>

    <section class="stats-grid">
      <NCard class="stats-card" title="任务活跃度">
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
      <NPopconfirm
        positive-text="确认重置"
        negative-text="取消"
        @positive-click="onConfirmReset"
      >
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
