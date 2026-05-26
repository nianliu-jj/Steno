// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

import StatsView from './StatsView.vue';

const getActivity = vi.fn();
const getDailyTrend = vi.fn();
const resetStats = vi.fn();
const messageSuccess = vi.fn();
const darkState = ref(false);

vi.mock('@vueuse/core', () => ({
  useDark: () => darkState,
}));

vi.mock('@/stores/todos', () => ({
  useTodosStore: () => ({
    getActivity,
    getDailyTrend,
    resetStats,
  }),
}));

vi.mock('vue-echarts', () => ({
  default: defineComponent({
    name: 'VChart',
    props: {
      option: {
        type: Object,
        required: true,
      },
    },
    setup(props) {
      return () => h('div', { 'data-testid': 'chart', 'data-option': JSON.stringify(props.option) });
    },
  }),
}));

vi.mock('naive-ui', () => ({
    NButton: defineComponent({
      props: { type: String, loading: Boolean },
      emits: ['click'],
      setup(props, { emit, slots }) {
        return () => h('button', { disabled: props.loading, onClick: () => emit('click') }, slots.default?.());
      },
    }),
    NCard: defineComponent({
      setup(_, { slots }) {
        return () =>
          h('section', { 'data-testid': 'stats-card' }, [
            h('div', { 'data-testid': 'card-extra' }, slots['header-extra']?.()),
            slots.default?.(),
          ]);
      },
    }),
    NPopconfirm: defineComponent({
      emits: ['positive-click'],
      setup(_, { emit, slots }) {
        return () =>
          h('div', { 'data-testid': 'confirm' }, [
            h('div', slots.trigger?.()),
            h('button', { 'data-testid': 'confirm-positive', onClick: () => emit('positive-click') }, '确认重置'),
            h('div', slots.default?.()),
          ]);
      },
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
              onChange: (event: Event) => emit('update:value', (event.target as HTMLSelectElement).value),
            },
            (props.options as Array<{ label: string; value: string | number }>).map(option =>
              h('option', { value: option.value }, option.label),
            ),
          );
      },
    }),
    useMessage: () => ({ success: messageSuccess, error: vi.fn() }),
}));

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

  it('loads activity and trend data on mount', async () => {
    mount(StatsView);
    await Promise.resolve();
    await Promise.resolve();

    expect(getActivity).toHaveBeenCalledWith({ start: '2025-05-26', end: '2026-05-26' });
    expect(getDailyTrend).toHaveBeenCalledWith({
      start: '2026-04-27',
      end: '2026-05-26',
      statusFilter: 'all',
    });
  });

  it('reloads trend data when the range select changes', async () => {
    const wrapper = mount(StatsView);
    await Promise.resolve();
    getDailyTrend.mockClear();

    await wrapper.find('select').setValue('90');
    await Promise.resolve();

    expect(getDailyTrend).toHaveBeenCalledWith({
      start: '2026-02-26',
      end: '2026-05-26',
      statusFilter: 'all',
    });
  });

  it('confirms reset, shows deleted count, and refreshes both charts', async () => {
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
