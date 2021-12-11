const fs = require('fs');
const path = require('path');
const { parseHtmlBoolean } = require('../../utils');

const bsModals = [];

// Uses this file's directory name as the component name.
const COMPONENT_NAME = path.basename(__dirname);
// Uses the HTML file that has the same name in the same directory as this file.
const TEMPLATE_PATH = path.join(__filename).replace(/\.\w+$/, '.html');

exports.component = Vue.component(COMPONENT_NAME, {
  
  template: fs.readFileSync(TEMPLATE_PATH, {encoding: 'utf-8'}),
  
  props: ['title', 'buttons', 'buttonsDelimiter', 'show', 'size'],
  data() {
    return {
      bsModalIndex: null,
    };
  },
  computed: {
    buttonObjects() {
      const {buttons} = this;
      if ('string' === typeof buttons) {
        return buttons.split(this.buttonsDelimiter ?? ',').map((b, index) => ({
          text: b.trim(),
          value: b.trim(),
          index,
          disabled: false
        }));
      }
      if (Array.isArray(buttons)) {
        return buttons.map((b, index) => Object.assign(b, {index}));
      }
      return [];
    },
    showFooter() {
      return this.buttonObjects.length > 0;
    }
  },
  watch: {
    show(show) {
      bsModals[this.bsModalIndex][parseHtmlBoolean(show) ? 'show' : 'hide']();
    }
  },
  mounted() {
    const bsModal = new bootstrap.Modal(this.$refs.modal, {backdrop: false});
    this.bsModalIndex = bsModals.push(bsModal) - 1;
    if (parseHtmlBoolean(this.show)) {
      bsModal.show();
    }
  },
  beforeDestroy() {
    delete bsModals[this.bsModalIndex];
  },
});
