const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const jsforce = require('jsforce');


const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const CTRL_OR_CMD_TEXT = IS_MAC ? 'CMD' : 'CTRL';
const CTRL_OR_CMD_DISPLAY = IS_MAC ? '\u2318' : 'CTRL';
const ALT_DISPLAY = IS_MAC ? '\u2325' : 'ALT';
const CTRL_DISPLAY = IS_MAC ? '\u2303' : 'CTRL';


/**
 * Generates a 36-character long universally unique identifier.
 * @returns {string}
 *   A unique hex identifer in this format
 *   `XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`.
 */
function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}


/**
 * Parses an HTML valid boolean as a regular boolean.
 * @param {*} value
 *   The value to parse as a boolean.
 * @param {T} [defaultValue]
 *   Optional, defaults to `undefined`.  The default value to return if `value`,
 *   irrespective of casing, isn't `"true"`, `"on"`, `"yes"`, `"1"`, `"false"`,
 *   `"off"`, `"no"`, or `"0"`.
 * @returns {boolean|T}
 *   Returns `true` if `value` as a case-insensitive string is `"true"`, `"on"`,
 *  `"yes"`, or `"1"`.  Returns `false` if `value` as a case-insensitive string
 *  is `"false"`, `"off"`, `"no"`, or `"0"`.  Otherwise `defaultValue` is
 *  returned.
 * @template T
 */
function parseHtmlBoolean(value, defaultValue) {
  value = `${value}`;
  return /^\s*(?:true|on|yes|1)\s*$/i.test(value)
    || (/^\s*(?:false|off|no|0|)\s*$/i.test(value) ? false : defaultValue);
}


/**
 * @param {number} queryIndex
 * @param {string} uuid
 * @param {function(Error, Object[]?, jsforce.QueryResult)} callback
 */
function executeQuery(queryIndex, uuid, callback) {
  const conn = globalThis.appSettings.connections.find(c => c.uuid === uuid);
  const { soql } = conn.queries[queryIndex];
  const jsforceConn = globalThis.jsforceConnsByUUID[uuid];
  jsforceConn.query(cleanSOQL(soql), {}, (err, res) => {
    try {
      callback(err, err ? null : normalizeResults(res), res);
    }
    catch (e) {
      console.trace(e);
    }
  });
}


/**
 * Removes SQL like comments for `soql`.
 * @param {string} soql
 *   SOQL string that needs to be cleaned.
 * @returns {string}
 *   A copy of `soql` without comments.
 */
function cleanSOQL(soql) {
  return soql.replace(
    /--.*$|\/\*[^]*?\*\/|('(?:[^']+|'')*'|"(?:[^"]+|"")*")/gm,
    (m, string) => {
      return string ?? m.replace(/./g, ' ');
    }
  );
}


/**
 * Reads from main.js to get the remote settings which has to exist there
 * because a reference to `electron` is needed.
 * @returns {import('./background').SFE_RemoteSettings}
 */
function getRemoteSettings() {
  const { returnValue, error } = ipcRenderer.sendSync('get-remote-settings');
  if (error) {
    throw error;
  }
  return returnValue;
}


/**
 * Reads the app settings from `globalThis.remoteSettings.userDataPath` on the
 * system and stores it global in `globalThis.appSettings`.  Also validates the
 * app settings before saving them.
 * @returns {SFE_AppSettings}
 */
function loadAppSettings() {
  /** @type {import('./background').SFE_RemoteSettings} */
  const remoteSettings = globalThis.remoteSettings;
  const settingsFilePath = path.join(remoteSettings.userDataPath, 'settings.json');

  /** @type {SFE_AppSettings} */
  let appSettings = fs.existsSync(settingsFilePath)
    ? JSON.parse(fs.readFileSync(settingsFilePath, {encoding: 'utf-8'}))
    : {};
    
  globalThis.appSettings = validateAppSettings(appSettings);

  return saveAppSettings();
}


/**
 * @param {SFE_AppSettings|null} appSettings
 * @returns {SFE_AppSettings}
 */
function validateAppSettings(appSettings) {
  // Make sure that this is an object.
  appSettings = Object.assign(
    {
      connections: [],
      isEncrypted: false,
    },
    Object(appSettings)
  );
  // Validate the different connection objects.
  appSettings.connections = appSettings.connections.map(validateConnection);
  return appSettings;
}


/**
 * @param {SFE_Connection} conn
 * @param {number} index
 * @returns {SFE_Connection}
 */
