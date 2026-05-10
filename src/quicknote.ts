// 浮窗速记入口：与主窗口完全独立的 Vue app，不引入主窗口的 pinia / naive-ui，
// 减少首屏开销（浮窗追求"瞬开瞬写"）。
import { createApp } from 'vue';
import 'virtual:uno.css';
import './styles/global.css';
import QuickNote from './QuickNote.vue';

createApp(QuickNote).mount('#quicknote');
