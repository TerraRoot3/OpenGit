import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import TypeScriptWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

import 'monaco-editor/esm/vs/language/typescript/monaco.contribution'
import 'monaco-editor/esm/vs/language/json/monaco.contribution'
import 'monaco-editor/esm/vs/language/html/monaco.contribution'
import 'monaco-editor/esm/vs/language/css/monaco.contribution'

import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution'
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution'
import 'monaco-editor/esm/vs/basic-languages/shell/shell.contribution'
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution'
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution'
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution'
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution'
import 'monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution'
import 'monaco-editor/esm/vs/basic-languages/dart/dart.contribution'

globalThis.MonacoEnvironment = {
  getWorker (_workerId, label) {
    if (label === 'json') return new JsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    if (label === 'typescript' || label === 'javascript') return new TypeScriptWorker()
    return new EditorWorker()
  }
}

export default monaco
