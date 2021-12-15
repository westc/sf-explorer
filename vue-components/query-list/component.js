const fs = require('fs');
const path = require('path');
const utils = require(`../../utils`);


// Uses this file's directory name as the component name.
const COMPONENT_NAME = path.basename(__dirname);
// Uses the HTML file that has the same name in the same directory as this file.
const TEMPLATE_PATH = path.join(__filename).replace(/\.\w+$/, '.html');

exports.component = Vue.component(COMPONENT_NAME, {
  
  template: fs.readFileSync(TEMPLATE_PATH, {encoding: 'utf-8'}),
  
  props: ['connection'],

  data() {
    return {
      queries: [],
      queryToggle: 'collapse',
      queryResults: [],
      CTRL_OR_CMD_TEXT: utils.CTRL_OR_CMD_TEXT,
      isQuerying: false,
    };
  },

  computed: {

    hasQueryResults() {
      return this.queryResults.map(qr => qr?.records?.length >= 0);
    },

    /**
     * Gives columnDefs for each query in `queries`.
     */
    columnDefs() {
      return this.queryResults.map(qr => {
        if (qr?.records?.length > 0) {
          return Object.values(
            qr.records.reduce((byField, record) => {
              return Object.keys(record).reduce((byField, field) => {
                if (!(field in byField)) {
                  byField[field] = { field, maxWidth: 500, headerName: field };
                }
                if (Array.isArray(record[field])) {
                  byField[field] = {
                    cellRenderer(p) {
                      const data = p.data[field];
                      return data
                        && '<a href="https://google.com/" target="_blank">View&hellip;</a>';
                    }
                  };
                }
                return byField;
              }, byField);
            }, {})
          );
        }
      });
    },

    /**
     * Gives rowData for each query in `queries`.
     */
    rowData() {
      return this.queryResults.map(qr => qr?.records);
    }

  },
  
  methods: {

    updateQueryColDefs(queryIndex, colDefs) {
      /** @type {import('../../utils').SFE_Query} */
      let query = this.queries[queryIndex];
      query.colDefs = colDefs;
    },

    addQuery() {
      /** @type {import('../utils').SFE_Query[]} */
      const queries = this.queries;
      queries.push(utils.validateConnectionQuery({}, queries.length));
      this.queryResults.push(null);
    },

    removeQuery(index) {
      this.queries.splice(index, 1);
      this.queryResults.splice(index, 1);
    },

    enableQueryCollapse() {
      this.queryToggle = 'collapse';
    },

    disableQueryCollapse() {
      this.queryToggle = '';
    },

    executeQuery(index) {
      // Make sure contents of collapse are visible.
      const elemCollapse = this.$refs.foldingContent[index];
      bootstrap.Collapse.getOrCreateInstance(elemCollapse).show();

      this.isQuerying = true;
      
      this.saveConnection();
      
      utils.executeQuery(this.connection, this.queryResults, index, (error, records) => {
        this.isQuerying = false;

        this.queryResults[index] = { error, records };

        // Make sure the the component is updated.
        this.queryResults = this.queryResults.map(x => x);
      });
    },

    toggle(obj, propName) {
      obj[propName] = !obj[propName];
    },
    
    saveConnection() {
      utils.saveConnection(this.connection);
    },

  },

  watch: {

    connection: {
      handler(connection) {
        this.queries = connection.queries ?? [];
        if (this.queryResults.length === 0) {
          this.queryResults = new Array(this.queries.length);
        }
      },
      immediate: true
    }

  },

  mounted() {
  },
});
