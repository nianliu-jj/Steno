import VueDevtools from 'vite-plugin-vue-devtools';

type LaunchEditor = 'code' | 'webstorm' | 'phpstorm' | 'idea' | 'cursor' | undefined;

export function setupDevtoolsPlugin(viteEnv: Record<string, string>) {
  return VueDevtools({
    launchEditor: viteEnv.VITE_DEVTOOLS_LAUNCH_EDITOR as LaunchEditor
  });
}
