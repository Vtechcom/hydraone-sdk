import { describe, it, expect } from 'vitest';
import {
  ERROR_CODES,
  HydraBridgeError,
  HydraTimeoutError,
  HydraUserRejectedError,
  HydraTransportError,
  HydraSecurityError,
  HydraAuthError,
  HydraStorageError,
} from '../../src';

describe('HydraBridgeError & Error Hierarchy', () => {
  it('should initialize HydraBridgeError with message, code, and details', () => {
    const details = { timeoutMs: 3000, requestId: 'req-123' };
    const error = new HydraBridgeError('Timeout occurred', ERROR_CODES.ERR_TIMEOUT, details);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(HydraBridgeError);
    expect(error.name).toBe('HydraBridgeError');
    expect(error.message).toBe('Timeout occurred');
    expect(error.code).toBe('ERR_TIMEOUT');
    expect(error.details).toEqual(details);
  });

  it('should correctly serialize to JSON via toJSON()', () => {
    const error = new HydraBridgeError('Something failed', 'ERR_CUSTOM', { foo: 'bar' });
    const json = error.toJSON();

    expect(json).toMatchObject({
      name: 'HydraBridgeError',
      code: 'ERR_CUSTOM',
      message: 'Something failed',
      details: { foo: 'bar' },
    });
    expect(json.stack).toBeDefined();
  });

  it('should create HydraTimeoutError with code ERR_TIMEOUT', () => {
    const error = new HydraTimeoutError('Request timed out after 15s', { timeoutMs: 15000 });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(HydraBridgeError);
    expect(error).toBeInstanceOf(HydraTimeoutError);
    expect(error.code).toBe(ERROR_CODES.ERR_TIMEOUT);
    expect(error.details).toEqual({ timeoutMs: 15000 });
  });

  it('should create HydraUserRejectedError with code ERR_USER_REJECTED', () => {
    const error = new HydraUserRejectedError('User declined to sign transaction');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(HydraBridgeError);
    expect(error).toBeInstanceOf(HydraUserRejectedError);
    expect(error.code).toBe(ERROR_CODES.ERR_USER_REJECTED);
  });

  it('should create HydraTransportError with code ERR_NOT_IN_IFRAME by default, custom code, or details as 2nd arg', () => {
    const defaultError = new HydraTransportError();
    expect(defaultError.code).toBe(ERROR_CODES.ERR_NOT_IN_IFRAME);

    // Pass details as 2nd argument
    const detailsOnlyError = new HydraTransportError('Fallback failed', { attempts: 3 });
    expect(detailsOnlyError.code).toBe(ERROR_CODES.ERR_NOT_IN_IFRAME);
    expect(detailsOnlyError.details).toEqual({ attempts: 3 });

    // Pass custom code as 2nd argument
    const customError = new HydraTransportError('Connection reset', 'ERR_TRANSPORT_DISCONNECTED', { port: 8080 });
    expect(customError.code).toBe('ERR_TRANSPORT_DISCONNECTED');
    expect(customError.details).toEqual({ port: 8080 });
    expect(customError).toBeInstanceOf(HydraBridgeError);

    // Pass empty string code -> should fallback to ERR_NOT_IN_IFRAME
    const emptyCodeError = new HydraTransportError('Empty code', '   ');
    expect(emptyCodeError.code).toBe(ERROR_CODES.ERR_NOT_IN_IFRAME);
  });

  it('should preserve explicit name property across all error subclasses', () => {
    expect(new HydraBridgeError('msg', 'CODE').name).toBe('HydraBridgeError');
    expect(new HydraTimeoutError().name).toBe('HydraTimeoutError');
    expect(new HydraUserRejectedError().name).toBe('HydraUserRejectedError');
    expect(new HydraTransportError().name).toBe('HydraTransportError');
    expect(new HydraSecurityError().name).toBe('HydraSecurityError');
    expect(new HydraAuthError().name).toBe('HydraAuthError');
    expect(new HydraStorageError().name).toBe('HydraStorageError');
  });

  it('should create HydraSecurityError with code ERR_UNTRUSTED_ORIGIN', () => {
    const error = new HydraSecurityError('Untrusted origin: evil.com', { origin: 'evil.com' });

    expect(error).toBeInstanceOf(HydraBridgeError);
    expect(error).toBeInstanceOf(HydraSecurityError);
    expect(error.code).toBe(ERROR_CODES.ERR_UNTRUSTED_ORIGIN);
    expect(error.details).toEqual({ origin: 'evil.com' });
  });

  it('should create HydraAuthError with code ERR_AUTH_EXPIRED', () => {
    const error = new HydraAuthError('JWT session has expired', { expiredAt: 1700000000 });

    expect(error).toBeInstanceOf(HydraBridgeError);
    expect(error).toBeInstanceOf(HydraAuthError);
    expect(error.code).toBe(ERROR_CODES.ERR_AUTH_EXPIRED);
  });

  it('should create HydraStorageError with code ERR_STORAGE_UNAVAILABLE', () => {
    const error = new HydraStorageError('LocalStorage access blocked by Safari ITP');

    expect(error).toBeInstanceOf(HydraBridgeError);
    expect(error).toBeInstanceOf(HydraStorageError);
    expect(error.code).toBe(ERROR_CODES.ERR_STORAGE_UNAVAILABLE);
  });
});
