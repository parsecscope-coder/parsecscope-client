# Official real CT files for research testing

Source: [KiTS23](https://github.com/neheller/kits23), Nicholas Heller and the KiTS23 contributors. Images are hosted in the Hugging Face repository linked by the official downloader.

**Data terms:** CC BY-NC-SA 4.0. The maintainers require contact for commercial purposes; see the [source terms](https://github.com/neheller/kits23#license-and-attribution).

| Case | CT download | Reference mask | Compressed CT size |
| --- | --- | --- | --- |
| case_00002 | [CT .nii.gz](https://huggingface.co/datasets/neheller/KiTS-Challenge-Imaging/resolve/65f1f295873a326230153c7e1de0c7dba10f0b29/images/case_00002.nii.gz) | [Mask .nii.gz](https://raw.githubusercontent.com/neheller/kits23/c1088353084c17b8882a11db71429e7c022b7785/dataset/case_00002/segmentation.nii.gz) | 97.2 MiB |
| case_00003 | [CT .nii.gz](https://huggingface.co/datasets/neheller/KiTS-Challenge-Imaging/resolve/65f1f295873a326230153c7e1de0c7dba10f0b29/images/case_00003.nii.gz) | [Mask .nii.gz](https://raw.githubusercontent.com/neheller/kits23/c1088353084c17b8882a11db71429e7c022b7785/dataset/case_00003/segmentation.nii.gz) | 113.2 MiB |

Save each image and its mask in a separate case folder. Select the CT image as input; use the mask only as a reference overlay. The labels are 0 background, 1 kidney, 2 tumor, 3 cyst.

Both original pairs were downloaded, hashed and consumed by the native engine on 28 September 2026. Case 00002 was used for training and case 00003 for held-out patch validation in a tiny engineering probe. These are demonstration files, not an independent clinical test set. Native file compatibility does not establish model accuracy.

The images use FLOAT64 storage. Decompression and float-tensor conversion require substantially more memory than the download size; use a desktop for these full scans. The public ParsecScope page currently confirms local file selection only; server-side masking is not enabled.

Pinned revisions and SHA-256 hashes are in real_sources.json. Downloads remain at the original publishers.
