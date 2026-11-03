/**
 * Shield settings as a compact string, shared by the UI (encode) and the proxy server (decode).
 * Keeping ONE definition guarantees both sides agree on the order.
 */
import type { ShieldSettings } from '../types/browser';

export interface ShieldFlags {
  shieldsEnabled: boolean;
  blockAggressiveAds: boolean;
  blockTrackers: boolean;
  blockThirdPartyCookies: boolean;
  upgradeHttps: boolean;
  preventWebRTCLeak: boolean;
  blockScripts: boolean;
  blockPopups: boolean;
  doNotTrack: boolean;
}

export const SHIELD_FLAG_KEYS: Array<keyof ShieldFlags> = [
  'shieldsEnabled',
  'blockAggressiveAds',
  'blockTrackers',
  'blockThirdPartyCookies',
  'upgradeHttps',
  'preventWebRTCLeak',
  'blockScripts',
  'blockPopups',
  'doNotTrack',
];

/** Used until the UI sends its own settings (matches the UI defaults). */
export const DEFAULT_SHIELD_FLAGS: ShieldFlags = {
  shieldsEnabled: true,
  blockAggressiveAds: true,
  blockTrackers: true,
  blockThirdPartyCookies: true,
  upgradeHttps: true,
  preventWebRTCLeak: true,
  blockScripts: false,
  blockPopups: true,
  doNotTrack: true,
};

export function encodeShieldFlags(shield: ShieldSettings, doNotTrack: boolean): string {
  const flags: ShieldFlags = { ...shield, doNotTrack } as ShieldFlags;
  return SHIELD_FLAG_KEYS.map((k) => (flags[k] ? '1' : '0')).join('');
}

/** Returns null for anything that isn't exactly one 0/1 character per flag. */
export function decodeShieldFlags(value: unknown): ShieldFlags | null {
  if (typeof value !== 'string' || value.length !== SHIELD_FLAG_KEYS.length || !/^[01]+$/.test(value)) return null;
  const out = {} as ShieldFlags;
  SHIELD_FLAG_KEYS.forEach((k, i) => {
    out[k] = value[i] === '1';
  });
  return out;
}
