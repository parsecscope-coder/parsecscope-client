/* Local NIfTI-1 reading with memory bounded by one stored slice. */
(function (root) {
  'use strict';
  const MAX_VOLUME_BYTES = 8 * 1024 ** 3;
  const MAX_SLICE_PIXELS = 4 * 1024 ** 2;
  function checkAbort(signal) {
    if (signal?.aborted) throw new DOMException('Reading cancelled.', 'AbortError');
  }
  async function readRange(file, start, length, signal) {
    checkAbort(signal);
    if (!/\.gz$/i.test(file.name)) {
      const bytes = new Uint8Array(await file.slice(start, start + length).arrayBuffer());
      checkAbort(signal);
      if (bytes.length !== length) throw Error('NIfTI voxel data or header is truncated.');
      return bytes;
    }
    if (typeof DecompressionStream === 'undefined') throw Error('This browser cannot open gzip files. Extract the .nii file and select it instead.');
    const reader = file.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const cancel = () => { reader.cancel().catch(() => {}); };
    signal?.addEventListener('abort', cancel, {once:true});
    const bytes = new Uint8Array(length);
    let position = 0, copied = 0;
    try {
      while (copied < length) {
        checkAbort(signal);
        const {value, done} = await reader.read();
        checkAbort(signal);
        if (done) throw Error('NIfTI voxel data or header is truncated.');
        const from = Math.max(0, start - position);
        const to = Math.min(value.length, start + length - position);
        if (to > from) { bytes.set(value.subarray(from, to), copied); copied += to - from; }
        position += value.length;
      }
      return bytes;
    } finally {
      signal?.removeEventListener('abort', cancel);
      await reader.cancel().catch(() => {});
    }
  }
  function parseHeader(bytes, fileSize) {
    if (bytes.length < 352) throw Error('NIfTI header is too short.');
    const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const little = d.getInt32(0, true) === 348;
    if (!little && d.getInt32(0, false) !== 348) throw Error('Invalid NIfTI-1 header.');
    if (String.fromCharCode(...bytes.subarray(344, 348)) !== 'n+1\0') throw Error('Only single-file NIfTI-1 is supported.');
    const dim = d.getInt16(40, little), nx = d.getInt16(42, little), ny = d.getInt16(44, little), nz = d.getInt16(46, little);
    if (dim !== 3 || nx < 1 || ny < 1 || nz < 1) throw Error('Only three-dimensional volumes are supported.');
    const datatype = d.getInt16(70, little), bits = d.getInt16(72, little);
    const types = {2:[8,(v,o)=>v.getUint8(o)],4:[16,(v,o,l)=>v.getInt16(o,l)],16:[32,(v,o,l)=>v.getFloat32(o,l)],64:[64,(v,o,l)=>v.getFloat64(o,l)]};
    if (!types[datatype] || types[datatype][0] !== bits) throw Error('Unsupported voxel type (expected UINT8, INT16, FLOAT32 or FLOAT64).');
    if (nx * ny > MAX_SLICE_PIXELS) throw Error('Slice dimensions exceed this viewer’s 4-megapixel limit.');
    const offset = d.getFloat32(108, little), voxelBytes = bits / 8, sliceBytes = nx * ny * voxelBytes;
    const end = offset + sliceBytes * nz;
    if (!Number.isSafeInteger(offset) || offset < 352 || !Number.isSafeInteger(end) || end > MAX_VOLUME_BYTES) throw Error('Invalid voxel offset or volume larger than 8 GiB.');
    if (fileSize !== undefined && end > fileSize) throw Error('NIfTI voxel data is truncated.');
    const rawSlope = d.getFloat32(112, little), rawIntercept = d.getFloat32(116, little);
    const slope = rawSlope === 0 ? 1 : rawSlope, intercept = rawSlope === 0 ? 0 : rawIntercept;
    if (!Number.isFinite(slope) || !Number.isFinite(intercept)) throw Error('Invalid NIfTI intensity scaling.');
    const sform = d.getInt16(254,little), qform = d.getInt16(252,little);
    const geometry = [d.getFloat32(80,little),d.getFloat32(84,little),d.getFloat32(88,little)];
    if (sform) for (let i=0;i<12;i++) geometry.push(d.getFloat32(280+4*i,little));
    else if (qform) { for (let i=0;i<6;i++) geometry.push(d.getFloat32(256+4*i,little)); geometry.push(d.getFloat32(76,little)); }
    return {little,nx,ny,nz,offset,voxelBytes,sliceBytes,read:types[datatype][1],slope,intercept,sform,qform,geometry};
  }
  async function openVolume(file, signal) {
    if (!/\.nii(\.gz)?$/i.test(file.name)) throw Error('Choose a .nii or .nii.gz file.');
    const gzip = /\.gz$/i.test(file.name);
    const vol = parseHeader(await readRange(file,0,352,signal), gzip ? undefined : file.size);
    return {...vol, gzip, async slice(z, signal) {
      if (!Number.isInteger(z) || z < 0 || z >= vol.nz) throw Error('Slice index is outside this volume.');
      const bytes = await readRange(file,vol.offset + z * vol.sliceBytes,vol.sliceBytes,signal);
      return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    }};
  }
  function matchingGeometry(a,b) {
    return a.nx===b.nx && a.ny===b.ny && a.nz===b.nz && Boolean(a.sform)===Boolean(b.sform) &&
      (a.sform || Boolean(a.qform)===Boolean(b.qform)) && a.geometry.length===b.geometry.length &&
      a.geometry.every((v,i)=>Number.isFinite(v) && Number.isFinite(b.geometry[i]) && Math.abs(v-b.geometry[i])<=1e-3);
  }
  const api = {openVolume,matchingGeometry};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ParsecNifti = api;
})(globalThis);
