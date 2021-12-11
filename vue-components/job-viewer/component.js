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
      jobs: [],
      isLoading: false,
    };
  },

  computed: {

    columnDefs() {
      return Object.values(
        this.jobs.reduce(
          (colDefs, job) => {
            for (const [key, value] of Object.entries(job)) {
              if (!(key in colDefs) || colDefs.filter === true) {
                colDefs[key] = Object.assign(
                  Object(colDefs[key]),
                    {
                    supressFieldDotNotation: true,
                    field: key,
                    resizable: true,
                    headerName: key,
                    headerTooltip: key,
                    minWidth: 150,
                    sortable: true,
                    filter: value == null || (
                      'number' === typeof value
                        ? 'agNumberColumnFilter'
                        : value instanceof Date
                          ? 'agDateColumnFilter'
                          : 'agTextColumnFilter'
                    )
                  }
                );
              }
            }
            return colDefs;
          },
          {}
        )
      );
    },

  },

  watch: {
  },

  mounted() {
    this.isLoading = true;
    utils.getBulkApiJobs(this.connection, (jobs) => {
      this.isLoading = false;
      this.jobs = jobs;
    });
  },
});
