import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("sky-like-storage.js", import.meta.url), "utf8");

function makeStorage() {
  const values = new Map();
  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

const blockedStorage = {
  getItem() { throw new Error("Storage is unavailable"); },
  setItem() { throw new Error("Storage is unavailable"); },
  removeItem() { throw new Error("Storage is unavailable"); }
};

function loadStorage(localStorage, sessionStorage) {
  const window = {
    localStorage,
    sessionStorage,
    crypto: {
      getRandomValues(bytes) {
        bytes.fill(0xab);
        return bytes;
      }
    }
  };
  vm.runInNewContext(source, { window, Uint8Array });
  return window.ParknacrossSkyLikesStorage;
}

const blocked = loadStorage(blockedStorage, blockedStorage);
const transientId = blocked.visitorId();
assert.match(transientId, /^[0-9a-f]{32}$/i);
assert.equal(blocked.visitorId(), transientId, "visitor ID remains stable for the page session");
blocked.setLiked("photo-1", true);
assert.equal(blocked.hasLiked("photo-1"), true, "likes remain usable when browser storage is blocked");
blocked.setLiked("photo-1", false);
assert.equal(blocked.hasLiked("photo-1"), false);

const sessionStorage = makeStorage();
const sessionFallback = loadStorage(blockedStorage, sessionStorage);
const sessionId = sessionFallback.visitorId();
sessionFallback.setLiked("photo-2", true);
assert.equal(sessionStorage.getItem("parknacrossSkyVisitorId:v1"), sessionId);
assert.equal(sessionFallback.hasLiked("photo-2"), true);

const restored = loadStorage(blockedStorage, sessionStorage);
assert.equal(restored.visitorId(), sessionId, "session storage preserves identity across page loads");
assert.equal(restored.hasLiked("photo-2"), true, "session storage preserves the like state");

console.log("Sky photo likes storage fallback tests passed.");
