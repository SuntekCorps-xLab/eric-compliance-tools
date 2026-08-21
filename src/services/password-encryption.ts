import JSEncrypt from 'jsencrypt';

const defaultLoginPublicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAhC/gAltjMrNa9+0lx2D9
tK8vQh1Du9eUMMNMkBcTU6iZ6eaUaz/f73VGhJArGKfs2Rcvi8XmWYhpWHwS6fAO
erogB1k2A/vT6nWjC+tuPAtrnbVUxqKrNAFaxtSO7BGKz3OLhVcLca8T5MEh2251
Q++ctm0ipb9Ho4Q0bQFkjdahCYtOuneVO1dbeSBg6GQB7fJuSWUXjwsXG/lnJOq1
TWnbTofaPsI3JdmR+xBP7dxHfZydQWqKjR/SOAkm11a1kC+caMGm1f8JW1vD4z1p
FPZCCmfjpuf3AKv2k4DRAWbI28uP6L4uGjUaagUlXTbenjWw2h52CdDY1Raf+9uS
KwIDAQAB
-----END PUBLIC KEY-----`;

function loginPublicKey(): string {
  const configured = import.meta.env.VITE_LOGIN_RSA_PUBLIC_KEY?.trim();
  return configured ? configured.replace(/\\n/g, '\n') : defaultLoginPublicKey;
}

export function encryptLoginPassword(password: string): string {
  const encryptor = new JSEncrypt();
  encryptor.setPublicKey(loginPublicKey());
  const encrypted = encryptor.encrypt(password);
  if (!encrypted) throw new Error('ERiC could not protect the password for sign-in.');
  return encrypted;
}
