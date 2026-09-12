#!/usr/bin/env bash
set -euo pipefail

vendor_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
work_dir="${1:?Usage: rebuild.sh /absolute/path/to/new-work-directory}"
jobs="${BUILD_JOBS:-6}"

if [[ -e "$work_dir" ]]; then
  printf 'Work directory already exists: %s\n' "$work_dir" >&2
  exit 1
fi
mkdir -p "$work_dir"
work_dir="$(cd -- "$work_dir" && pwd)"

git init "$work_dir/occt-js"
git -C "$work_dir/occt-js" remote add origin https://github.com/tx-code/occt-js.git
git -C "$work_dir/occt-js" fetch --depth 1 origin ad8ffb6007eb3fd25179232f291b626d6e78a195
git -C "$work_dir/occt-js" checkout --detach FETCH_HEAD
git -C "$work_dir/occt-js" submodule update --init --depth 1 occt
test "$(git -C "$work_dir/occt-js/occt" rev-parse HEAD)" = a016080bf6738d6aeae020badee4e888ad1540a5
git -C "$work_dir/occt-js" apply --check "$vendor_dir/kernel.patch"
git -C "$work_dir/occt-js" apply "$vendor_dir/kernel.patch"
git -C "$work_dir/occt-js/occt" apply --check "$vendor_dir/occt.patch"
git -C "$work_dir/occt-js/occt" apply "$vendor_dir/occt.patch"

git init "$work_dir/emsdk"
git -C "$work_dir/emsdk" remote add origin https://github.com/emscripten-core/emsdk.git
git -C "$work_dir/emsdk" fetch --depth 1 origin 5eb0bde7585670252e8ba05e9d361627bffd08b5
git -C "$work_dir/emsdk" checkout --detach FETCH_HEAD
"$work_dir/emsdk/emsdk" install 4.0.10
"$work_dir/emsdk/emsdk" activate 4.0.10
source "$work_dir/emsdk/emsdk_env.sh"
export EMCC_CORES="$jobs"

emcmake cmake -S "$work_dir/occt-js" -B "$work_dir/build" -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build "$work_dir/build" --parallel "$jobs"
cd "$work_dir/occt-js"
node tools/generate_esm_runtime_entry.mjs
node --test --test-concurrency=1 \
  test/import_performance_contract.test.mjs \
  test/esm_entry_contract.test.mjs \
  test/exact_model_lifecycle_contract.test.mjs \
  test/exact_query_store_performance_contract.test.mjs \
  test/exact_ref_mapping_contract.test.mjs \
  test/exact_primitive_queries_contract.test.mjs \
  test/exact_pairwise_measurement_contract.test.mjs \
  test/import_appearance_contract.test.mjs

COPYFILE_DISABLE=1 tar -czf "$vendor_dir/source.tar.gz" --exclude='occt/.git' \
  CMakeLists.txt src occt tools test package.json package-lock.json LICENSE dist/occt-js.d.ts
for name in occt-js.js occt-js.mjs occt-js.wasm occt-js.d.ts; do
  cp "dist/$name" "$vendor_dir/dist/$name"
done
chmod 644 "$vendor_dir"/dist/occt-js.*
node --input-type=module - "$vendor_dir" > "$vendor_dir/SHA256SUMS" <<'JS'
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
for (const file of ['dist/occt-js.js', 'dist/occt-js.mjs', 'dist/occt-js.wasm', 'dist/occt-js.d.ts', 'source.tar.gz']) {
  const hash = createHash('sha256').update(readFileSync(join(process.argv[2], file))).digest('hex');
  console.log(`${hash}  ${file}`);
}
JS
printf 'Updated runtime: %s\n' "$vendor_dir/dist"
