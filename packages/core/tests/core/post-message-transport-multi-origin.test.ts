import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PostMessageTransport, type MessageEventSource, type PostMessageTarget } from '../../src';

const PROD = 'https://alpha.hydraone.app';
const STAGING = 'https://staging.hydraone.app';

class MockTargetWindow implements PostMessageTarget {
  public sentMessages: Array<{ message: unknown; targetOrigin: string }> = [];
  postMessage(message: unknown, targetOrigin: string): void {
    this.sentMessages.push({ message, targetOrigin });
  }
}

class MockSourceWindow implements MessageEventSource {
  public parent: unknown;
  constructor(parent?: unknown) {
    this.parent = parent ?? this;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

function hostEvent(origin: string, source: unknown, id = 'h-1') {
  return {
    origin,
    source,
    data: { id, type: 'HOST_ACK', source: 'hydra-host', timestamp: Date.now() },
  };
}

describe('PostMessageTransport with several origins', () => {
  let target: MockTargetWindow;
  let parent: object;
  let sourceWindow: MockSourceWindow;

  const make = (origins: string | string[]) =>
    new PostMessageTransport({
      appCenterOrigin: origins,
      targetWindow: target,
      sourceWindow,
      checkIframeSource: false,
    });

  beforeEach(() => {
    target = new MockTargetWindow();
    parent = { name: 'host' };
    sourceWindow = new MockSourceWindow(parent);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps a single string origin working as before', () => {
    const transport = make(PROD);

    expect(transport.appCenterOrigin).toBe(PROD);
    expect(transport.allowedOrigins).toEqual([PROD]);
  });

  it('normalizes, trims and de-duplicates the list', () => {
    const transport = make([`${PROD}/`, ` ${STAGING} `, PROD]);

    expect(transport.allowedOrigins).toEqual([PROD, STAGING]);
    expect(transport.appCenterOrigin).toBe(PROD);
  });

  it('rejects an empty list and a list with a blank entry', () => {
    expect(() => make([])).toThrow('appCenterOrigin must be provided');
    expect(() => make([PROD, '  '])).toThrow('appCenterOrigin must be provided');
  });

  it('accepts messages from every listed origin', () => {
    const transport = make([PROD, STAGING]);
    const handler = vi.fn();
    transport.onMessage(handler);

    transport.handleMessageEvent(hostEvent(PROD, parent, 'a'));
    transport.handleMessageEvent(hostEvent(STAGING, parent, 'b'));

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('drops messages from an origin that is not listed', () => {
    const transport = make([PROD, STAGING]);
    const handler = vi.fn();
    transport.onMessage(handler);

    transport.handleMessageEvent(hostEvent('https://attacker.site', parent));

    expect(handler).not.toHaveBeenCalled();
  });

  it('collapses to a wildcard when "*" is in the list', () => {
    const transport = new PostMessageTransport({
      appCenterOrigin: [PROD, '*'],
      env: 'development',
      targetWindow: target,
      sourceWindow,
      checkIframeSource: false,
    });

    expect(transport.allowedOrigins).toEqual(['*']);
  });

  it('replies to the origin of the last accepted message', async () => {
    const transport = make([PROD, STAGING]);
    transport.onMessage(() => {});

    transport.handleMessageEvent(hostEvent(STAGING, parent));
    await transport.send({
      id: 'out-1',
      type: 'PING',
      source: 'hydra-client',
      timestamp: Date.now(),
    } as never);

    expect(target.sentMessages.map((m) => m.targetOrigin)).toEqual([STAGING]);
  });

  it('posts to each listed origin before the host has been heard from', async () => {
    const transport = make([PROD, STAGING]);

    await transport.send({
      id: 'out-2',
      type: 'CLIENT_READY',
      source: 'hydra-client',
      timestamp: Date.now(),
    } as never);

    expect(target.sentMessages.map((m) => m.targetOrigin)).toEqual([PROD, STAGING]);
  });

  it('never posts to an origin outside the list', async () => {
    const transport = make([PROD, STAGING]);

    transport.handleMessageEvent(hostEvent('https://attacker.site', parent));
    await transport.send({
      id: 'out-3',
      type: 'PING',
      source: 'hydra-client',
      timestamp: Date.now(),
    } as never);

    const origins = target.sentMessages.map((m) => m.targetOrigin);
    expect(origins).not.toContain('https://attacker.site');
  });
});
