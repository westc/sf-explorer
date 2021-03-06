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
      savedColDefsByName: {},
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

  methods: {
    updateSavedColDefs(tableName, savableColDefs) {
      this.savedColDefsByName[tableName] = savableColDefs;
      utils.saveGeneralColDef(savableColDefs, `job-viewer/${tableName}`);
    }
  },

  mounted() {
    /** @type {import('../../utils').SFE_AppSettings} */
    const appSettings = globalThis.appSettings;
    this.savedColDefsByName = Object.entries(appSettings.generalColDefs).reduce(
      (savedColDefsByName, [tableName, savedColDef]) => {
        savedColDefsByName[tableName.replace(/^job-viewer\//, '')] = savedColDef;
        return savedColDefsByName;
      },
      {}
    );
    
    this.isLoading = true;
    utils.getBulkApiJobs(this.connection, (jobs) => {
      this.isLoading = false;
      this.jobs = jobs;
    });
  },
});
