const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadTs(file, { globals = {}, mocks = {} } = {}) {
  const absolute = path.resolve(file);
  const exports = {};
  const localRequire = request => {
    if (Object.hasOwn(mocks, request)) return mocks[request];
    if (request.startsWith('.')) {
      const base = path.resolve(path.dirname(absolute), request);
      const candidate = ['.ts', '.tsx'].map(ext => base + ext).find(fs.existsSync);
      if (candidate) return loadTs(candidate, { globals, mocks });
    }
    return require(request);
  };
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: localRequire, console, URL, URLSearchParams, TypeError, Error, ...globals });
  return exports;
}

module.exports = { loadTs };
