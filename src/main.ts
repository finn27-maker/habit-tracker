import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { requestPersistenceOnce } from './platform/install';

const PERSIST_FLAG = 'habit-tracker:persist-requested';

void requestPersistenceOnce({
  storage: navigator.storage,
  hasRequested: () => localStorage.getItem(PERSIST_FLAG) === '1',
  markRequested: () => localStorage.setItem(PERSIST_FLAG, '1'),
});

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element');

export default mount(App, { target });
