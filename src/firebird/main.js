import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import './keypad.css';
import { fitStandaloneViewport } from './viewport.js';
fitStandaloneViewport();
createApp(App).mount('#app');
