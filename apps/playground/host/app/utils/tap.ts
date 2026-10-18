import type { BridgeMessage } from '@hydraone-sdk/core';

type Listener = (event: MessageEvent) => void;

/**
 * Window stand-in for `createHost({ window })` that reports every message the host posts back
 * (events, HOST_ACK, RPC responses) without changing the SDK. Incoming events are re-dispatched with
 * `source` swapped for a wrapper whose `postMessage` calls `onPost` before forwarding to the iframe.
 * The host only reads `postMessage`, `closed` and `parent` from a source window.
 */
export function tapHostWindow(
  real: Window,
  onPost: (message: BridgeMessage, origin: string) => void,
): Window {
  // One wrapper per iframe window, so the host's registry (keyed by window) stays stable.
  const sources = new WeakMap<Window, Window>();
  const listeners = new Map<Listener, Listener>();

  const tapped = {
    location: real.location,
    addEventListener(type: string, listener: Listener) {
      const wrapped: Listener = (event) =>
        listener({
          data: event.data,
          origin: event.origin,
          source: wrap(event.source as Window | null),
        } as MessageEvent);
      listeners.set(listener, wrapped);
      real.addEventListener(type as 'message', wrapped);
    },
    removeEventListener(type: string, listener: Listener) {
      const wrapped = listeners.get(listener);
      if (!wrapped) return;
      listeners.delete(listener);
      real.removeEventListener(type as 'message', wrapped);
    },
  } as unknown as Window;

  function wrap(source: Window | null): Window | null {
    if (!source) return null;
    let wrapper = sources.get(source);
    if (!wrapper) {
      wrapper = {
        get closed() {
          return source.closed;
        },
        // The host checks `source.parent === window`; answer with the tapped window for direct children.
        get parent() {
          return source.parent === real ? tapped : source.parent;
        },
        postMessage(message: BridgeMessage, origin: string) {
          source.postMessage(message, origin);
          onPost(message, origin);
        },
      } as unknown as Window;
      sources.set(source, wrapper);
    }
    return wrapper;
  }

  return tapped;
}
