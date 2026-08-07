// 최소 DOM 스텁 — genModify/genAlter의 순수 생성 로직만 구동
const fs = require('fs'), vm = require('vm');

function makeEl(id, opts = {}) {
  return { id, type: opts.type || 'text', tagName: opts.tagName || 'INPUT',
           value: opts.value ?? '', checked: opts.checked ?? false,
           dataset: {}, name: opts.name || '',
           addEventListener(){}, closest(){ return { remove(){} }; },
           querySelectorAll(){ return []; }, appendChild(){}, set innerHTML(v){}, get innerHTML(){return '';} };
}

function buildCtx(els) {
  const reg = new Map(Object.entries(els));
  // reg는 호출자가 이후에도 요소를 추가할 수 있도록 그대로 반환한다.
  const out = { value: null };
  const doc = {
    getElementById: id => reg.get(id) || null,
    querySelector: () => ({ id: 'col-mod' }),
    querySelectorAll: () => [],
    createElement: () => makeEl('tmp'),
  };
  const ctx = {
    document: doc, console,
    UI: { showValidation: e => { out.errors = e; }, clearValidation(){}, renderFields(){}, initSectionToggles(){} },
    __out: out,
  };
  vm.createContext(ctx);
  for (const f of ['js/codes.js','js/utils.js']) vm.runInContext(fs.readFileSync(f,'utf8'), ctx);
  vm.runInContext("this.Utils = Utils; this.CODES = CODES;", ctx);
  ctx.Utils.setOutput = (_id, sql) => { out.sql = sql; };
  ctx.Utils.toast = () => {};
  return { ctx, out, reg };
}
module.exports = { makeEl, buildCtx, vm, fs };
