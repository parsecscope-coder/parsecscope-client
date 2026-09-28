#!/usr/bin/env python3
"""Deterministic mathematical CT-like phantoms for client file/viewer testing."""
import gzip
import hashlib
import json
from pathlib import Path
import struct
import zipfile

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap

ROOT = Path(__file__).resolve().parents[1] / 'samples'
LABELS = {0: 'background', 1: 'kidney-shaped regions', 2: 'tumor-shaped region', 3: 'cyst-shaped region'}
COLORS = ['#00000000', '#36d4b1', '#ffaf54', '#85aaff']


def nifti(array, spacing, angle, datatype):
    header = bytearray(352)
    def put(offset, fmt, *values):
        struct.pack_into('<' + fmt, header, offset, *values)
    nz, ny, nx = array.shape
    put(0, 'i', 348)
    put(40, '8h', 3, nx, ny, nz, 1, 1, 1, 1)
    put(70, 'hh', datatype, 16 if datatype == 4 else 8)
    put(76, '8f', 1, *spacing, 1, 1, 1, 1)
    put(108, 'fff', 352, 1, 0)
    header[123] = 2  # Millimetres.
    description = b'ParsecScope SYNTHETIC phantom; no patient data; not model output'
    header[148:148 + len(description)] = description
    put(254, 'h', 1)  # Explicit sform; qform unused.
    c, s = np.cos(angle), np.sin(angle)
    affine = np.array([[spacing[0]*c, -spacing[1]*s, 0, 0],
                       [spacing[0]*s, spacing[1]*c, 0, 0],
                       [0, 0, spacing[2], 0]], dtype=float)
    affine[:, 3] = -affine[:, :3] @ (np.array([nx, ny, nz]) - 1) / 2
    for row in range(3):
        put(280 + 16 * row, '4f', *affine[row])
    header[344:348] = b'n+1\0'
    dtype = '<i2' if datatype == 4 else 'u1'
    return bytes(header) + array.astype(dtype).tobytes(order='C'), affine.tolist()


def build_case(number, title, spacing, angle=0):
    shape = (64, 96, 96)  # Z,Y,X in storage; X is fastest.
    z, y, x = np.meshgrid(*[(np.arange(n)-(n-1)/2)*v for n,v in zip(shape,spacing[::-1])], indexing='ij')
    def ellipsoid(cx, cy, cz, rx, ry, rz):
        return ((x-cx)/rx)**2 + ((y-cy)/ry)**2 + ((z-cz)/rz)**2 <= 1
    body = (x/113)**2 + (y/91)**2 <= 1
    inner = (x/104)**2 + (y/82)**2 <= 1
    muscle = ((x/100)**2 + (y/78)**2 <= 1) & ~((x/86)**2 + (y/67)**2 <= 1)
    image = np.full(shape, -1000, dtype=np.int16)
    image[body] = 35
    image[inner] = -85
    image[muscle] = 42
    image[ellipsoid(-46,22,15,39,33,53)] = 60
    image[ellipsoid(60,25,0,22,28,44)] = 53
    image[ellipsoid(0,-45,0,16,16,110)] = 650
    image[ellipsoid(0,-45,0,10,10,110)] = 170
    labels = np.zeros(shape, dtype=np.uint8)
    for sign in (-1,1):
        kidney = ellipsoid(sign*42,-17,0,19,28,48)
        notch = ellipsoid(sign*26,-12,0,10,15,35)
        labels[kidney & ~notch] = 1
    image[labels == 1] = 105
    if number >= 2:
        lesion = ellipsoid(48,-20,0,10,11,16) & (labels == 1)
        labels[lesion] = 2
        image[lesion] = 72
    if number == 3:
        cyst = ellipsoid(-49,-18,2,8,10,13) & (labels == 1)
        labels[cyst] = 3
        image[cyst] = 12
    # Smooth deterministic variation, not a simulation of clinical acquisition.
    texture = np.rint(4*np.sin(x/9) + 3*np.cos(y/13) + 2*np.sin(z/15)).astype(np.int16)
    image[body] += texture[body]
    case_id = f'synthetic_{number:02d}'
    image_path, mask_path = ROOT/'images'/f'{case_id}_ct.nii.gz', ROOT/'reference_masks'/f'{case_id}_mask.nii.gz'
    raw, affine = nifti(image, spacing, angle, 4)
    image_path.write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
    raw_mask, _ = nifti(labels, spacing, angle, 2)
    mask_path.write_bytes(gzip.compress(raw_mask, compresslevel=9, mtime=0))
    if number == 1:
        (ROOT/'images'/f'{case_id}_ct.nii').write_bytes(raw)
    counts = {str(i): int(np.count_nonzero(labels == i)) for i in range(4)}
    voxel_ml = float(np.prod(spacing)/1000)
    row = {'id': case_id, 'title': title, 'kind': 'synthetic',
           'shape_xyz': list(shape[::-1]), 'spacing_mm': list(spacing),
           'storage_to_world_affine': affine, 'rotation_degrees': float(np.rad2deg(angle)),
           'image': str(image_path.relative_to(ROOT)), 'reference_mask': str(mask_path.relative_to(ROOT)),
           'label_voxels': counts, 'label_volume_ml': {key: value*voxel_ml for key,value in counts.items()},
           'image_sha256': hashlib.sha256(image_path.read_bytes()).hexdigest(),
           'mask_sha256': hashlib.sha256(mask_path.read_bytes()).hexdigest()}
    fig, axes = plt.subplots(1,2,figsize=(8,4.2),facecolor='#f6f9fc')
    for ax in axes:
        ax.imshow(image[32], cmap='gray',vmin=-160,vmax=220,origin='lower',interpolation='nearest')
        ax.axis('off')
    axes[0].set_title('Synthetic CT-like input',fontsize=11,color='#183348')
    axes[1].imshow(np.ma.masked_equal(labels[32],0),cmap=ListedColormap(COLORS),vmin=0,vmax=3,
                   alpha=.72,origin='lower',interpolation='nearest')
    axes[1].set_title('Known reference mask',fontsize=11,color='#183348')
    fig.suptitle(title,fontsize=15,color='#183348',weight='bold')
    fig.text(.5,.06,'Mathematical phantom • No patient data • Reference labels, not AI predictions',ha='center',fontsize=8,color='#4d667b')
    fig.tight_layout(rect=(0,.10,1,.92))
    fig.savefig(ROOT/'previews'/f'{case_id}.png',dpi=115)
    plt.close(fig)
    return row


def main():
    for folder in ('images','reference_masks','previews'):
        (ROOT/folder).mkdir(parents=True,exist_ok=True)
    cases = [build_case(1,'01 · Two kidney-shaped regions',(2.5,2.5,3.0)),
             build_case(2,'02 · Added tumor-shaped region',(2.5,2.5,3.0)),
             build_case(3,'03 · Tumor + cyst shapes, rotated geometry',(2.5,2.5,4.0),np.deg2rad(12))]
    metadata = {'version':'1.0.0','generated_date':'2026-09-28','data_type':'synthetic mathematical phantoms',
                'not_for':'clinical decisions or measuring real-patient model accuracy',
                'labels':LABELS,'cases':cases}
    (ROOT/'synthetic_cases.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print(json.dumps({'cases':len(cases),'compressed_images_bytes':sum((ROOT/c['image']).stat().st_size for c in cases)}))


if __name__ == '__main__':
    main()
