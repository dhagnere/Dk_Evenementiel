// Moteur minimal pour afficher hors de Claude une maquette au format Design Component.
// Gère : DCLogic (state, setState, props), {{chemins}}, <sc-for>, <sc-if>, événements onClick / onChange.
(function () {
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var current = null;

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (patch) {
    if (typeof patch === 'function') patch = patch(this.state, this.props);
    this.state = Object.assign({}, this.state, patch);
    schedule();
  };
  window.DCLogic = DCLogic;

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    Promise.resolve().then(function () { pending = false; render(); });
  }

  function lookup(path, scope) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    var parts = path.split('.');
    var v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\{\{\s*([^}]+?)\s*\}\}$/;
  function interpolate(str, scope) {
    return str.replace(HOLE, function (_, p) { var v = lookup(p, scope); return v == null ? '' : String(v); });
  }
  function resolve(str, scope) {
    var m = WHOLE.exec(str);
    return m ? lookup(m[1], scope) : interpolate(str, scope);
  }

  function eventType(el, name) {
    var ev = name.slice(2).toLowerCase();
    if (ev === 'change') {
      var tag = el.localName;
      var type = (el.getAttribute('type') || '').toLowerCase();
      if (tag === 'textarea' || (tag === 'input' && type !== 'checkbox' && type !== 'radio' && type !== 'file')) return 'input';
    }
    return ev;
  }

  // Construit les nœuds DOM d'un nœud de l'arbre { t: tag, a: [[nom, valeur]], c: [...] } ou d'un texte.
  function build(node, scope, ns, out) {
    if (typeof node === 'string') { out.push(document.createTextNode(interpolate(node, scope))); return; }
    var i;
    if (node.t === 'sc-for') {
      var attrs = toMap(node.a);
      var list = resolve(attrs.list || '', scope) || [];
      var as = attrs.as || 'item';
      for (var k = 0; k < list.length; k++) {
        var sub = Object.create(scope);
        sub[as] = list[k];
        for (i = 0; i < node.c.length; i++) build(node.c[i], sub, ns, out);
      }
      return;
    }
    if (node.t === 'sc-if') {
      if (resolve(toMap(node.a).value || '', scope)) for (i = 0; i < node.c.length; i++) build(node.c[i], scope, ns, out);
      return;
    }
    var childNs = node.t === 'svg' ? SVG_NS : ns;
    var el = childNs ? document.createElementNS(childNs, node.t) : document.createElement(node.t);
    var handlers = {};
    var deferred = [];
    for (i = 0; i < node.a.length; i++) {
      var name = node.a[i][0], raw = node.a[i][1];
      if (name.indexOf('hint-') === 0) continue;
      if (/^on[A-Za-z]/.test(name)) { deferred.push([name, resolve(raw, scope)]); continue; }
      var v = resolve(raw, scope);
      if (name === 'value' && !childNs) { el.__value = v; if (node.t !== 'select') setAttr(el, name, v); continue; }
      if (name === 'href' && typeof v === 'string') v = v.replace(/\.dc\.html(?=$|[?#])/, '.html');
      setAttr(el, name, v);
    }
    for (i = 0; i < deferred.length; i++) if (typeof deferred[i][1] === 'function') handlers[eventType(el, deferred[i][0])] = deferred[i][1];
    el.__h = handlers;
    var kids = [];
    for (i = 0; i < node.c.length; i++) build(node.c[i], scope, childNs, kids);
    for (i = 0; i < kids.length; i++) el.appendChild(kids[i]);
    if ('__value' in el) applyValue(el, el.__value);
    out.push(el);
  }

  function toMap(pairs) { var m = {}; for (var i = 0; i < pairs.length; i++) m[pairs[i][0]] = pairs[i][1]; return m; }
  function setAttr(el, name, v) {
    if (v === false || v == null) return;
    el.setAttribute(name, v === true ? '' : String(v));
  }
  function applyValue(el, v) {
    var s = v == null ? '' : String(v);
    if (el.value !== s) el.value = s;
  }

  // Met à jour le DOM existant à partir des nœuds neufs, pour garder le focus et la saisie en cours.
  function morph(parent, fresh) {
    var old = Array.prototype.slice.call(parent.childNodes);
    var n = Math.max(old.length, fresh.length);
    for (var i = 0; i < n; i++) {
      var o = old[i], f = fresh[i];
      if (!o) parent.appendChild(f);
      else if (!f) parent.removeChild(o);
      else if (o.nodeType !== f.nodeType || o.nodeName !== f.nodeName) parent.replaceChild(f, o);
      else patch(o, f);
    }
  }
  function patch(o, f) {
    if (o.nodeType === 3) { if (o.data !== f.data) o.data = f.data; return; }
    var i, a;
    for (i = o.attributes.length - 1; i >= 0; i--) {
      a = o.attributes[i];
      if (!f.hasAttribute(a.name)) o.removeAttribute(a.name);
    }
    for (i = 0; i < f.attributes.length; i++) {
      a = f.attributes[i];
      if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
    }
    o.__h = f.__h;
    morph(o, Array.prototype.slice.call(f.childNodes));
    if ('__value' in f) applyValue(o, f.__value);
  }

  function render() {
    var vals = current.instance.renderVals();
    var scope = Object.assign({}, current.instance.props, vals);
    var out = [];
    for (var i = 0; i < current.tree.length; i++) build(current.tree[i], scope, null, out);
    morph(current.root, out);
  }

  function dispatch(e) {
    var el = e.target;
    while (el && el !== current.root) {
      var h = el.__h && el.__h[e.type];
      if (h) { h(e); return; }
      el = el.parentNode;
    }
  }

  window.DCMount = function (Component, tree, props) {
    var root = document.getElementById('dc-root');
    current = { root: root, tree: tree, instance: new Component(props) };
    ['click', 'input', 'change'].forEach(function (t) { root.addEventListener(t, dispatch); });
    render();
  };
})();
