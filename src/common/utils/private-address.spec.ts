import { isBlockedAddress } from './private-address';

describe('isBlockedAddress', () => {
  it.each([
    ['10.0.0.5', 'private class A'],
    ['172.16.4.4', 'private class B'],
    ['172.31.255.255', 'top of the private class B range'],
    ['192.168.1.10', 'private class C'],
    ['127.0.0.1', 'loopback'],
    ['169.254.169.254', 'cloud metadata'],
    ['0.0.0.0', 'this network'],
    ['100.100.0.1', 'carrier-grade NAT'],
    ['198.18.0.1', 'benchmarking'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
    ['::1', 'IPv6 loopback'],
    ['::', 'IPv6 unspecified'],
    ['fd00::1', 'IPv6 unique local'],
    ['fe80::1', 'IPv6 link local'],
    ['ff02::1', 'IPv6 multicast'],
    ['::ffff:169.254.169.254', 'IPv4-mapped cloud metadata'],
    ['::ffff:10.0.0.1', 'IPv4-mapped private'],
    ['not-an-ip', 'garbage'],
    ['', 'empty'],
  ])('blocks %s (%s)', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    ['8.8.8.8', 'public DNS'],
    ['1.1.1.1', 'public DNS'],
    ['93.184.216.34', 'public web host'],
    ['172.32.0.1', 'just outside the private class B range'],
    ['2606:4700::1111', 'public IPv6'],
  ])('allows %s (%s)', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it('allows loopback only when explicitly permitted, and never other private ranges', () => {
    expect(isBlockedAddress('127.0.0.1', true)).toBe(false);
    expect(isBlockedAddress('::1', true)).toBe(false);
    expect(isBlockedAddress('10.0.0.1', true)).toBe(true);
    expect(isBlockedAddress('169.254.169.254', true)).toBe(true);
    expect(isBlockedAddress('192.168.0.1', true)).toBe(true);
  });
});
