import * as ExpoCrypto from "expo-crypto";

// React Native has no WebCrypto. Supabase sign-in (PKCE) uses
// crypto.getRandomValues for its code verifier and crypto.subtle.digest to
// hash it; without them it falls back to Math.random and a plain, unhashed
// challenge. expo-crypto provides both natively.
type CryptoLike = {
  getRandomValues?: typeof ExpoCrypto.getRandomValues;
  subtle?: { digest?: (algorithm: string, data: BufferSource) => Promise<ArrayBuffer> };
};

const g = globalThis as unknown as { crypto?: CryptoLike };
const target: CryptoLike = g.crypto ?? {};

if (typeof target.getRandomValues !== "function") {
  target.getRandomValues = ExpoCrypto.getRandomValues;
}

if (!target.subtle || typeof target.subtle.digest !== "function") {
  target.subtle = {
    ...target.subtle,
    digest: (algorithm: string, data: BufferSource) => {
      if (algorithm.toUpperCase().replace("-", "") !== "SHA256") {
        return Promise.reject(new Error(`Unsupported digest: ${algorithm}`));
      }
      return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data);
    },
  };
}

if (!g.crypto) {
  try {
    g.crypto = target;
  } catch {
    // A read-only crypto global: nothing more to do.
  }
}
