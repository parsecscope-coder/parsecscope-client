(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const imageInput = $('image'), maskInput = $('mask'), slider = $('slice');
  const canvas = $('view'), ctx = canvas.getContext('2d'), status = $('status');
  let image = null, mask = null, imageRead = null, maskRead = null, sliceRead = null;
  let sliderTimer;
  function clearView() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    $('sliceNumber').value = '—';
  }
  function value(vol, data, index) {
    return vol.read(data,index * vol.voxelBytes,vol.little) * vol.slope + vol.intercept;
  }
  async function render() {
    sliceRead?.abort();
    if (!image) return;
    const control = sliceRead = new AbortController(), signal = control.signal;
    const currentImage = image, currentMask = mask;
    const z = Number(slider.value), {nx,ny} = currentImage;
    clearView();
    status.textContent = `Reading slice ${z + 1} / ${currentImage.nz} locally…${currentImage.gzip || currentMask?.gzip ? ' Compressed scans may take a moment.' : ''}`;
    try {
      const [pixels, labels] = await Promise.all([currentImage.slice(z,signal),currentMask ? currentMask.slice(z,signal) : null]);
      if (signal.aborted) return;
      canvas.width = nx; canvas.height = ny;
      const frame = ctx.createImageData(nx,ny), color = [[0,0,0],[54,212,177],[255,175,84],[133,170,255]];
      for (let y=0;y<ny;y++) for (let x=0;x<nx;x++) {
        const index = y * nx + x, i = 4 * ((ny - 1 - y) * nx + x);
        const raw = value(currentImage,pixels,index), grey = Number.isFinite(raw) ? Math.max(0,Math.min(255,Math.round((raw + 160) * 255 / 380))) : 0;
        frame.data[i] = frame.data[i+1] = frame.data[i+2] = grey; frame.data[i+3] = 255;
        if (labels) {
          const label = Math.round(value(currentMask,labels,index));
          if (label > 0 && label < color.length) for (let c=0;c<3;c++) frame.data[i+c] = Math.round(.4*grey + .6*color[label][c]);
        }
      }
      ctx.putImageData(frame,0,0);
      $('sliceNumber').value = `${z + 1} / ${currentImage.nz}`;
      status.textContent = `${nx} × ${ny} × ${currentImage.nz} voxels · slice ${z + 1} loaded locally${labels ? ' with reference overlay' : ''}. No upload or AI inference.`;
    } catch (e) {
      if (signal.aborted) return;
      control.abort(); clearView();
      status.textContent = `Cannot display slice: ${e.message}`;
    }
  }
  async function load(input,isMask) {
    clearTimeout(sliderTimer); sliceRead?.abort();
    if (isMask) { maskRead?.abort(); mask = null; }
    else {
      imageRead?.abort(); maskRead?.abort(); image = null; mask = null;
      maskInput.value = ''; maskInput.disabled = true; slider.disabled = true; clearView();
    }
    const file = input.files[0];
    if (!file) { slider.disabled = !image; if (image) await render(); else status.textContent = 'Choose an image to begin.'; return; }
    const control = new AbortController();
    if (isMask) maskRead = control; else imageRead = control;
    const expectedImage = image;
    if (isMask) { slider.disabled = true; clearView(); }
    status.textContent = `Reading ${file.name} locally…`;
    try {
      if (isMask && !image) throw Error('Choose an image before its mask.');
      const vol = await ParsecNifti.openVolume(file,control.signal);
      if (control.signal.aborted) return;
      if (isMask) {
        if (image !== expectedImage) return;
        if (!ParsecNifti.matchingGeometry(image,vol)) throw Error('Mask dimensions or spatial geometry do not match the image.');
        mask = vol;
      } else {
        image = vol;
        slider.max = String(vol.nz - 1); slider.value = String(Math.floor(vol.nz / 2)); maskInput.disabled = false;
      }
      slider.disabled = false;
      await render();
    } catch (e) {
      if (control.signal.aborted) return;
      if (isMask) { mask = null; maskInput.value = ''; slider.disabled = !image; }
      clearView();
      status.textContent = `Cannot display file: ${e.message}${isMask ? ' Move the slice slider to view the CT without an overlay.' : ''}`;
    }
  }
  imageInput.addEventListener('change',()=>load(imageInput,false));
  maskInput.addEventListener('change',()=>load(maskInput,true));
  slider.addEventListener('input',()=>{
    sliceRead?.abort(); clearTimeout(sliderTimer); clearView();
    sliderTimer = setTimeout(render,100);
  });
})();
