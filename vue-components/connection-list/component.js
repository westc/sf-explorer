const fs = require('fs');
const path = require('path');
const utils = require('../../utils');
const { ipcRenderer } = require('electron');


// Uses this file's directory name as the component name.
const COMPONENT_NAME = path.basename(__dirname);
// Uses the HTML file that has the same name in the same directory as this file.
const TEMPLATE_PATH = path.join(__filename).replace(/\.\w+$/, '.html');

exports.component = Vue.component(COMPONENT_NAME, {
  
  template: fs.readFileSync(TEMPLATE_PATH, {encoding: 'utf-8'}),
  
  props: ['connections'],
  data() {
    return {
      LOGIN_URLS: ['https://login.salesforce.com', 'https://test.salesforce.com'],
      isEditingConn: false,
      selectedConnIndex: -1,
      currentConn: {
        id: null,
        display: null,
        username: null,
        password: null,
        token: null,
        loginUrl: null,
        queries: null,
      },
      isShowingMsgModal: false,
      msgModalTitle: null,
      msgModalContent: null,
      msgModalButtons: null,
      msgModalCallback: null,
      isShowingLoader: false,
    };
  },
  computed: {
    canSaveConn() {
      for (const key of ['display', 'username', 'password', 'loginUrl']) {
        if (!this.currentConn[key]?.trim()) {
          return false;
        }
      }
      return true;
    },
    connModalTitle() {
      return this.selectedConnIndex < 0
        ? 'Start A New Connection'
        : 'Edit Connection';
    },
    connModalButtons() {
      const disabled = !this.canSaveConn;
      const buttonsToShow = this.selectedConnIndex < 0
        // Buttons to show if creating a new connection.
        ? ['create-and-connect', 'create', 'test', 'cancel']
        // Buttons to show if updating an existing connection.
        : ['update', 'test', 'reset', 'cancel'];

      return [
        { value: 'create-and-connect', text: 'Create & Connect', icon: 'cloud-upload', type: 'primary', disabled },
        { value: 'create', text: 'Only Create', icon: 'cloud-plus', type: 'secondary', disabled },
        { value: 'update', text: 'Update', icon: 'cloud-plus', type: 'success', disabled },
        { value: 'test', text: 'Test', type: 'info', icon: 'cloud-check', disabled },
        { value: 'reset', text: 'Undo Changes', type: 'secondary', icon: 'arrow-counterclockwise' },
        { value: 'cancel', text: 'Cancel', type: 'warning', icon: 'x-square' },
      ].filter(b => buttonsToShow.includes(b.value));
    },
  },
  methods: {

    clickConnModalButton(button) {
      if (button.value === 'test') {
        this.testConn();
      }
      else if (button.value === 'reset') {
        this.resetCurrentConn();
      }
      else {
        if (button.value === 'create-and-connect') {
          this.createConn(true);
        }
        else if (button.value === 'create') {
          this.createConn(false);
        }
        else if (button.value === 'update') {
          this.updateSelectedConn();
        }
        this.isEditingConn = false;
      }
      // this.showMsgModal('clickConnModalButton', JSON.stringify(button, null, 2), 'OK');
    },


    clickMsgModalButton(button) {
      this.isShowingMsgModal = false;
      this.msgModalCallback?.call(this, button);
    },


    /**
     * Shows the message modal which will be closed when one of the buttons is
     * clicked.
     * @param {string} title
     *   Title of the modal.
     * @param {string} message
     *   The string content of the modal to show.
     * @param {string} buttons
     *   Comma delimited string of the button texts to show.
     * @param {Function} callback
     *   Function that will be called when a button is clicked.
     */
    showMsgModal(title, message, buttons, callback) {
      this.isShowingMsgModal = true;
      this.msgModalTitle = title;
      this.msgModalContent = message;
      this.msgModalButtons = buttons;
      this.msgModalCallback = callback;
    },


    /**
     * Used to start creating a new connection by opening the modal.
     */
    startNewConn() {
      const {currentConn} = this;
      // Blank out all of the fields.
      for (const key of Object.keys(currentConn)) {
        currentConn[key] = null;
      }
      currentConn.uuid = utils.uuidv4();
      currentConn.queries = [];
      this.selectedConnIndex = -1;
      this.isEditingConn = true;
    },


    /**
     * Triggers this components update event.
     * @param {Array} connections
     *   The connections to update.
     */
    updateConnections(connections) {
      this.$emit('update', connections);
    },


    /**
     * Adds the new connection to the array of connections and opens it if the
     * `openAfter` arg is set to `true`.
     * @param {boolean} openAfter
     *   Indicates whether or not to open the connection thereafter.
     */
    createConn(openAfter) {
      const connCount = this.connections.push(
        utils.validateConnection(this.currentConn, this.connections.length)
      );

      // Save the new connections to the system.
      this.updateConnections(this.connections);

      // Open the connection if that flag was set to true.
      if (openAfter) {
        this.openConn(connCount - 1);
      }
    },


    /**
     * Removes the connection at the specified index and saves the settings to
     * the system.
     * @param {number} index
     *   The index within `connections` for the connection that should be
     *   removed.
     */
    deleteConn(index) {
      this.connections.splice(index, 1);

      // Save the new connections to the system.
      this.updateConnections(this.connections);
    },


    editConn(index) {
      Object.assign(this.currentConn, this.connections[index]);
      this.selectedConnIndex = index;
      this.isEditingConn = true;
    },


    updateSelectedConn() {
      Object.assign(this.connections[this.selectedConnIndex], this.currentConn);

      // Save the new connections to the system.
      this.updateConnections(this.connections);
    },


    resetCurrentConn() {
      const {currentConn, selectedConnIndex, connections} = this;
      if (selectedConnIndex >= 0) {
        Object.assign(currentConn, connections[selectedConnIndex]);
      }
      else {
        // Blank out all of the fields.
        for (const key of Object.keys(currentConn)) {
          currentConn[key] = null;
        }
      }
    },

    
    /**
     * Tests the specified connection within `connections` unless `index` is
     * not given in which case it is assumed that `currentConn` should be
     * tested.
     * @param {?number=} index
     *   Optional.  If given this will be the index of the connection with
     *   `connections` to test.  If not given the `currentConn` which
     *   represents the current connection will be tested.
     */
    testConn(index) {
      this.isShowingLoader = true;
      const conn = index >= 0 ? this.connections[index] : this.currentConn;
      this.login(conn, true, () => {
        this.isShowingLoader = false;
      });
    },

    

    log(e) {
      console.log.apply(console, arguments);
      e.stopPropagation();
    },


    /**
     * Opens the connection at the specified `index`.
     * @param {number} index
     *   The index within the list of connections corresponding to the one
     *   that should be opened.
     */
    openConn(index) {
      this.isShowingLoader = true;
      this.login(this.connections[index], false, (err, res) => {
        this.isShowingLoader = false;
        if (res) {
          this.$emit('select', index);
        }
      });
    },


    /**
     * Logs into Salesforce using the specified credentials.  Sends the results to
     * the specified callback function.
     * @param {utils.SFE_Connection} conn
     *   Logs into Salesforce using the specified credentials.  Sends the results to
     *   the specified callback function.
     * @param {boolean} isTest
     *   Indicates whether or not to just test the login.
     * @param {function(Error, import('jsforce').UserInfo)} callback
     *   The callback function called after trying to log in.  The first parameter
     *   indicates the data that is returned if successful.  The second parameter
     *   indicates the error object if failed.
     */
    login(conn, isTest, callback) {
      utils.login(conn, isTest, (err, res) => {
        if (err) {
          this.showMsgModal('Connection Failed', err.message, 'OK');
        }
        else {
          this.showMsgModal('Connection Successful', 'The credentials entered are correct.', 'OK');
        }
        return callback(err, res);
      });
    }

  },
  watch: {
  },
  mounted() {
  },
});
