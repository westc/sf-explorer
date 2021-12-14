const fs = require('fs');
const path = require('path');
// const utils = require('../../utils');


// Uses this file's directory name as the component name.
const COMPONENT_NAME = path.basename(__dirname);
// Uses the HTML file that has the same name in the same directory as this file.
const TEMPLATE_PATH = path.join(__filename).replace(/\.\w+$/, '.html');

exports.component = Vue.component(COMPONENT_NAME, {
  
  template: fs.readFileSync(TEMPLATE_PATH, {encoding: 'utf-8'}),
  
  props: ['value'],

  computed: {
    hasDistinctMessage() {
      /** @type {Error} */
      const value = this.value;
      
      return !`${value?.stack}`.includes(value?.message);
    }
  },

  watch: {
    value: {
      handler(newValue) {
        console.log(newValue);
      },
      immediate: true
    }
  },
  
});
