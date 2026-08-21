import { describe, expect, it } from 'vitest';
import { encryptLoginPassword } from './password-encryption';

describe('password login encryption', () => {
  it('encrypts the password with the configured ERiC public key', () => {
    const encrypted = encryptLoginPassword('temporary-password');

    expect(encrypted).not.toContain('temporary-password');
    expect(encrypted.length).toBeGreaterThan(100);
  });
});
