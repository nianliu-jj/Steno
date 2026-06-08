/**
 * @file 项目配置 - uno.config
 *
 * 组织 uno.config 的核心逻辑、类型和协作边界，供 项目配置 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { defineConfig, presetWind3, transformerDirectives, transformerVariantGroup } from 'unocss';
import { presetSoybeanAdmin } from './src/uno-preset';
import { themeVars } from './src/theme';

export default defineConfig({
  content: {
    pipeline: {
      exclude: ['node_modules', 'dist']
    }
  },
  theme: {
    ...themeVars,
    fontSize: {
      'icon-xs': '0.875rem',
      'icon-small': '1rem',
      icon: '1.125rem',
      'icon-large': '1.5rem',
      'icon-xl': '2rem'
    }
  },
  shortcuts: {
    'card-wrapper': 'rd-8px shadow-sm'
  },
  transformers: [transformerDirectives(), transformerVariantGroup()],
  presets: [presetWind3({ dark: 'class' }), presetSoybeanAdmin()]
});
