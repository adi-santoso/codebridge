import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { JsonRpcChannel } from '../../src/claude/json-rpc.js';
import { EventEmitter } from 'events';
import { Writable, Readable } from 'stream';

describe('JsonRpcChannel', () => {
  let rpc;

  before(() => {
    rpc = new JsonRpcChannel();
  });

  after(() => {
    rpc.cleanup();
  });

  describe('sendRequest', () => {
    it('should format JSON-RPC request correctly', async () => {
      const stdin = new Writable({
        write(chunk, encoding, callback) {
          const line = chunk.toString();
          const message = JSON.parse(line);

          assert.strictEqual(message.jsonrpc, '2.0');
          assert.strictEqual(message.method, 'test');
          assert.ok(message.id > 0);
          assert.deepStrictEqual(message.params, { foo: 'bar' });

          callback();
        }
      });

      // Don't wait for response (no stdout to respond)
      const promise = rpc.sendRequest(stdin, 'test', { foo: 'bar' }, 100);

      // Should timeout since no response
      await assert.rejects(promise, /timed out/);
    });

    it('should reject if stdin is null', async () => {
      await assert.rejects(
        rpc.sendRequest(null, 'test'),
        /stdin is null or destroyed/
      );
    });
  });

  describe('processData', () => {
    it('should parse complete JSON line', () => {
      let notificationReceived = false;

      rpc.once('notification', ({ method, params }) => {
        assert.strictEqual(method, 'test/notification');
        assert.deepStrictEqual(params, { data: 'hello' });
        notificationReceived = true;
      });

      const message = {
        jsonrpc: '2.0',
        method: 'test/notification',
        params: { data: 'hello' }
      };

      rpc.processData(JSON.stringify(message) + '\n');
      assert.ok(notificationReceived);
    });

    it('should handle partial lines', () => {
      let notificationReceived = false;

      rpc.once('notification', ({ method }) => {
        assert.strictEqual(method, 'test/partial');
        notificationReceived = true;
      });

      const message = JSON.stringify({
        jsonrpc: '2.0',
        method: 'test/partial',
        params: {}
      });

      // Send in two chunks
      rpc.processData(message.slice(0, 20));
      assert.ok(!notificationReceived); // Should not parse yet

      rpc.processData(message.slice(20) + '\n');
      assert.ok(notificationReceived); // Now should parse
    });

    it('should handle multiple JSON lines in one chunk', () => {
      let count = 0;

      rpc.on('notification', () => {
        count++;
      });

      const message1 = JSON.stringify({ jsonrpc: '2.0', method: 'test1', params: {} });
      const message2 = JSON.stringify({ jsonrpc: '2.0', method: 'test2', params: {} });

      rpc.processData(message1 + '\n' + message2 + '\n');

      assert.strictEqual(count, 2);
    });
  });

  describe('request/response matching', () => {
    it('should match response to request', async () => {
      const stdin = new Writable({
        write(chunk, encoding, callback) {
          callback();
        }
      });

      const promise = rpc.sendRequest(stdin, 'test', {}, 1000);

      // Simulate response
      setTimeout(() => {
        rpc.processData(JSON.stringify({
          jsonrpc: '2.0',
          id: rpc.nextId - 1, // Last ID used
          result: { success: true }
        }) + '\n');
      }, 10);

      const result = await promise;
      assert.deepStrictEqual(result, { success: true });
    });

    it('should handle error response', async () => {
      const stdin = new Writable({
        write(chunk, encoding, callback) {
          callback();
        }
      });

      const promise = rpc.sendRequest(stdin, 'test', {}, 1000);

      // Simulate error response
      setTimeout(() => {
        rpc.processData(JSON.stringify({
          jsonrpc: '2.0',
          id: rpc.nextId - 1,
          error: { message: 'Something went wrong' }
        }) + '\n');
      }, 10);

      await assert.rejects(promise, /Something went wrong/);
    });

    it('should timeout if no response', async () => {
      const stdin = new Writable({
        write(chunk, encoding, callback) {
          callback();
        }
      });

      await assert.rejects(
        rpc.sendRequest(stdin, 'test', {}, 50),
        /timed out/
      );
    });
  });

  describe('cleanup', () => {
    it('should cancel all pending requests', async () => {
      const stdin = new Writable({
        write(chunk, encoding, callback) {
          callback();
        }
      });

      const promise1 = rpc.sendRequest(stdin, 'test1', {}, 1000);
      const promise2 = rpc.sendRequest(stdin, 'test2', {}, 1000);

      assert.strictEqual(rpc.getPendingCount(), 2);

      rpc.cleanup();

      assert.strictEqual(rpc.getPendingCount(), 0);

      await assert.rejects(promise1, /Session closed/);
      await assert.rejects(promise2, /Session closed/);
    });
  });
});
