(() => {
  'use strict';
  const MAX_BYTES = 128 * 1024 * 1024;
  const $ = id => document.getElementById(id);
  const imageInput = $('image'), maskInput = $('mask'), slider = $('slice');
  const canvas = $('view'), ctx = canvas.getContext('2d'), status = $('status');
  let image = null, mask = null;

  async function boundedBytes(file) {
    if (!/\.nii(\.gz)?$/i.test(file.name)) throw Error('Choose a .nii or .nii.gz file.');
    if (file.size > MAX_BYTES) throw Error('File exceeds this browser viewer’s 128 MiB limit. Use a desktop NIfTI viewer for full scans.');
    const stream = /\.gz$/i.test(file.name) ? file.stream().pipeThrough(new DecompressionStream('gzip')) : file.stream();
    const reader = stream.getReader(), chunks = [];
    let length = 0;
    try {
      for (;;) {
        const {value, done} = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_BYTES) throw Error('Expanded NIfTI exceeds this browser viewer’s 128 MiB limit.');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  }

  function parseNifti(bytes) {
    if (bytes.byteLength < 353) throw Error('NIfTI file is too short.');
    const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const little = d.getInt32(0, true) === 348;
    if (!little && d.getInt32(0, false) !== 348) throw Error('Invalid NIfTI-1 header.');
    if (String.fromCharCode(...bytes.subarray(344, 347)) !== 'n+1') throw Error('Only single-file NIfTI-1 is supported.');
    const dim = d.getInt16(40, little), nx = d.getInt16(42, little), ny = d.getInt16(44, little), nz = d.getInt16(46, little);
    if (dim !== 3 || nx < 1 || ny < 1 || nz < 1) throw Error('Only three-dimensional volumes are supported.');
    const datatype = d.getInt16(70, little), bits = d.getInt16(72, little);
    const types = {2:[8, (v,o)=>v.getUint8(o)], 4:[16,(v,o,l)=>v.getInt16(o,l)], 16:[32,(v,o,l)=>v.getFloat32(o,l)], 64:[64,(v,o,l)=>v.getFloat64(o,l)]};
    if (!types[datatype] || types[datatype][0] !== bits) throw Error('Unsupported voxel type (expected UINT8, INT16, FLOAT32 or FLOAT64).');
    const offset = d.getFloat32(108, little), count = nx * ny * nz, voxelBytes = bits / 8;
    if (!Number.isInteger(offset) || offset < 352 || offset + count * voxelBytes > bytes.byteLength) throw Error('NIfTI voxel data is truncated or has an invalid offset.');
    const slope = d.getFloat32(112, little), intercept = d.getFloat32(116, little);
    const sform = d.getInt16(254,little), qform = d.getInt16(252,little);
    const geometry = [d.getFloat32(80,little),d.getFloat32(84,little),d.getFloat32(88,little)];
    if (sform) for (let i=0;i<12;i++) geometry.push(d.getFloat32(280+4*i,little));
    else if (qform) for (let i=0;i<6;i++) geometry.push(d.getFloat32(256+4*i,little));
    return {d, little, nx, ny, nz, offset, voxelBytes, read:types[datatype][1], slope:slope === 0 ? 1 : slope, intercept, sform, qform, geometry};
  }

  function value(vol, x, y, z) {
    const index = (z * vol.ny * vol.nx + y * vol.nx + x) * vol.voxelBytes;
    return vol.read(vol.d, vol.offset + index, vol.little) * vol.slope + vol.intercept;
  }

  function render() {
    if (!image) return;
    const z = Number(slider.value), {nx,ny} = image;
    canvas.width = nx; canvas.height = ny; $('sliceNumber').value = `${z + 1} / ${image.nz}`;
    const frame = ctx.createImageData(nx,ny), color = [[0,0,0],[54,212,177],[255,175,84],[133,170,255]];
    for (let y=0; y<ny; y++) for (let x=0; x<nx; x++) {
      const i = 4 * ((ny - 1 - y) * nx + x);
      const raw = value(image,x,y,z), grey = Number.isFinite(raw) ? Math.max(0,Math.min(255,Math.round((raw + 160) * 255 / 380))) : 0;
      frame.data[i] = frame.data[i+1] = frame.data[i+2] = grey; frame.data[i+3] = 255;
      if (mask) {
        const label = Math.round(value(mask,x,y,z));
        if (label > 0 && label < color.length) for (let c=0;c<3;c++) frame.data[i+c] = Math.round(.4*grey + .6*color[label][c]);
      }
    }
    ctx.putImageData(frame,0,0);
  }

  async function load(input, isMask) {
    const file = input.files[0];
    if (!file) { if (isMask) {mask=null;render();} return; }
    status.textContent = `Reading ${file.name} locally…`;
    try {
      const vol = parseNifti(await boundedBytes(file));
      if (isMask) {
        if (!image) throw Error('Choose an image before its mask.');
        if (vol.nx !== image.nx || vol.ny !== image.ny || vol.nz !== image.nz) throw Error('Mask dimensions do not match the image.');
        if (Boolean(vol.sform) !== Boolean(image.sform) || (!vol.sform && Boolean(vol.qform) !== Boolean(image.qform)) ||
            vol.geometry.some((v,i)=>!Number.isFinite(v) || Math.abs(v-image.geometry[i])>1e-3)) throw Error('Mask spatial geometry does not match the image.');
        mask = vol;
      } else {
        image = vol; mask = null; maskInput.value = '';
        slider.max = String(vol.nz - 1); slider.value = String(Math.floor(vol.nz / 2)); slider.disabled = false;
      }
      status.textContent = `${image.nx} × ${image.ny} × ${image.nz} voxels loaded locally${mask ? ' with reference overlay' : ''}. No upload or AI inference.`;
      render();
    } catch (e) {
      if (isMask) {mask=null;maskInput.value='';} else {image=null;mask=null;slider.disabled=true;}
      status.textContent = `Cannot display file: ${e.message}`;
      if (image) render();
    }
  }
  imageInput.addEventListener('change', () => load(imageInput,false));
  maskInput.addEventListener('change', () => load(maskInput,true));
  slider.addEventListener('input',render);
})();
