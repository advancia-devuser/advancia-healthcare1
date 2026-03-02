/**
 * Shim: @walletconnect/keyvaluestorage
 * ─────────────────────────────────────
 * Account Kit v4.x has a hard dependency chain that imports WalletConnect's
 * keyvaluestorage module even when WalletConnect is disabled in config.
 * Import chain: eoa.js → connectors → walletConnect.js → ethereum-provider
 * → universal-provider → sign-client → core → keyvaluestorage
 *
 * This shim prevents ENOENT build errors and provides a no-op implementation.
 * When Account Kit drops the hard WalletConnect dependency, this shim can be
 * removed and the webpack alias in next.config.mjs deleted.
 *
 * Re-enablement:
 *   1. Remove this file
 *   2. Remove the webpack alias for '@walletconnect/keyvaluestorage' in next.config.mjs
 *   3. Run `npm install @walletconnect/keyvaluestorage`
 *   4. Uncomment `{ type: "walletConnect" }` in config.ts auth sections
 *   5. Test build: `npm run build`
 */

export class KeyValueStorage {
  async getItem(_key: string): Promise<string | null> {
    return null;
  }

  async setItem(_key: string, _value: string): Promise<void> {
    // No-op — WalletConnect is shimmed out
  }

  async removeItem(_key: string): Promise<void> {
    // No-op
  }

  async clear(): Promise<void> {
    // No-op
  }

  async getAllKeys(): Promise<string[]> {
    return [];
  }
}

export default KeyValueStorage;