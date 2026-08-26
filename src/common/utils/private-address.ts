import { isIP } from 'net';

/**
 * Decides whether an IP address may be contacted when importing an image from a
 * member-supplied link. Everything outside the public internet is refused so a link can
 * never be used to probe the host, the private network, or a cloud metadata endpoint.
 */
export function isBlockedAddress(address: string, allowLoopback = false): boolean {
  const value = address.trim().toLowerCase().split('%')[0];
  const version = isIP(value);
  if (version === 4) return isBlockedIpv4(value, allowLoopback);
  if (version === 6) return isBlockedIpv6(value, allowLoopback);
  return true;
}

function isBlockedIpv4(address: string, allowLoopback: boolean): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;

  if (a === 127) return !allowLoopback; // loopback
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata at 169.254.169.254
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 192 && b === 0) return true; // IETF protocol assignments and TEST-NET-1
  if (a === 192 && b === 88) return true; // 6to4 relay anycast
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51) return true; // TEST-NET-2
  if (a === 203 && b === 0) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast, reserved and broadcast
  return false;
}

function isBlockedIpv6(address: string, allowLoopback: boolean): boolean {
  if (address === '::') return true; // unspecified
  if (address === '::1') return !allowLoopback; // loopback

  // IPv4-mapped and IPv4-translated forms reach an IPv4 destination, so judge them as IPv4.
  const mapped = address.match(/^::ffff:(?:0:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1], allowLoopback);
  if (address.startsWith('::ffff:') || address.startsWith('64:ff9b:')) return true;

  const head = Number.parseInt(address.split(':')[0] || '0', 16);
  if (Number.isNaN(head)) return true;
  if ((head & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((head & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((head & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (address.startsWith('2001:db8')) return true; // documentation
  if (address.startsWith('100:')) return true; // discard-only
  return false;
}
