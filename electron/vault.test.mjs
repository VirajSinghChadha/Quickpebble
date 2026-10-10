import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { decrypt, deriveKey, encrypt, fillScript, normalizeHost } from "./vault.mjs";
import { parseCsv, parseLogins } from "./vault-import.mjs";

describe("vault crypto", () => {
  it("round-trips, and fails for the wrong key, host or username", async () => {
    const salt = crypto.randomBytes(16);
    const k = await deriveKey("correct horse battery", salt);
    const blob = encrypt(k, Buffer.from("s3cret!"), Buffer.from("a.com\nme"));
    expect(decrypt(k, blob, Buffer.from("a.com\nme")).toString()).toBe("s3cret!");
    expect(decrypt(await deriveKey("wrong password", salt), blob, Buffer.from("a.com\nme"))).toBeNull();
    expect(decrypt(k, blob, Buffer.from("b.com\nme"))).toBeNull();
    expect(decrypt(k, blob, Buffer.from("a.com\nyou"))).toBeNull();
  }, 20000);
  it("detects tampering and uses fresh nonces", async () => {
    const k = crypto.randomBytes(32);
    const blob = encrypt(k, Buffer.from("x"), Buffer.from("c"));
    expect(blob.equals(encrypt(k, Buffer.from("x"), Buffer.from("c")))).toBe(false);
    blob[blob.length - 1] ^= 1;
    expect(decrypt(k, blob, Buffer.from("c"))).toBeNull();
    expect(decrypt(k, Buffer.alloc(5), Buffer.from("c"))).toBeNull();
  });
  it("normalises hosts and escapes the fill script", () => {
    expect(normalizeHost("WWW.Example.com.")).toBe("example.com");
    for (const bad of ["", "exa mple.com", "evil.com/path"]) expect(normalizeHost(bad)).toBeNull();
    expect(fillScript('a"b</script>', "p'\\\n")).toContain('"a\\"b</script>"');
  });
});

describe("password CSV import", () => {
  it("parses quotes, newlines, BOM and CRLF", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n"multi\nline",z\r\n\r\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"'], ["multi\nline", "z"]]);
    expect(parseCsv("")).toEqual([]);
  });
  it("reads Chrome, Firefox, Safari, LastPass and Bitwarden exports", () => {
    expect(parseLogins('name,url,username,password,note\nexample.com,https://www.example.com/login,me@x.com,"p@ss""w",\n').logins).toEqual([{ host: "example.com", username: "me@x.com", password: 'p@ss"w' }]);
    expect(parseLogins("url,username,password,httpRealm\nhttps://a.com,u,pw,\n").logins[0].host).toBe("a.com");
    expect(parseLogins("Title,URL,Username,Password,Notes\nA,https://b.org/x,v,pw2,\n").logins[0]).toMatchObject({ host: "b.org", username: "v" });
    const bw = parseLogins("folder,type,name,notes,login_uri,login_username,login_password\n,login,Site,,https://d.com,me,pw4\n,note,A note,secret,,,\n,card,Visa,,,,\n");
    expect([bw.logins.length, bw.skipped]).toEqual([1, 2]);
  });
  it("skips rows without a password or a web site, and explains unknown files", () => {
    const p = parseLogins("url,username,password\nhttps://a.com,me,\n,me,pw\nandroid://abc@com.app,me,pw\nftp://x.com,me,pw\nok.com,me,pw\n");
    expect([p.logins.map((l) => l.host), p.skipped]).toEqual([["ok.com"], 4]);
    expect(() => parseLogins("")).toThrow(/empty/);
    expect(() => parseLogins("a,b\n1,2\n")).toThrow(/password column/);
    expect(() => parseLogins("username,password\nme,pw\n")).toThrow(/website column/);
  });
});
