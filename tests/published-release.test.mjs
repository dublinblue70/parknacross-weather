import assert from "node:assert/strict";
import fs from "node:fs";
import { assertPublishedRelease, publishedVersion } from "../public-monitor.mjs";
const read=name=>fs.readFileSync(new URL("../"+name,import.meta.url),"utf8");
const version=JSON.parse(read("package.json")).version;
for(const page of ["index.html","status.html","admin.html"]){
  const source=read(page);
  assert.equal(publishedVersion(source),version,page+" release tag");
  assert.doesNotThrow(()=>assertPublishedRelease(source),page+" release matches package");
}
assert.throws(()=>assertPublishedRelease('<meta name="parknacross-site-version" content="38.4.001">'),/differs/);
assert.throws(()=>assertPublishedRelease('<html>No release metadata</html>'),/differs/);
console.log("PASS: public release metadata agrees with GitHub version and detects stale pages.");
