const fs = require('fs');
const path = require('path');
const utils = require('../../utils');


// Uses this file's directory name as the component name.
const COMPONENT_NAME = path.basename(__dirname);
// Uses the HTML file that has the same name in the same directory as this file.
const TEMPLATE_PATH = path.join(__filename).replace(/\.\w+$/, '.html');

exports.component = Vue.component(COMPONENT_NAME, {
  
  template: fs.readFileSync(TEMPLATE_PATH, {encoding: 'utf-8'}),
  
  props: ['connection'],

  data() {
    return {
      pages: [
        { name: 'Job Viewer', id: 'job-viewer' },
        { name: 'Objects Explorer', id: 'objects-explorer' },
        { name: 'Query Data', id: 'query-data' },
      ].map(p => Object.assign({isSelected: false}, p))
    };
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
      this.pages.forEach((p, i) => p.isSelected = i === pageIndex);
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
