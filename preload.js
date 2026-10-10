'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Unwraps {ok, data} / {ok:false, error}
async function call(channel, ...args) {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

contextBridge.exposeInMainWorld('api', {
  allBooks: (opts) => call('books:all', opts),
  addBook: (book) => call('books:add', book),
  updateBook: (id, book) => call('books:update', id, book),
  deleteBook: (id) => call('books:delete', id),
  clearBooks: () => call('books:clear'),
  getGoals: () => call('goals:get'),
  setGoals: (goals) => call('goals:set', goals),
  importCsv: () => call('csv:import'),
  exportCsv: () => call('csv:export'),
});
