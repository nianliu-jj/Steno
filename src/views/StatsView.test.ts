/**
 * @file 前端视图 - Stats View
 *
 * 覆盖 Stats View 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

import StatsView from './StatsView.vue';

// 局部常量 getActivity：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const getActivity = vi.fn();
// 局部常量 getDailyTrend：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const getDailyTrend = vi.fn();
// 局部常量 resetStats：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const resetStats = vi.fn();
// 局部常量 messageSuccess：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const messageSuccess = vi.fn();
// 局部常量 darkState：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const darkState = ref(false);

vi.mock('@vueuse/core', () => ({
  useDark: () => darkState
}));

vi.mock('@/stores/todos', () => ({
  useTodosStore: () => ({
    getActivity,
    getDailyTrend,
    resetStats
  })
}));

vi.mock('vue-echarts', () => ({
  default: defineComponent({
    name: 'VChart',
    props: {
      option: {
        type: Object,
        required: true
      }
    },
    setup(props) {
      return () => h('div', { 'data-testid': 'chart', 'data-option': JSON.stringify(props.option) });
    }
  })
}));

vi.mock('naive-ui', () => ({
  NButton: defineComponent({
    props: { type: String, loading: Boolean },
    emits: ['click'],
    setup(props, { emit, slots }) {
      return () => h('button', { disabled: props.loading, onClick: () => emit('click') }, slots.default?.());
    }
  }),
  NCard: defineComponent({
    setup(_, { slots }) {
      return () =>
        h('section', { 'data-testid': 'stats-card' }, [
          h('div', { 'data-testid': 'card-extra' }, slots['header-extra']?.()),
          slots.default?.()
        ]);
    }
  }),
  NPopconfirm: defineComponent({
    emits: ['positive-click'],
    setup(_, { emit, slots }) {
      return () =>
        h('div', { 'data-testid': 'confirm' }, [
          h('div', slots.trigger?.()),
          h('button', { 'data-testid': 'confirm-positive', onClick: () => emit('positive-click') }, '确认重置'),
          h('div', slots.default?.())
        ]);
    }
  }),
  NSelect: defineComponent({
    props: { value: [String, Number], options: Array },
    emits: ['update:value'],
    setup(props, { emit }) {
      return () =>
        h(
          'select',
          {
            value: props.value,
            onChange: (event: Event) => emit('update:value', (event.target as HTMLSelectElement).value)
          },
          (props.options as Array<{ label: string; value: string | number }>).map(option =>
            h('option', { value: option.value }, option.label)
          )
        );
    }
  }),
  useMessage: () => ({ success: messageSuccess, error: vi.fn() })
}));

// 测试用例：验证「StatsView」场景，锁定 Stats View 的用户可见行为。
describe('StatsView', () => {
  beforeEach(() => {
    darkState.value = false;
    getActivity.mockReset();
    getDailyTrend.mockReset();
    resetStats.mockReset();
    messageSuccess.mockReset();
    getActivity.mockResolvedValue([{ date: '2026-05-20', count: 4 }]);
    getDailyTrend.mockResolvedValue([{ date: '2026-05-20', created: 2, started: 1, completed: 1 }]);
    resetStats.mockResolvedValue(3);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T12:00:00+08:00'));
  });

  // 测试用例：验证「loads activity and trend data on mount」场景，锁定 Stats View 的用户可见行为。
  it('loads activity and trend data on mount', async () => {
    mount(StatsView);
    await Promise.resolve();
    await Promise.resolve();

    expect(getActivity).toHaveBeenCalledWith({ start: '2026-04-27', end: '2026-05-26' });
    expect(getDailyTrend).toHaveBeenCalledWith({
      start: '2026-04-27',
      end: '2026-05-26',
      statusFilter: 'all'
    });
  });

  // 测试用例：验证「reloads activity data when the activity range select changes」场景，锁定 Stats View 的用户可见行为。
  it('reloads activity data when the activity range select changes', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(StatsView);
    await Promise.resolve();
    await Promise.resolve();
    getActivity.mockClear();

    await wrapper.find('[data-testid="activity-range-select"]').setValue('90');
    await Promise.resolve();

    expect(getActivity).toHaveBeenCalledWith({ start: '2026-02-26', end: '2026-05-26' });
  });

  // 测试用例：验证「reloads trend data when the range select changes」场景，锁定 Stats View 的用户可见行为。
  it('reloads trend data when the range select changes', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(StatsView);
    await Promise.resolve();
    getDailyTrend.mockClear();

    await wrapper.find('[data-testid="trend-range-select"]').setValue('90');
    await Promise.resolve();

    expect(getDailyTrend).toHaveBeenCalledWith({
      start: '2026-02-26',
      end: '2026-05-26',
      statusFilter: 'all'
    });
  });

  // 测试用例：验证「confirms reset, shows deleted count, and refreshes both charts」场景，锁定 Stats View 的用户可见行为。
  it('confirms reset, shows deleted count, and refreshes both charts', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(StatsView);
    await Promise.resolve();
    getActivity.mockClear();
    getDailyTrend.mockClear();

    await wrapper.get('[data-testid="confirm-positive"]').trigger('click');
    await Promise.resolve();
    await Promise.resolve();

    expect(resetStats).toHaveBeenCalledOnce();
    expect(messageSuccess).toHaveBeenCalledWith('已永久删除 3 条历史任务');
    expect(getActivity).toHaveBeenCalledOnce();
    expect(getDailyTrend).toHaveBeenCalledOnce();
  });
});
