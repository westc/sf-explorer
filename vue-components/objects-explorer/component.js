const fs = require('fs');
const path = require('path');
const utils = require('../../utils');

const ALL_SOBJECTS_FIELDS_TO_INDICES = ['label', 'name'].reduce(
  (c, x, i) => Object.assign(c, {[x]: i}),
  {}
);

const DEFAULT_DATA = {
  /** @type {Error} */
  allSObjectsError: null,
  /** @type {import('jsforce').DescribeGlobalSObjectResult[]} */
  allSObjects: null,

  /** @type {Error} */
  sobjectError: null,
  /** @type {import('jsforce').DescribeSObjectResult} */
  sobject: null,


  isLoading: false,
  /** @type {"allSObjects"|"sobject"} */
  view: null,
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
    return Object.assign({}, DEFAULT_DATA);
  },

  computed: {

    sobjectTables() {
      /** @type {ThisComponent} */
      const self = this;

      const {sobject} = self;

      if (!sobject) {
        return [];
      }

      const tables = [];

      const generalTable = {
        title: 'General Properties',
        colDefs: [
          { field: 'name', headerName: 'Name' },
          { field: 'value', headerName: 'Value' },
        ],
        rows: Object.entries(utils.flattenObjectKeys(sobject)).reduce(
          (rows, [name, value]) => {
            if (Array.isArray(value)) {
              const colDefsById = {};
              value.forEach(row => {
                for (let rowKey of Object.keys(row)) {
                  if (!(rowKey in colDefsById)) {
                    colDefsById[rowKey] = {
                      field: rowKey,
                      headerName: rowKey,
                    };
                  }
                };
              });
              tables.push({
                title: name,
                colDefs: Object.values(colDefsById),
                rows: value
              });
            }
            else {
              rows.push({name, value});
            }
            return rows;
          },
          []
        )
      };

      return [generalTable].concat(tables);
    },

    allSObjectsColDefs() {
      /** @type {ThisComponent} */
      const self = this;

      const forbiddenFields = {};
      return [
        {
          headerName: '',
          field: 'name',
          type: 'button',
          cellRendererParams: {
            text: 'View',
            onClick(params) {
              self.isLoading = true;
              utils.describe(
                self.connection,
                params.value,
                (sobjectError, sobject) => {
                  Object.assign(self, {
                    isLoading: false,
                    sobjectError,
                    sobject,
                    view: 'sobject',
                  });
                }
              );
            },
          },
          minWidth: 100,
        }
      ].concat(
        Object.values(
          (self.allSObjects ?? []).reduce(
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
        })
      );
    },

  },

  methods: {
    setView(newView) {
      /** @type {ThisComponent} */
      const self = this;
      self.view = newView;
    }
  },

  watch: {
  },

  mounted() {
    this.isLoading = true;
    utils.describeAll(this.connection, (allSObjectsError, res) => {
      Object.assign(this, {
        isLoading: false,
        allSObjectsError,
        allSObjects: res?.sobjects,
        view: 'allSObjects',
      });
    });
  },
});
