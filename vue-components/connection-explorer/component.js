const fs = require('fs');
const path = require('path');
const utils = require('../../utils');

const DEFAULT_DATA = {
  pages: [
    { name: 'Job Viewer', id: 'job-viewer', icon: 'binoculars-fill' },
    { name: 'Objects Explorer', id: 'objects-explorer', icon: 'globe2' },
    { name: 'Query Data', id: 'query-data', icon: 'search' },
    { name: 'Toggle Dev Tools', id: 'toggle-dev-tools', icon: 'tools' },
  ].map(p => Object.assign({isSelected: false}, p))
};

/**
 * @typedef {Object} PROPERTIES
 * @property {import('../../utils').SFE_Connection} connection
 * 
 * @typedef {DEFAULT_DATA & PROPERTIES} ThisComponent
 */


// Uses this file's directory name as the component name.
const COMPONENT_NAME = path.basename(__dirname);
// Uses the HTML file that has the same name in the same directory as this file.
const TEMPLATE_PATH = path.join(__filename).replace(/\.\w+$/, '.html');

exports.component = Vue.component(COMPONENT_NAME, {
  
  template: fs.readFileSync(TEMPLATE_PATH, {encoding: 'utf-8'}),
  
  props: ['connection'],

  data() {
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  },

  computed: {
    selectedPageId() {
      return this.pages.find(p => p.isSelected)?.id;
    }
  },

  watch: {
  },

  methods: {
    select(pageIndex) {
      /** @type {ThisComponent} */
      const self = this;

      self.pages.forEach((p, i) => {
        let isSelected = i === pageIndex;
        if (isSelected && p.id === 'toggle-dev-tools') {
          isSelected = false;
          utils.toggleDevTools();
        }
        p.isSelected = isSelected;
      });
    },
    getButtonClasses(pageIndex) {
      return `btn btn-secondary + ${this.pages[pageIndex].isSelected ? ' active' : ''}`;
    },
    saveConnection() {
      utils.saveConnection(this.connection);
    },
  },

  mounted() {
    // While the component is showing, make sure that if the window is closed
    // the connection will be saved.
    window.addEventListener('beforeunload', () => {
      if (this._isMounted) {
        this.saveConnection();
      }
    });
  },

  beforeDestroy() {
  },

});
