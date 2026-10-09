import { describe, expect, it } from 'vitest';
import { computeLag } from './consumer-lag';

const end = (partition: number, high: string, low = '0') => ({ partition, high, low });
const committed = (partition: number, offset: string) => ({ partition, offset });

describe('computeLag', () => {
  it('is the distance between the end of each partition and the committed offset', () => {
    expect(computeLag([end(0, '10'), end(1, '7')], [committed(0, '4'), committed(1, '7')])).toBe(6);
  });

  it('is zero when everything is committed', () => {
    expect(computeLag([end(0, '5')], [committed(0, '5')])).toBe(0);
  });

  it('counts every retained message of a partition the group never committed', () => {
    expect(computeLag([end(0, '10', '3')], [])).toBe(7);
    expect(computeLag([end(0, '10', '3')], [committed(0, '-1')])).toBe(7);
  });

  it('starts from the log start when the committed offset was already deleted', () => {
    expect(computeLag([end(0, '10', '6')], [committed(0, '2')])).toBe(4);
  });

  it('never goes negative', () => {
    expect(computeLag([end(0, '5')], [committed(0, '9')])).toBe(0);
  });

  it('ignores committed partitions the topic no longer reports', () => {
    expect(computeLag([end(0, '5')], [committed(0, '5'), committed(3, '1')])).toBe(0);
  });

  it('adds up across partitions as a safe integer', () => {
    expect(computeLag([end(0, '9007199254740000'), end(1, '10')], [])).toBe(9007199254740010);
  });
});
