const fs = require('fs');
const path = require('path');
const utils = require('../../utils');

const ALL_SOBJECTS_FIELDS_TO_INDICES = ['label', 'name'].reduce(
  (c, x, i) => Object.assign(c, {[x]: i}),
  {}
);

// Uses this file's directory name as the component name.
const COMPONENT_NAME = path.basename(__dirname);
// Uses the HTML file that has the same name in the same directory as this file.
const TEMPLATE_PATH = path.join(__filename).replace(/\.\w+$/, '.html');

exports.component = Vue.component(COMPONENT_NAME, {
  
  template: fs.readFileSync(TEMPLATE_PATH, {encoding: 'utf-8'}),
  
  props: ['connection'],

  data() {
    return {
      /** @type {Error} */
      allSObjectsError: null,
      /** @type {import('jsforce').DescribeGlobalSObjectResult[]} */
      allSObjects: null,
      isLoading: false,
    };
  },

  computed: {

    allSObjectsColDefs() {
      const forbiddenFields = {};
      return Object.values(
        (this.allSObjects ?? []).reduce(
          (colDefs, job) => {
            for (const [key, value] of Object.entries(job)) {
              // Make sure the column is omitted if it contains a function or an
              // object.
              if (forbiddenFields[key] !== true) {
                const valueType = value === null
                  ? 'null'
                  : value instanceof Date
                    ? 'Date'
                    : typeof value;
                if (valueType === 'object' || valueType === 'function') {
                  delete colDefs[key];
                  forbiddenFields[key] = true;
                }
                // If the column is new or if the filter type hasn't been defined.
                else if ((!(key in colDefs) || colDefs.filter === true)) {
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
                        'number' === valueType
                          ? 'agNumberColumnFilter'
                          : 'Date' === valueType
                            ? 'agDateColumnFilter'
                            : 'agTextColumnFilter'
                      )
                    }
                  );
                }
              }
            }
            return colDefs;
          },
          {}
        )
      ).sort((a, b) => {
        return (ALL_SOBJECTS_FIELDS_TO_INDICES[a.field] ?? Infinity)
          - (ALL_SOBJECTS_FIELDS_TO_INDICES[b.field] ?? Infinity);
      });
    },

  },

  watch: {
  },

  mounted() {
    this.isLoading = true;
    utils.describeAll(this.connection, (allSObjectsError, res) => {
      Object.assign(this, {
        isLoading: false,
        allSObjectsError,
        allSObjects: res?.sobjects
      });
    });
  },
});
