import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callActivityURL, createCallActivityController } from '../src/call/call-activity-controller.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
function fixture(prepare) {
  const events = [];
  const instances = new Map();
  const errors = [];
  let serial = 0;
  const factory = {
    getInstances: () => [...instances.values()],
    start(props, url) {
      const id = String(++serial);
      const instance = {
        getId: () => id,
        async update(next) { events.push(['update', next]); },
        async end() { events.push(['end', id]); instances.delete(id); },
      };
      instances.set(id, instance);
      events.push(['start', props, url]);
      return instance;
    },
  };
  const controller = createCallActivityController(() => factory, prepare, (...error) => errors.push(error));
  return { controller, factory, events, instances, errors };
}

test('hangup during artwork preparation never starts a late activity', async () => {
  const ready = deferred();
  const f = fixture(async props => { await ready.promise; return props; });
  const start = f.controller.start({ callId: 'A' });
  await tick();
  const end = f.controller.end();
  ready.resolve();
  await Promise.all([start, end]);
  assert.deepEqual(f.events, []);
  assert.equal(f.controller.getCallId(), null);
});

test('a replacement call invalidates queued updates from the previous call', async () => {
  const f = fixture();
  await f.controller.start({ callId: 'A' });
  const update = f.controller.update({ callId: 'A', isMuted: true });
  const end = f.controller.end();
  const start = f.controller.start({ callId: 'B' });
  await Promise.all([update, end, start]);
  await f.controller.update({ callId: 'A', isMuted: false });
  assert.deepEqual(f.events.map(event => event[0]), ['start', 'end', 'start']);
  assert.equal(f.controller.getCallId(), 'B');
  assert.equal(f.instances.size, 1);
});

test('orphan cleanup removes previous-process cards but preserves a current call', async () => {
  const f = fixture();
  f.factory.start({ callId: 'orphan' }, 'old');
  await f.controller.clearOrphans();
  assert.equal(f.instances.size, 0);
  await f.controller.start({ callId: 'live' });
  await f.controller.clearOrphans();
  assert.equal(f.instances.size, 1);
});

test('a pending orphan cleanup cannot end a newly requested call', async () => {
  const f = fixture();
  await Promise.all([f.controller.clearOrphans(), f.controller.start({ callId: 'live' })]);
  assert.equal(f.instances.size, 1);
  assert.equal(f.controller.getCallId(), 'live');
});

test('hangup waits for an in-flight update and prevents later updates', async () => {
  const f = fixture();
  await f.controller.start({ callId: 'A' });
  const ready = deferred();
  const instance = [...f.instances.values()][0];
  instance.update = async () => { f.events.push(['updating']); await ready.promise; f.events.push(['updated']); };
  const update = f.controller.update({ callId: 'A' });
  await tick();
  const end = f.controller.end();
  const late = f.controller.update({ callId: 'A' });
  ready.resolve();
  await Promise.all([update, end, late]);
  assert.deepEqual(f.events.map(event => event[0]), ['start', 'updating', 'updated', 'end']);
  assert.equal(f.instances.size, 0);
});

test('native update errors do not poison the queue or prevent hangup', async () => {
  const f = fixture();
  await f.controller.start({ callId: 'A' });
  [...f.instances.values()][0].update = () => { throw new Error('native bridge failure'); };
  await f.controller.update({ callId: 'A' });
  await f.controller.end();
  assert.equal(f.errors.length, 1);
  assert.equal(f.instances.size, 0);
});

test('optional native module and rejected activity starts never reject call operations', async () => {
  const absent = createCallActivityController(() => null);
  await absent.start({ callId: 'A' });
  await absent.update({ callId: 'A' });
  await absent.end();
  const f = fixture();
  f.factory.start = () => { throw new Error('activities disabled'); };
  await f.controller.start({ callId: 'A' });
  await f.controller.end();
  assert.equal(f.errors.length, 1);
});

test('the return URL scopes and encodes the actual call identity', () => {
  const url = new URL(callActivityURL('call/A?B&x=1'));
  assert.equal(url.protocol, 'mates:');
  assert.equal(url.pathname, '/call');
  assert.equal(url.searchParams.get('activityCallId'), 'call/A?B&x=1');
  assert.equal([...url.searchParams].length, 1);
});
