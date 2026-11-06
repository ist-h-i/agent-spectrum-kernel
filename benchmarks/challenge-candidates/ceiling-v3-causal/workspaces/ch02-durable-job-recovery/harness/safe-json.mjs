// Capture serialization primitives before submitted modules execute. Never invoke
// a submitted getter or inherited/own toJSON hook while observing return values.
const encode = JSON.stringify;
const descriptors = Object.getOwnPropertyDescriptors;
const keys = Reflect.ownKeys;
const prototype = Object.getPrototypeOf;
const plainPrototype = Object.prototype;
const create = Object.create;
const setPrototype = Object.setPrototypeOf;
const array = Array.isArray;
const ArrayType = Array;
const string = String;
const finite = Number.isFinite;
const ErrorType = Error;
const SeenType = WeakSet;
const has = Function.call.bind(WeakSet.prototype.has);
const remove = Function.call.bind(WeakSet.prototype.delete);
const own = Object.hasOwn;
const add = Function.call.bind(WeakSet.prototype.add);
export function safeData(value) {
  const seen = new SeenType(); let count = 0;
  function copy(item, depth) {
    if (++count > 100000 || depth > 64) throw new ErrorType('candidate observation limit');
    if (typeof item === 'bigint') return string(item);
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') return finite(item) ? item : null;
    if (typeof item !== 'object') return null;
    const isArray = array(item), proto = prototype(item);
    if (!isArray && proto !== plainPrototype && proto !== null) return null;
    if (has(seen, item)) return null;
    add(seen, item);
    const fields = descriptors(item), names = keys(fields);
    const out = isArray ? setPrototype(new ArrayType(item.length), null) : create(null);
    if (isArray && item.length > 100000) throw new ErrorType('candidate observation limit');
    for (let index = 0; index < names.length; index++) {
      const name = names[index], field = fields[name];
      if (typeof name !== 'string' || !field.enumerable) continue;
      // Accessor results are not stable data observations. Preserve their key as
      // null so wrong shapes fail behavioral assertions without running code.
      out[name] = copy(own(field, 'value') ? field.value : null, depth + 1);
    }
    remove(seen, item);
    return out;
  }
  return copy(value, 0);
}
export function safeStringify(value) { return encode(safeData(value)); }
