import { cp, mkdir } from "node:fs/promises";

const source = new URL("../vendor/occt-js/", import.meta.url);
const target = new URL("../dist/cad-source/", import.meta.url);
await mkdir(target, { recursive: true });
for (const name of ["README.md", "kernel.patch", "occt.patch", "rebuild.sh", "SHA256SUMS", "licenses", "source.tar.gz"]) {
  await cp(new URL(name, source), new URL(name, target), { recursive: true });
}