function validateConnection(conn, index) {
  conn = Object.assign(
    {
      uuid: uuidv4(),
      display: `Unnamed Connection #${index + 1}`,
      username: null,
      password: null,
      token: null,
      loginUrl: null,
      queries: [],
    },
    conn
  );
  conn.queries = conn.queries.map(validateConnectionQuery);
  return conn;
}


/**
 * @param {SFE_Query} connQuery
 * @param {number} index
 * @returns {SFE_Query}
 */
function validateConnectionQuery(connQuery, index) {
  return Object.assign(
    {
      name: `Unnamed Query #${index + 1}`,
      soql: '',
      js: '',
      isOpen: true,
      isJSOpen: false,
      uuid: uuidv4(),
    },
    connQuery
  );
}


/**
 * Saves `globalThis.appSettings` to `globalThis.remoteSettings.userDataPath`.
 * @returns {SFE_AppSettings}
 *   Returns `appSettings`.
 */
function saveAppSettings() {
  /** @type {import('./background').SFE_RemoteSettings} */
  const remoteSettings = globalThis.remoteSettings;
  /** @type {SFE_AppSettings} */
  const appSettings = globalThis.appSettings;
  const settingsFilePath = path.join(remoteSettings.userDataPath, 'settings.json');
  fs.writeFileSync(settingsFilePath, JSON.stringify(appSettings), {encoding: 'utf-8'});
  return appSettings;
}


/**
 * Loads all app settings from the system, upserts the specified connection
 * based on its `uuid` and then saves the app settings back to the system.
 * @param {SFE_Connection} connection
 * @returns {SFE_AppSettings}
 */
function saveConnection(connection) {
  return saveConnections([connection]);
}


/**
 * Loads all app settings from the system, loops through all specified
 * connections upserting them based on their `uuid` and then saves the app
 * settings back to the system.
 * @param {SFE_Connection[]} connections
 * @returns {SFE_AppSettings}
 */
function saveConnections(connections) {
  const appSettings = globalThis.appSettings = loadAppSettings();
  for (const connection of connections) {
    let index = appSettings.connections.findIndex(c => c.uuid === connection.uuid);
    if (index < 0) {
      index = appSettings.connections.length;
    }
    appSettings.connections[index] = connection;
  }
  return saveAppSettings();
}


/**
 * 
 * @param {SFE_Connection} connection 
 * @param {boolean} isTest
 *   Indicates if the connection is just to be tested and then immediately
 *   closed.
 * @param {function(Error, jsforce.UserInfo)} callback
 */
function login(connection, isTest, callback) {
  const {username, password, token, loginUrl, uuid} = connection;
  const {jsforceConnsByUUID} = globalThis;
  if (uuid in jsforceConnsByUUID) {
    logout(connection, (err, res) => {
      login(connection, isTest, callback);
    });
  }
  else {
    const jsforceConn = new jsforce.Connection({ loginUrl });
    jsforceConn.login(
      username,
      // Concatenated string with an array to force token to be a string even if
      // is null:  'Hello' + [null] === 'Hello'
      password + [token],
      (err, res) => {
        if (!err && !isTest) {
          globalThis.jsforceConnsByUUID[uuid] = jsforceConn;
        }
        callback(err, res);
      }
    );
  }
}


/**
 * 
 * @param {SFE_Connection} connection 
 * @param {function(Error, undefined)} callback 
 */
function logout(connection, callback) {
  const {jsforceConnsByUUID} = globalThis;
  const {uuid} = connection;
  if (uuid in jsforceConnsByUUID) {
    jsforceConnsByUUID[uuid].logout(callback);
    delete jsforceConnsByUUID[uuid];
  }
  else {
    callback();
  }
}


/**
 * 
 * @param {SFE_Connection} conn
 *   The active connection used to pull the Bulk API job details.
 * @param {function(GetBulkApiJobs__JobInfo[])} callback
 */
 function getBulkApiJobs(conn, callback) {
  const jsforceConn = jsforceConnsByUUID[conn.uuid];
  const allRecords = [];
  function recurse(url) {
    const xhr = new XMLHttpRequest();
    xhr.withCredentials = true;
    xhr.addEventListener("readystatechange", function() {
      if (this.readyState === 4) {
        const {nextRecordsUrl, records} = JSON.parse(this.responseText);
        allRecords.push.apply(allRecords, records);
        if (nextRecordsUrl) {
          recurse(nextRecordsUrl);
        }
        else {
          callback(allRecords);
        }
      }
    });
    xhr.open("GET", jsforceConn.instanceUrl + url);
    xhr.setRequestHeader("Authorization", `Bearer ${jsforceConn.accessToken}`);
    xhr.send();
  }
  recurse(`/services/data/v${jsforceConn.version}/jobs/ingest`);
}


