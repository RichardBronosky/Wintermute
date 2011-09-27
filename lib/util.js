// these should all be called as:
  // fun.call(some_obj, [args, ])
// why? because they *should* be Object.prototype funcs, but this breaks stuff
// occasionally.
var clone = function() {
  // perform deep copy of this
  var new_obj = (this instanceof Array) ? [] : {};
  for (var i in this) {
    if (!this.hasOwnProperty(i)) { continue; }
    if (this[i] && typeof this[i] == "object") {
      new_obj[i] = clone.call(this[i]);
    }
    else {
      new_obj[i] = this[i]
    }
  }
  return new_obj;
}

var items = function(fn) {
  // iterate over k,v pairs of object
  for (var key in this) {
    if (this.hasOwnProperty(key)) {
      fn(key, this[key]);
    }
  }
};

var update = function(obj) {
  // extend this by obj and return extended object. Totally non-destructive.
  var copy = clone.call(this);
  var obj_copy = clone.call(obj);
  items.call(obj_copy, function(k,v) { copy[k] = v; });
  return copy;
}

exports.update = update;
exports.clone = clone;
exports.items = items;

