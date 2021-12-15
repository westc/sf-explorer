const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const jsforce = require('jsforce');


const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;


const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const CTRL_OR_CMD_TEXT = IS_MAC ? 'CMD' : 'CTRL';
const CTRL_OR_CMD_DISPLAY = IS_MAC ? '\u2318' : 'CTRL';
const ALT_DISPLAY = IS_MAC ? '\u2325' : 'ALT';
const CTRL_DISPLAY = IS_MAC ? '\u2303' : 'CTRL';


/**
 * A tag function which can be used to create verbose regular expressions.
 * @license Copyright 2021 - Chris West - MIT Licensed
 * @see https://gist.github.com/westc/dc1b74018d278147e05cac3018acd8e5
 */
function vRegExp(input, ...fillins) {
  let {raw} = input;
  let content = raw[0];
  for (let i = 1, l = raw.length; i < l; i++) {
    content += fillins[i - 1] + raw[i];
  }
  content = content.replace(/^(\\[^])|\s+|\/\/.*|\/\*[^]*?\*\//g, '$1');
  return new RegExp(
    content.replace(/^(?:\(\?\w+\))+/g, ''),
    content.replace(/\(\?(\w+)\)|[^(]+|\(/g, '$1')
  );
}


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
 * @param {SFE_Connection} conn
 * @param {SFE_QueryResult[]} queryResults
 * @param {number} queryIndex
 * @param {(err: null|Error, records: Object[]|null) => any} callback
 */
function executeQuery(conn, queryResults, queryIndex, callback) {
  doCompoundQuery(conn, initQueryStores(conn, queryResults), queryIndex, callback);
}


/**
 * 
 * @param {SFE_Connection} conn
 * @param {SFE_QueryResultStore[]} stores
 * @param {number} queryIndex
 * @param {(err: null|Error, records: Object[]|null) => any} callback
 */
function doCompoundQuery(conn, stores, queryIndex, callback) {
  try {
    const store = stores[queryIndex];

    if (store.isUpToDate) {
      callback(store.error, store.records);
    }
    else if (store.isInProgress) {
      callback(new Error('Recursive queries are not allowed.'), null);
    }
    else {
      store.isInProgress = true;

      function finish(soql) {
        const jsforceConn = jsforceConnsByUUID[conn.uuid];
        cleanSOQL(jsforceConn, soql, (err, soql) => {
          if (err) {
            callback(err, null);
          }
          else {
            jsforceConn.query(soql, {}, (err, res) => {
              store.isInProgress = false;
              store.error = err;
              store.isUpToDate = true;
              store.records = err ? null : normalizeResults(res);
              callback(store.error, store.records);
            });
          }
        });
      }
      
      const soql = store.soql;
      const varsToEval = getSOQLVars(soql);
      const varNames = Array.from(new Set(varsToEval.map(v => v.name)));
      if (varNames.length) {
        (new AsyncFunction(
          'getQueryResults',
          store.js
            + '\nreturn {'
            + varNames.map(v => `${v}: 'function' === typeof ${v} ? await ${v}() : ${v}`).join(', ')
            + '}'
        ))(getQueryResultsGetter(conn, stores))
          .then(varValues => {
            finish(fillSOQLVars(soql, varsToEval, varValues));
          })
          .catch(err => callback(err, null));
      }
      else {
        finish(soql);
      }
    }
  }
  catch (e) {
    callback(e, null);
  }
}


/**
 * Expands the given SOQL and cleans it so that it can be passed directly to
 * Salesforce.
 * @param {jsforce.Connection} jsforceConn
 * @param {string} soql
 * @param {(err: null|Error, soql: string|null) => any} callback
 */
function cleanSOQL(jsforceConn, soql, callback) {
  /** @type {({start: number, sobject: string, end: number})[]} */
  const stars = [];

  // Capture all of the asterisks and the preceding sobject names for later use.
  soql = soql.replace(
    vRegExp`
      (?g)(?i)                     // Global flag
      ('(?:[^\\']+|\\.)*')         // Capture Group: string
      |
      (?:(\w+)\s*\.\s*\*)          // Capture Group: starObject
      |
      --[^\r\n]+                   // Single-line comment
      |
      /\*[^]*?\*/                  // Multiline comment  
    `,
    function(m, string, starObject, position) {
      if (starObject) {
        stars.push({
          start: position,
          end: position + m.length,
          sobject: starObject
        });
      }
      else if (!string) {
        return m.replace(/[^\r\n]+/g, c => ' '.repeat(c.length));
      }
      return m;
    }
  );

  // Remove extra whitespace (some of which can come from removed comments).
  soql = soql.replace(
    vRegExp`
      (?g)
      '(?:[^\\']+|\\.)*' // String
      |
      (\s+)              // Capture Group: whitespaces
    `,
    (m, whitespaces) => whitespaces ? ' ' : m
  ).trim();

  /**
   * Acts as a cache keeping track of the Salesforce descriptions for objects
   * that were already pulled during this request.
   * @type {{[k: string]: jsforce.DescribeSObjectResult}}
   */
  const descriptions = {};

  /**
   * Expands all of the asterisks from the end of `soql` back to the beginning.
   */
  function expandFromEnd() {
    let star = stars.pop();
    if (star) {
      const sobjectUpper = star.sobject.toUpperCase();
      let description = descriptions[sobjectUpper];
      if (description) {
        soql = soql.slice(0, star.start)
          + description.fields.map(x => `${star.sobject}.${x.name}`).join(',')
          + soql.slice(star.end);
        expandFromEnd();
      }
      else {
        jsforceConn.describe(sobjectUpper, (err, result) => {
          if (err) {
            callback(err, null);
          }
          else {
            descriptions[sobjectUpper] = result;
            stars.push(star);
            expandFromEnd();
          }
        });
      }
    }
    else {
      callback(null, soql);
    }
  }

  // Starts expanding `soql` from the end back to the beginning.
  expandFromEnd();
}


/**
 * @param {string} soql
 * @param {CapturedSOQLVar[]} orderedVarsToFill
 * @param {Object} varValues
 * @returns {string}
 */
function fillSOQLVars(soql, orderedVarsToFill, varValues) {
  for (let capturedVar of orderedVarsToFill.slice().reverse()) {
    soql = soql.slice(0, capturedVar.start)
      + quoteSOQL(varValues[capturedVar.name])
      + soql.slice(capturedVar.end);
  }
  return soql;
}


/**
 * @param {SFE_Connection} conn
 * @param {SFE_QueryResultStore[]} stores
 */
function getQueryResultsGetter(conn, stores) {
  return async function(queryName, useNewestResults) {
    return new Promise((resolve, reject) => {
      const innerQueryIndex = stores.findIndex(s => s.name === queryName);
      const innerStore = stores[innerQueryIndex];
      if (!useNewestResults && innerStore?.records?.length) {
        resolve(innerStore.records);
      }
      else {
        doCompoundQuery(conn, stores, innerQueryIndex, (err, records) => {
          if (err) {
            reject(err);
          }
          else {
            resolve(records);
          }
        });
      }
    });
  };
}


/**
 * 
 * @param {string} soql
 * @returns {CapturedSOQLVar[]}
 */
function getSOQLVars(soql) {
  const returnValue = [];
  const rgx = /\[(\w+)\]|'(?:[^'\\]+|\\.)*'|--[^\n\r]*|\/\*[^]*?\*\//g;
  for (const arrMatch of soql.matchAll(rgx)) {
    const name = arrMatch[1];
    if (name) {
      returnValue.push({
        name,
        start: arrMatch.index,
        end: arrMatch.index + arrMatch[0].length,
        soql
      });
    }
  }
  return returnValue;
}


/**
 * @typedef {Object} CapturedSOQLVar
 * @property {string} name
 * @property {number} start
 * @property {number} end
 * @property {string} soql
 */


/**
 * Gets the query stores that will be used to execute a compound query.
 * @param {SFE_Connection} conn
 * @param {SFE_QueryResult[]} queryResults
 * @returns {SFE_QueryResultStore[]}
 *   The query stores that will be used to execute a compount query.
 */
function initQueryStores(conn, queryResults) {
  return conn.queries.map((q, i) => {
    return Object.assign({isUpToDate: false}, queryResults[i], q);
  });
}


/**
 * @param {*} value
 * @returns {string}
 */
function quoteSOQL(value) {
  if (Array.isArray(value)) {
    return '(' + value.map(quoteSOQL).join(',') + ')';
  }
  if ('string' === typeof value) {
    return "'" + JSON.stringify(value).slice(1, -1).replace(/'/g, "\\'") + "'";
  }
  if (value instanceof Date) {
    return value.toJSON().slice(0, -5) + 'Z';
  }
  return JSON.stringify(value);
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


function toggleDevTools() {
  ipcRenderer.send('toggle-dev-tools');
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
      colDefs: [],
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
  const jsforceConn = globalThis.jsforceConnsByUUID[conn.uuid];
  jsforceConn.describeGlobal(callback);
}


/**
 * 
 * @param {SFE_Connection} conn
 *   The active connection used to do a global describe.
 * @param {string} type
 * @param {function(Error, jsforce.DescribeSObjectResult)} callback
 */
function describe(conn, type, callback) {
  const jsforceConn = globalThis.jsforceConnsByUUID[conn.uuid];
  jsforceConn.describe(type, callback);
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
 * @typedef {Object} SFE_QueryResult
 * @property {Error} error
 * @property {jsforce.QueryResult} records
 */

/**
 * @typedef {Object} SFE_Query
 * @property {string} name
 * @property {string} soql
 * @property {string} js
 * @property {boolean} isOpen
 * @property {boolean} isJSOpen
 * @property {string} uuid
 * @property {import('./vue-components/ag-grid/component').PersistentColDef[]} colDefs
 */

/**
 * @typedef {(
 *   {
 *     isUpToDate: boolean,
 *     isInProgress: boolean
 *   }
 *   & SFE_QueryResult
 *   & SFE_Query
 * )} SFE_QueryResultStore
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
  describe,
  toggleDevTools,
  vRegExp,
  IS_MAC,
  IS_WIN,
  CTRL_OR_CMD_DISPLAY,
  CTRL_DISPLAY,
  ALT_DISPLAY,
  CTRL_OR_CMD_TEXT,
};
