const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');
const utils = require(`../../utils`);

const {require: requireMonaco} = require('monaco-editor/min/vs/loader');
requireMonaco.config({ paths: { vs: 'node_modules/monaco-editor/min/vs' } });

/** @type import('monaco-editor') */
let monaco;
  
requireMonaco(['vs/editor/editor.main'], localMonaco => {
  monaco = localMonaco;
});

// Uses this file's directory name as the component name.
const COMPONENT_NAME = path.basename(__dirname);
// Uses the HTML file that has the same name in the same directory as this file.
const TEMPLATE_PATH = path.join(__filename).replace(/\.\w+$/, '.html');

exports.component = Vue.component(COMPONENT_NAME, {
  
  template: fs.readFileSync(TEMPLATE_PATH, {encoding: 'utf-8'}),
  
  props: ['value', 'language', 'minimap', 'lineNumbers', 'foldable'],

  data() {
    return {
      _editor: null,
      skipNextValueChange: false,
    };
  },

  computed: {
  },
  
  methods: {
  },

  watch: {

    value(value) {
      if (!this.skipNextValueChange) {
        /** @type {import('monaco-editor').editor.IStandaloneCodeEditor} */
        let editor = this._editor;
        editor.setValue(value);
      }
      this.skipNextValueChange = false;
    },

    language(language) {
      /** @type {import('monaco-editor').editor.IStandaloneCodeEditor} */
      let editor = this._editor;
      monaco.editor.setModelLanguage(editor.getModel(), language);
    },

    lineNumbers(lineNumbers) {
      /** @type {import('monaco-editor').editor.IStandaloneCodeEditor} */
      let editor = this._editor;
      editor.updateOptions({
        lineNumbers: utils.parseHtmlBoolean(lineNumbers, false) ? 'on' : 'off'
      });
    },

    foldable(foldable) {
      /** @type {import('monaco-editor').editor.IStandaloneCodeEditor} */
      let editor = this._editor;
      editor.updateOptions({
        folding: utils.parseHtmlBoolean(foldable, false)
      });
    },

    minimap(minimap) {
      /** @type {import('monaco-editor').editor.IStandaloneCodeEditor} */
      let editor = this._editor;
      editor.updateOptions({
        minimap: { enabled: utils.parseHtmlBoolean(minimap, false) }
      });
    },

  },

  mounted() {
    const setupInterval = setInterval(() => {
      // Keep polling until monaco is defined.
      if (!monaco) return;

      // Once monaco is found stop polling.
      clearInterval(setupInterval);

      monaco.languages.typescript.javascriptDefaults.setExtraLibs([{
        content: fs.readFileSync(
          path.join(__filename).replace(/\.\w+$/, '.javascript-defaults.js'),
          {encoding: 'utf-8'}
        )
      }]);

      // Setup the editor.
      let lineNumbers = utils.parseHtmlBoolean(this.lineNumbers, false);
      let editor = this._editor = monaco.editor.create(this.$refs.container, {
        value: this.value,
        language: this.language,
        minimap: { enabled: utils.parseHtmlBoolean(this.minimap, false) },
        lineNumbers: lineNumbers ? 'on' : 'off',
        folding: utils.parseHtmlBoolean(this.foldable, false),
        // Undocumented see https://github.com/Microsoft/vscode/issues/30795#issuecomment-410998882
        lineDecorationsWidth: lineNumbers ? 10 : 0,
        lineNumbersMinChars: lineNumbers ? 5 : 0,
        automaticLayout: true, // Auto resize
      });

      // Add an event so that if the user types, the value will be sent back via
      // the input event.  This enables v-model for this component.
      editor.getModel().onDidChangeContent(e => {
        this.$emit('input', editor.getValue());
        this.skipNextValueChange = true;
      });

      // Register any key binding attributes.  Eg.
      // <monaco-editor
      //   language="sql"
      //   line-numbers="yes"
      //   foldable="yes"
      //   ctm-order-cmd-execute="0"
      //   ctm-group-cmd-execute="operation"
      //   label-cmd-execute="Execute Query"
      //   bind-cmd-execute="KeyMod.CtrlCmd + KeyCode.Enter"
      //   v-on:run-cmd-execute="log('execute...')"
      // />
      /** @type {{[k: string]: import('monaco-editor').editor.IActionDescriptor}} */
      const actionsById = {};
      const RGX_KEY_COMBO = /(?:^|[\s\+,\|])(KeyMod|KeyCode)\.(\w+)(?:[\s\+,\|]|$)/g;
      for (let [attrName, attrValue] of Object.entries(this.$attrs)) {
        const mName = /^(?<defType>bind|label|ctm-order|ctm-group)-cmd-(?<id>.+)$/.exec(attrName);
        if (mName) {
          const {defType, id} = mName.groups;

          if (defType === 'label') {
            attrName = 'label';
          }
          else if (defType === 'ctm-order') {
            attrName = 'contextMenuOrder';
            attrValue = +attrValue;
          }
          else if (defType === 'ctm-group') {
            attrName = 'contextMenuGroupId';
          }
          else {
            attrName = 'keybindings';
            let mKeyCombo, keyBinding = 0;
            while(mKeyCombo = RGX_KEY_COMBO.exec(attrValue)) {
              keyBinding |= monaco[mKeyCombo[1]][mKeyCombo[2]];
            }
            attrValue = [keyBinding];
          }
          actionsById[id] = Object.assign(
            {
              id,
              [attrName]: attrValue,
              run: e => this.$emit(`run-cmd-${id}`, e),
            },
            actionsById[id]
          );
        }
      }
      for (let action of Object.values(actionsById)) {
        editor.addAction(action);
      }
    }, 99);
  },

  beforeDestroy() {
    /** @type {import('monaco-editor').editor.IStandaloneCodeEditor} */
    const editor = this._editor;
    editor.dispose();
  },
});
