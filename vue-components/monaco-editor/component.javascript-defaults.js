/**
 * Gets the query results from another query as an array of objects.
 * @param {string} queryName
 *   The name of the query to pull from.
 * @param {boolean} [useNewestResults=false]
 *   Defaults to `false`.  If `false` and results are already available for this
 *   query, those results will be used, in all other cases the referenced query
 *   will be executed to retrieve the newest results.
 * @returns {Promise<Object[]>} 
 *   If `false` and results are already available for this query, those results
 *   will be returned, in all other cases the referenced query will be executed
 *   to retrieve the newest results that will be returned.
 */
async function getQueryResults(queryName, useNewestResults) {}
