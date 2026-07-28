import assert from "node:assert/strict";
import test from "node:test";
import { isPublicMigrationImageAddress, validateMigrationImageUrl } from "./remote-image-authority.ts";

test("migration image URLs require one exact canonical public HTTPS authority", () => {
  assert.equal(validateMigrationImageUrl("https://media.example.test/uploads/yuzuk.png"), "https://media.example.test/uploads/yuzuk.png");
  for (const value of [
    "http://media.example.test/a.png",
    "https://user:secret@media.example.test/a.png",
    "https://media.example.test:8443/a.png",
    "https://media.example.test/a.png#fragment",
    "https://media.example.test/%61.png",
    "https://localhost/a.png",
    "https://127.0.0.1/a.png",
    " https://media.example.test/a.png",
  ]) assert.throws(() => validateMigrationImageUrl(value), /migration_image_url_invalid/);
});

test("migration DNS authority rejects private metadata documentation and transition ranges", () => {
  for (const address of [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1",
    "192.0.0.1", "192.0.2.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255",
    "::", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "ff02::1", "2001:db8::1", "2002::1",
  ]) assert.equal(isPublicMigrationImageAddress(address), false, address);
  assert.equal(isPublicMigrationImageAddress("8.8.8.8"), true);
  assert.equal(isPublicMigrationImageAddress("2606:4700:4700::1111"), true);
});
