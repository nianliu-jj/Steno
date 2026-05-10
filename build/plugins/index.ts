import type { PluginOption } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import progress from 'vite-plugin-progress';
import { setupUnocss } from './unocss';
import { setupDevtoolsPlugin } from './devtools';

export function setupVitePlugins(viteEnv: Record<string, string>, _buildTime: string) {
  const plugins: PluginOption = [
    vue(),
    vueJsx(),
    setupDevtoolsPlugin(viteEnv),
    setupUnocss(),
    progress()
  ];

  return plugins;
}
