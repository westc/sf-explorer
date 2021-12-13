const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');

/** @type {import('ag-grid-community')} */
const AgGrid = require('ag-grid-community/dist/ag-grid-community');

// Uses this file's directory name as the component name.
const COMPONENT_NAME = path.basename(__dirname);
// Uses the HTML file that has the same name in the same directory as this file.
const TEMPLATE_PATH = path.join(__filename).replace(/\.\w+$/, '.html');


function getValueAsString(value, args) {
  return (
    'function' === typeof value
      ? value.apply(this, args)
      : value
  ) || '';
}


exports.component = Vue.component(COMPONENT_NAME, {
  
  template: fs.readFileSync(TEMPLATE_PATH, {encoding: 'utf-8'}),
  
  props: {
    defaultColDef: {
      type: Object,
      default() {
        return {
          flex: 1,
          sortable: true,
          resizable: true,
          filter: true,
        };
      }
    },
    columnDefs: Array,
    rowData: Array,
    height: { default: 200 },
  },

  data() {
    return {
      _agGrid: null,
    };
  },

  computed: {
  },
  
  methods: {
    updateContainerHeight() {
      this.$refs.container.style.height = `${this.height}`.replace(/^\d+$/, '$&px');
    }
  },

  watch: {

    rowData(rowData) {
      this._agGrid.gridOptions.api.setRowData(rowData);
    },

    height(height) {
      this.updateContainerHeight();
    },

    columnDefs(columnDefs) {
      this._agGrid.gridOptions.api.setColumnDefs(columnDefs);
    },

    defaultColDef(defaultColDef) {
      throw new Error('Unhandled defaultColDef watcher')
    }

  },

  mounted() {
    // create the grid passing in the div to use together with the columns & data we want to use
    let agGrid = this._agGrid = new AgGrid.Grid(this.$refs.container, {
      columnDefs: this.columnDefs,
      rowData: this.rowData,
      defaultColDef: this.defaultColDef,
      suppressContextMenu: false,
      onCellKeyDown(e) {
        // If Meta + C or Ctrl + C...
        if ((e.event.ctrlKey ^ e.event.metaKey) && e.event.keyCode === 67) {
          navigator.clipboard.writeText(e.value);
        }
      },
      columnTypes: {
        button: {
          cellRenderer: 'btnCellRenderer',
          filter: false,
          sortable: false,
        },
      },
      components: {
        btnCellRenderer: (function() {
          function BtnCellRenderer() {}
          Object.assign(
            BtnCellRenderer.prototype,
            {
              init(params) {
                this.params = params;
          
                this.eGui = document.createElement("button");
                this.eGui.innerHTML = getValueAsString(params.text, [params]) || params.value;
                this.eGui.className = `btn-sm btn btn-`
                  + (getValueAsString(params.variant, [params]) || 'secondary')
                  + ' '
                  + getValueAsString(params.className, [params]);
                this.eGui.style.cssText = getValueAsString(params.cssText, [params]);
          
                this.btnClickedHandler = this.btnClickedHandler.bind(this);
                this.eGui.addEventListener("click", this.btnClickedHandler);
              },
          
              getGui() {
                return this.eGui;
              },
          
              destroy() {
                this.eGui.removeEventListener("click", this.btnClickedHandler);
              },
          
              btnClickedHandler(event) {
                this.params.onClick(this.params, event);
              }
            }
          );
          return BtnCellRenderer;
        })(),
      },
    });
    globalThis.agGrid = agGrid;
    this.updateContainerHeight();
  },
});
