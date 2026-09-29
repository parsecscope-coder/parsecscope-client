(() => {
  'use strict';
  const $=id=>document.getElementById(id), canvas=$('view'), ctx=canvas.getContext('2d');
  const inputs={image:$('image'),reference:$('mask'),prediction:$('prediction')};
  const volumes={image:null,reference:null,prediction:null}, reads={};
  const slider=$('slice'), overlay=$('overlay'), status=$('status');
  let sliceRead=null,timer;
  const colors=[[0,0,0],[54,212,177],[255,175,84],[133,170,255]];
  const clear=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);$('sliceNumber').value='—';};
  const value=(v,d,i)=>v.read(d,i*v.voxelBytes,v.little)*v.slope+v.intercept;
  function controls(){
    inputs.reference.disabled=inputs.prediction.disabled=slider.disabled=!volumes.image;
    overlay.disabled=!volumes.image;
    for(const kind of ['reference','prediction'])overlay.querySelector(`option[value="${kind}"]`).disabled=!volumes[kind];
    if(overlay.value!=='none'&&!volumes[overlay.value])overlay.value='none';
  }
  async function render(){
    sliceRead?.abort();if(!volumes.image)return;
    const signal=(sliceRead=new AbortController()).signal;
    const image=volumes.image,kind=overlay.value,mask=volumes[kind],z=Number(slider.value);
    clear();$('overlayDescription').textContent=kind==='reference'?'Reference mask · supplied annotation':kind==='prediction'?'Prediction mask · supplied model output; accuracy not verified':'CT image · no overlay';
    status.textContent=`Reading slice ${z+1} / ${image.nz} locally…`;
    try{
      const [pixels,labels]=await Promise.all([image.slice(z,signal),mask?mask.slice(z,signal):null]);if(signal.aborted)return;
      canvas.width=image.nx;canvas.height=image.ny;const frame=ctx.createImageData(image.nx,image.ny);
      for(let y=0;y<image.ny;y++)for(let x=0;x<image.nx;x++){
        const index=y*image.nx+x,i=4*((image.ny-1-y)*image.nx+x),raw=value(image,pixels,index);
        const grey=Number.isFinite(raw)?Math.max(0,Math.min(255,Math.round((raw+160)*255/380))):0;
        frame.data[i]=frame.data[i+1]=frame.data[i+2]=grey;frame.data[i+3]=255;
        if(labels){const label=Math.round(value(mask,labels,index));if(label>0&&label<colors.length)for(let c=0;c<3;c++)frame.data[i+c]=Math.round(.4*grey+.6*colors[label][c]);}
      }
      ctx.putImageData(frame,0,0);$('sliceNumber').value=`${z+1} / ${image.nz}`;
      status.textContent=`${image.nx} × ${image.ny} × ${image.nz} voxels · slice ${z+1} loaded locally · ${labels?kind+' overlay':'CT only'}. Files remain local. No inference or upload.`;
    }catch(e){if(!signal.aborted){sliceRead.abort();clear();status.textContent=`Cannot display slice: ${e.message}`;}}
  }
  async function load(file,kind){
    clearTimeout(timer);sliceRead?.abort();reads[kind]?.abort();volumes[kind]=null;
    if(kind==='image'){
      $('exampleDescription').textContent='Local image selected. Reference annotations and predictions are supplied separately.';
      for(const other of ['reference','prediction']){reads[other]?.abort();volumes[other]=null;inputs[other].value='';}
    }
    controls();clear();if(!file){if(volumes.image)await render();else status.textContent='Choose an image to begin.';return;}
    const signal=(reads[kind]=new AbortController()).signal,expected=volumes.image;
    status.textContent=`Reading ${file.name} locally…`;
    try{
      if(kind!=='image'&&!expected)throw Error('Choose the CT image first.');
      const volume=await ParsecNifti.openVolume(file,signal);if(signal.aborted)return;
      if(kind!=='image'){
        if(expected!==volumes.image)return;
        if(!ParsecNifti.matchingGeometry(expected,volume))throw Error(`${kind==='prediction'?'Prediction':'Reference'} dimensions or spatial geometry do not match the image.`);
      }
      volumes[kind]=volume;
      if(kind==='image'){slider.max=String(volume.nz-1);slider.value=String(Math.floor(volume.nz/2));overlay.value='none';}
      controls();if(kind!=='image')overlay.value=kind;await render();
    }catch(e){if(!signal.aborted){volumes[kind]=null;inputs[kind].value='';controls();clear();status.textContent=`Cannot display file: ${e.message} Choose another file or move the slice slider to continue.`;}}
  }
  for(const [kind,input] of Object.entries(inputs))input.addEventListener('change',()=>load(input.files[0],kind));
  overlay.addEventListener('change',render);
  slider.addEventListener('input',()=>{sliceRead?.abort();clearTimeout(timer);clear();timer=setTimeout(render,100);});
  $('sample').addEventListener('click',async()=>{
    const button=$('sample');button.disabled=true;status.textContent='Loading the synthetic example…';
    try{
      const urls=['images/synthetic_01_ct.nii.gz','reference_masks/synthetic_01_mask.nii.gz'];
      const files=await Promise.all(urls.map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('Sample download failed.');return new File([await r.blob()],url.split('/').pop());}));
      await load(files[0],'image');await load(files[1],'reference');
      if(volumes.reference)$('exampleDescription').textContent='Synthetic software-test example loaded. The overlay is a supplied reference annotation, not an AI prediction.';
    }catch(e){status.textContent=e.message;}finally{button.disabled=false;}
  });
  controls();
})();
