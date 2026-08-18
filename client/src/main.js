import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';
import { connect } from './store.js';

connect();
createApp(App).mount('#app');
