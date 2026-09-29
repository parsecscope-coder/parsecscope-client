# ParsecScope client test images — v1.0.1

Updated 29 September 2026.

**This ZIP contains synthetic images only. The 97.2 MiB and 113.2 MiB real KiTS23 CT files are NOT included.**

For the real scans, use the separate image and mask links in
[REAL_CT_DOWNLOADS.md](REAL_CT_DOWNLOADS.md) or open
https://parsecscope-coder.github.io/parsecscope-client/samples/#real-ct.
Keep each CT and its matching mask in a separate case folder. Full scans expand
to approximately 522 MiB and 540 MiB and exceed the local browser viewer limit.

## What clients can test today

1. Unzip ParsecScope_Client_Test_Images_v1.zip.
2. Open index.html for examples, or viewer.html to inspect stored Z slices and optional reference mask overlays locally in the browser. The viewer supports NIfTI-1 UINT8, INT16, FLOAT32 and FLOAT64, with volumes up to 8 GiB expanded and 4 megapixels per stored slice. It reads only the selected slice; gzip is streamed from the beginning when changing slices. Extract to .nii for faster browsing.
3. On https://parsecscope-coder.github.io/parsecscope-client/, select a CT file
   from images/ using the Research CT volume file chooser.
4. Expect the filename, size and supported-format confirmation. The public
   page currently provides local file selection; it does not upload the scan
   or produce an AI mask. This pack does not enable those backend features.
5. For a NIfTI viewer or an enabled test backend, load the image first and the
   matching reference_masks/ file as a label overlay. Record the case ID,
   browser/viewer, observed result and any error when reporting a problem.

## Synthetic examples included

| Case | Test purpose | Known labels |
| --- | --- | --- |
| synthetic_01 | Basic file loading; plain and gzip versions contain identical voxels | 0 background, 1 kidney-shaped regions |
| synthetic_02 | Small additional labeled region | 0 background, 1 kidney shapes, 2 tumor shape |
| synthetic_03 | Three foreground classes, anisotropic voxels, rotated affine | 0 background, 1 kidney shapes, 2 tumor shape, 3 cyst shape |

Each volume is 96 × 96 × 64 voxels. Images are INT16 CT-like mathematical
phantoms, with UINT8 matching masks and millimetre spatial metadata. They are
deliberately simplified geometric shapes, not real patients or realistic
clinical acquisitions. The masks come from the generating shapes, not an AI
model. The PNG images show storage-plane slice 32 (zero-based); their display
is not a radiological orientation convention.

Use files in images/ as image input. Files in reference_masks/ are expected
labels for comparison, not input scans. Tumor/cyst names describe intended
class mapping, not clinical findings. Synthetic cases cannot establish
real-patient accuracy. No patient data is embedded in this ZIP.

The native engine loaded each pair, checked geometry and all labels, and
extracted a 16-cubed patch successfully. Counts match synthetic_cases.json.
The uncompressed and gzip versions of case 01 were also checked for equality.
See validation.json. No training or AI inference was performed for this pack.

## Files and usage

- images/: synthetic NIfTI volumes; .nii.gz is ready to load without unzipping
  its gzip layer. A plain .nii duplicate is included for case 01.
- reference_masks/: corresponding synthetic label maps.
- previews/: PNG quick-look images and reference overlays.
- synthetic_cases.json: geometry, label volumes and SHA-256 hashes.
- real_sources.json / REAL_CT_DOWNLOADS.md: pinned official real CT links,
  file sizes, hashes and source terms. Real scans are downloaded separately.
- index.html: offline gallery; real download links require Internet access.

These original synthetic examples are provided for testing ParsecScope.
Third-party real data retains its own source terms. KiTS23 data is CC BY-NC-SA
4.0; the maintainers require contact for commercial purposes. Do not treat
download availability as unrestricted commercial permission.

