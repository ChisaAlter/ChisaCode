/**
 * Browser shim for `node:diagnostics_channel`.
 *
 * lru-cache v11 (resolved via the pnpm catalog) calls
 * `channel("lru-cache:metrics")` and `tracingChannel("lru-cache")` at module
 * scope. Metro's builtin Node stub has no such exports, which crashes the
 * importing module during evaluation on web. Mirrors the no-op shim embedded
 * in src/terminal/webview/terminal-emulator-webview-html.ts.
 */

const channelInstance = {
  hasSubscribers: false,
  publish() {},
  subscribe() {},
  unsubscribe() {},
  bindStore() {},
  unbindStore() {},
  runStores(_context, fn, thisArg, ...args) {
    return Reflect.apply(fn, thisArg, args);
  },
};

const tracingChannelInstance = {
  hasSubscribers: false,
  start: channelInstance,
  end: channelInstance,
  asyncStart: channelInstance,
  asyncEnd: channelInstance,
  error: channelInstance,
  traceSync(fn, _context, thisArg, ...args) {
    return Reflect.apply(fn, thisArg, args);
  },
  tracePromise(fn, _context, thisArg, ...args) {
    return Promise.resolve(Reflect.apply(fn, thisArg, args));
  },
  traceCallback(fn, _position, _context, thisArg, ...args) {
    return Reflect.apply(fn, thisArg, args);
  },
};

export function channel() {
  return channelInstance;
}

export function tracingChannel() {
  return tracingChannelInstance;
}

export function hasSubscribers() {
  return false;
}

export function subscribe() {}

export function unsubscribe() {}
