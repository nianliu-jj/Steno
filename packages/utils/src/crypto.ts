/**
 * @file AES 对称加密工具
 *
 * 基于 crypto-js 的 AES 加密，用于本地敏感数据的加解密。
 * 使用共享密钥（secret）进行对称加密，适用于前端本地存储场景。
 */

import CryptoJS from 'crypto-js';

/**
 * AES 加解密类。
 *
 * @typeParam T - 被加密的数据类型（JSON 可序列化对象）
 *
 * @example
 * ```ts
 * const crypto = new Crypto<{ token: string }>('my-secret-key');
 * const encrypted = crypto.encrypt({ token: 'abc123' });
 * const decrypted = crypto.decrypt(encrypted); // { token: 'abc123' }
 * ```
 */
export class Crypto<T extends object> {
  /** AES 加密密钥。 */
  secret: string;

  /**
   * @param secret - 加密密钥（应与解密时使用相同密钥）
   */
  constructor(secret: string) {
    this.secret = secret;
  }

  /**
   * 加密数据。
   *
   * 流程：`JSON.stringify(data)` → `AES.encrypt(json, secret)` → `ciphertext.toString()`。
   *
   * @param data - 待加密对象（需 JSON 可序列化）
   * @returns Base64 编码的密文字符串
   */
  encrypt(data: T): string {
    const dataString = JSON.stringify(data);
    const encrypted = CryptoJS.AES.encrypt(dataString, this.secret);
    return encrypted.toString();
  }

  /**
   * 解密数据。
   *
   * 流程：`AES.decrypt(ciphertext, secret)` → `decrypted.toString(Utf8)` → `JSON.parse(plaintext)`。
   * JSON 反序列化失败时返回 `null`（密文损坏或密钥不匹配）。
   *
   * @param encrypted - Base64 编码的密文
   * @returns 解密后的对象；解密/反序列化失败返回 `null`
   */
  decrypt(encrypted: string) {
    const decrypted = CryptoJS.AES.decrypt(encrypted, this.secret);
    const dataString = decrypted.toString(CryptoJS.enc.Utf8);
    try {
      return JSON.parse(dataString) as T;
    } catch {
      // JSON 解析失败 — 密文可能已损坏或密钥不匹配
      return null;
    }
  }
}
