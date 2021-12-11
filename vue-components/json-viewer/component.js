const fs = require('fs');
const path = require('path');
const utils = require(`../../utils`);


// Uses this file's directory name as the component name.
const COMPONENT_NAME = path.basename(__dirname);
// Uses the HTML file that has the same name in the same directory as this file.
const TEMPLATE_PATH = path.join(__filename).replace(/\.\w+$/, '.html');

exports.component = Vue.component(COMPONENT_NAME, {
  
  template: fs.readFileSync(TEMPLATE_PATH, {encoding: 'utf-8'}),
  
  props: ['value'],

  data() {
    return {
      isOpen: false,
      maxToShow: 1000,
    };
  },

  computed: {

    typeName() {
      const {value} = this;
      if (value == null) {
        return value === null ? 'null' : 'undefined';
      }
      var t = typeof value;
      return 'object' === t
        ? Object.prototype.toString.call(value).slice(8, -1)
        : t;
    },

    closedView() {
      let {typeName, value} = this;
      if (typeName.endsWith('Array') && value.length >= 0) {
        return `${typeName} \{length = ${value.length}\}`;
      }
      if (typeName === 'Object') {
        const keyCount = Object.keys(value).length;
        return `Object \{size = ${keyCount}\}`;
      }
      if (['null', 'undefined', 'boolean', 'number', 'string'].includes(this.typeName)) {
        value = JSON.stringify(value);
        return value > 500
          ? value.slice(0, 480) + '\u2026' + value.slice(-19)
          : value;
      }
      return value;
    },

    canBeOpened() {
      return !['null', 'undefined', 'boolean', 'number', 'string'].includes(this.typeName);
    },

    propertiesToShow() {
      let {typeName, value, maxToShow} = this;
      const props = [];
      if (typeName.endsWith('Array') && value.length >= 0) {
        for (i = 0, l = value.length; i <= l && maxToShow; i++) {
          if (i in value) {
            props.push({ key: i, value: value[i] });
            maxToShow--;
          }
        }
      }
      else if (typeName === 'Object') {
        for (let [k, v] of Object.entries(value).sort((a, b) => a[0] < b[0] ? -1 : 1)) {
          props.push({ key: k, value: v });
          if (!--maxToShow) {
            break;
          }
        }
      }
      return props;
    }

  },
  
  methods: {

    open() {
      this.isOpen = true;
    },

    close() {
      this.isOpen = false;
    },

  },

  watch: {

    value: {
      handler(value) {
        this.value = value;
        this.isOpen = value == null;
      },
      immediate: true
    }

  },

  mounted() {
    console.log(this);
  },
});