/**
 * 
 * @param {SFE_Connection} conn
 *   The active connection used to do a global describe.
 * @param {function(Error, jsforce.DescribeGlobalResult)} callback
 */
function describeAll(conn, callback) {
  const jsforceConn = jsforceConnsByUUID[conn.uuid];
  jsforceConn.describeGlobal(callback);
}


/**
 * @param {{totalSize: number, done: boolean, records: Object[]}} results 
 * @returns {Object[]}
 */
function normalizeResults(results) {
  return results.records.map(record => {
    const normalRecord = {};
    const pairs = Object.entries(record).map(([key, value]) => ({path: [key], value}));
    for (let pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
      let {path, value} = pairs[pairIndex];
      if (value?.records) {
        normalRecord[path.join('.')] = normalizeResults(value);
      }
      else if (value?.attributes) {
        for (let [subKey, subValue] of Object.entries(value)) {
          if (subKey !== 'attributes') {
            pairs.push({path: path.concat([subKey]), value: subValue});
          }
        }
      }
      else if (path.at(-1) !== 'attributes') {
        normalRecord[path.join('.')] = value;
      }
    }
    return normalRecord;
  });
}


/**
 * @see {@link https://developer.salesforce.com/docs/atlas.en-us.api_asynch.meta/api_asynch/get_all_jobs.htm}
 * @typedef {Object} GetBulkApiJobs__JobInfo
 * @property {string} apiVersion
 *   The API version that the job was created in.
 * @property {("BACKQUOTE"|"CARET"|"COMMA"|"PIPE"|"SEMICOLON"|"TAB")=} columnDelimiter
 *   The column delimiter used for CSV job data.
 * @property {string=} concurrencyMode
 *   For future use. How the request was processed. Currently only parallel mode
 *   is supported. (When other modes are added, the mode will be chosen
 *   automatically by the API and will not be user configurable.)
 * @property {string=} contentType
 *   The format of the data being processed. Only CSV is supported.
 * @property {string=} contentUrl
 *   The URL to use for Upload Job Data requests for this job. Only valid if the
 *   job is in Open state.
 * @property {string=} createdById
 *   The ID of the user who created the job. Create the batch with the same
 *   user.
 * @property {string=} createdDate
 *   The date and time in the UTC time zone when the job was created.
 * @property {string=} id
 *   Unique ID for this job.
 * @property {"BigObjectIngest"|"Classic"|"V2Ingest"} jobType
 *   The job’s type.
 * @property {("LF"|"CRLF")=} lineEnding
 *   The line ending used for CSV job data.
 * @property {string=} object
 *   The object type for the data being processed.
 * @property {"insert"|"delete"|"hardDelete"|"update"|"upsert"} operation
 *   The processing operation for the job.
 * @property {"Open"|"UploadComplete"|"Aborted"|"JobComplete"|"Failed"|"Closed"} state
 *   The current state of processing for the job.
 * @property {systemModstamp=} systemModstamp
 *   Date and time in the UTC time zone when the job finished.
 */

/**
 * @typedef {Object} SFE_Query
 * @property {string} name
 * @property {string} soql
 * @property {string} js
 * @property {boolean} isOpen
 * @property {boolean} isJSOpen
 */

/**
 * @typedef {Object} SFE_Connection
 * @property {string} uuid
 * @property {string} display
 * @property {string} username
 * @property {string} password
 * @property {string} token
 * @property {string} loginUrl
 * @property {SFE_Query[]} queries
 */

/**
 * @typedef {Object} SFE_AppSettings
 * @property {SFE_Connection[]} connections
 * @property {boolean} isEncrypted
 */

module.exports = {
  uuidv4,
  parseHtmlBoolean,
  saveAppSettings,
  saveConnection,
  saveConnections,
  executeQuery,
  cleanSOQL,
  validateAppSettings,
  validateConnection,
  validateConnectionQuery,
  loadAppSettings,
  getRemoteSettings,
  login,
  logout,
  getBulkApiJobs,
  normalizeResults,
  describeAll,
  IS_MAC,
  IS_WIN,
  CTRL_OR_CMD_DISPLAY,
  CTRL_DISPLAY,
  ALT_DISPLAY,
  CTRL_OR_CMD_TEXT,
};
