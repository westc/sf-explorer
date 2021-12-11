const { ipcRenderer } = require('electron');
const utils = require(`./utils`);
const jsforce = require('jsforce');

// Require our custom components.
require(`./vue-components/connection-list/component`);
require(`./vue-components/modal/component`);
require(`./vue-components/monaco-editor/component`);
require(`./vue-components/query-list/component`);
require(`./vue-components/ag-grid/component`);
require(`./vue-components/loading-overlay/component`);
require(`./vue-components/connection-explorer/component`);
require(`./vue-components/job-viewer/component`);
require(`./vue-components/objects-explorer/component`);


/** @type {{[k: string]: jsforce.Connection}} */
globalThis.jsforceConnsByUUID = {};
globalThis.remoteSettings = utils.getRemoteSettings();
globalThis.appSettings = utils.loadAppSettings();


/**
 * Once the page can be written to go ahead and get the settings from the system
 * and then start the Vue app.
 */
globalThis.addEventListener('DOMContentLoaded', () => {
  utils.loadAppSettings();
  initVueApp();
});

/**
 * Initializes the Vue app with the settings loaded from the system.
 */
function initVueApp() {
  const {appSettings} = globalThis;
  const {connections, isEncrypted} = appSettings;

  const vueApp = globalThis.vueApp = new Vue({
    el: '#vueApp',
    data: {
      LOGIN_URLS: ['https://login.salesforce.com', 'https://test.salesforce.com'],
      connections: connections,
      isEncrypted,
      selectedConnectionIndex: -1,
      masterPassword: null,
      isShowingMasterPassword: false,
      columnDefs: [
        { field: "make", headerName: 'Make' },
        { field: "model", headerName: 'Model' },
        { field: "price", headerName: 'Price ($)' },
      ],
      rowData: [
        { make: "Toyota", model: "Celica", price: 35000 },
        { make: "Ford", model: "Mondeo", price: 32000 },
        { make: "Porsche", model: "Boxter", price: 72000 },
      ]
    },
    computed: {
      selectedConnection() {
        return this.connections[this.selectedConnectionIndex];
      },
      isSelectingConnection() {
        return !this.selectedConnection;
      }
    },
    methods: {
      saveConnections(connections) {
        this.connections = appSettings.connections = connections;
        utils.saveAppSettings();
      },
      selectConnection(index) {
        this.selectedConnectionIndex = index;
      },
      saveConnection(connection) {
        utils.saveConnection(connection);
      }
    }
  });
 }
