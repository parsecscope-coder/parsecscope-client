const {test} = require('node:test');
const assert = require('node:assert/strict');
const {gzipSync} = require('node:zlib');
const {openVolume,matchingGeometry} = require('../samples/nifti.js');
function header({nx=3,ny=2,nz=2,type=4,bits=16,little=true,offset=352}={}) {
  const b=new Uint8Array(352),v=new DataView(b.buffer);
  v.setInt32(0,348,little);[3,nx,ny,nz].forEach((x,i)=>v.setInt16(40+i*2,x,little));
  v.setInt16(70,type,little);v.setInt16(72,bits,little);v.setFloat32(108,offset,little);
  [1,1,1,1].forEach((x,i)=>v.setFloat32(76+i*4,x,little));
  b.set([110,43,49,0],344);return b;
}
function fixture(little=true) {
  const b=new Uint8Array(376);b.set(header({little}));
  const v=new DataView(b.buffer);for(let i=0;i<12;i++)v.setInt16(352+2*i,i-6,little);return b;
}
test('522 MiB volume reads only header and selected 1 MiB plane',async()=>{
  const h=header({nx:261,ny:512,nz:512,type:64,bits:64}),calls=[];
  const size=352+261*512*512*8;
  const file={name:'case_00002.nii',size,slice(start,end){calls.push([start,end]);return new Blob([start===0?h:new Uint8Array(end-start)]);},arrayBuffer(){throw Error('Whole-file read forbidden');}};
  const vol=await openVolume(file);const slice=await vol.slice(511);
  assert.equal(slice.byteLength,261*512*8);
  assert.deepEqual(calls,[[0,352],[352+511*261*512*8,size]]);
});
for(const little of [true,false])test(`gzip/raw parity and values (${little?'little':'big'} endian)`,async()=>{
  const b=fixture(little),raw=await openVolume(new File([b],'scan.nii'));
  const gz=await openVolume(new File([gzipSync(b)],'scan.nii.gz'));
  for(const z of [0,1]){
    const a=await raw.slice(z),c=await gz.slice(z);assert.deepEqual(new Uint8Array(a.buffer),new Uint8Array(c.buffer));
    assert.equal(raw.read(a,0,little),z*6-6);
  }
  assert.ok(matchingGeometry(raw,gz));
});
test('truncation, invalid offsets and unsupported voxel types are rejected',async()=>{
  await assert.rejects(openVolume(new File([header()],'short.nii')),/truncated/);
  await assert.rejects(openVolume(new File([header({offset:NaN})],'bad.nii')),/offset/);
  await assert.rejects(openVolume(new File([header({type:99})],'bad.nii')),/Unsupported/);
  const v=await openVolume(new File([gzipSync(header())],'short.nii.gz'));
  await assert.rejects(v.slice(0),/truncated/);
  await assert.rejects(v.slice(-1),/outside/);
});
test('geometry rejects dimensions, transforms and qfac mismatch',async()=>{
  const a=await openVolume(new File([fixture()],'a.nii'));
  assert.ok(!matchingGeometry(a,{...a,nz:3}));
  assert.ok(!matchingGeometry(a,{...a,geometry:[2,1,1]}));
  const b=fixture();new DataView(b.buffer).setInt16(252,1,true);
  const q=await openVolume(new File([b],'q.nii'));new DataView(b.buffer).setFloat32(76,-1,true);
  const q2=await openVolume(new File([b],'q2.nii'));assert.ok(!matchingGeometry(q,q2));
});
test('cancelled raw and gzip reads do not return stale slices',async()=>{
  for(const gz of [false,true]){
    const v=await openVolume(new File([gz?gzipSync(fixture()):fixture()],gz?'s.nii.gz':'s.nii'));
    const c=new AbortController();c.abort();await assert.rejects(v.slice(0,c.signal),{name:'AbortError'});
  }
});
test('zero slope ignores intercept, per NIfTI scaling semantics',async()=>{
  const b=fixture();new DataView(b.buffer).setFloat32(116,25,true);
  const v=await openVolume(new File([b],'s.nii'));assert.equal(v.slope,1);assert.equal(v.intercept,0);
});
function viewer() {
  const vm=require('node:vm'),fs=require('node:fs');
  const nodes=Object.fromEntries(['image','mask','prediction','overlay','overlayDescription','sample','exampleDescription','slice','view','status','sliceNumber'].map(id=>[id,{value:'',files:[],disabled:false,addEventListener(event,fn){this[event]=fn;}}]));
  const options={reference:{disabled:true},prediction:{disabled:true}};
  nodes.overlay.value='none';nodes.overlay.querySelector=s=>options[s.includes('reference')?'reference':'prediction'];
  let frame=null;
  nodes.view.getContext=()=>({clearRect(){frame=null;},createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(f){frame=f;}});
  vm.runInNewContext(fs.readFileSync(require.resolve('../samples/viewer.js'),'utf8'),{document:{getElementById:id=>nodes[id]},ParsecNifti:{openVolume,matchingGeometry},AbortController,setTimeout,clearTimeout});
  return {nodes,get frame(){return frame;}};
}
test('viewer cancels replaced images and clears stale canvas on invalid image',async()=>{
  const v=viewer(),n=v.nodes;let release;
  const slow={name:'slow.nii',size:376,slice(){return {arrayBuffer:()=>new Promise(r=>release=()=>r(fixture().buffer))};}};
  n.image.files=[slow];const pending=n.image.change();
  n.image.files=[new File([fixture()],'new.nii')];await n.image.change();
  release();await pending;
  assert.ok(v.frame);assert.match(n.status.textContent,/slice 2 loaded/);
  n.image.files=[new File([new Uint8Array(10)],'broken.nii')];await n.image.change();
  assert.equal(v.frame,null);assert.ok(n.slice.disabled);assert.equal(n.sliceNumber.value,'—');
});
test('viewer rejects mismatched mask, then restores CT after clearing selection',async()=>{
  const v=viewer(),n=v.nodes;n.image.files=[new File([fixture()],'scan.nii')];await n.image.change();
  const bad=fixture();new DataView(bad.buffer).setFloat32(80,2,true);
  n.mask.files=[new File([bad],'mask.nii')];await n.mask.change();
  assert.match(n.status.textContent,/do not match/);assert.equal(v.frame,null);
  n.mask.files=[];await n.mask.change();assert.ok(v.frame);assert.equal(n.slice.disabled,false);
});
test('reference and prediction remain separate and both clear when the CT changes',async()=>{
  const v=viewer(),n=v.nodes;n.image.files=[new File([fixture()],'scan.nii')];await n.image.change();
  n.mask.files=[new File([fixture()],'reference.nii')];await n.mask.change();
  assert.equal(n.overlay.value,'reference');assert.match(n.overlayDescription.textContent,/supplied annotation/);
  n.prediction.files=[new File([fixture()],'prediction.nii')];await n.prediction.change();
  assert.equal(n.overlay.value,'prediction');assert.match(n.overlayDescription.textContent,/supplied model output/);
  n.overlay.value='reference';await n.overlay.change();assert.match(n.status.textContent,/reference overlay/);
  n.image.files=[new File([fixture()],'other-scan.nii')];await n.image.change();
  assert.equal(n.overlay.value,'none');assert.match(n.status.textContent,/CT only/);
  assert.ok(n.overlay.querySelector('reference').disabled);assert.ok(n.overlay.querySelector('prediction').disabled);
});
