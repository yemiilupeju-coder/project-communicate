"""Experiment F: neural vocoder reconstruction with NVIDIA BigVGAN v2 (MIT).

NOT RUN IN THE R&D WORKSPACE: the model weights come from Hugging Face, which
that workspace cannot reach. Run on any machine with internet access. A GPU
is optional: on a CPU, a minute of speech takes a few minutes.

What it tests: is Kokoro's own decoder the source of the buzz? Each clip is
turned into a mel spectrogram and rebuilt by BigVGAN. If the rebuilt clips
sound cleaner in the blind test, a vocoder stage helps; if not, the buzz lives
in the spectrum Kokoro predicts, not in its waveform generation.

    git clone https://github.com/NVIDIA/BigVGAN && cd BigVGAN
    pip install torch librosa soundfile huggingface_hub numpy
    python /path/to/run_bigvgan.py /path/to/vq3/raw out/

Writes out/<voice>/<stage>-bigvgan/<item>.wav for the shipped voice (D), the
source voice (A3) and the best hybrid (X-D2), at 24 kHz.
"""
import glob
import os
import sys

import numpy as np
import soundfile as sf
import torch

import bigvgan  # from the cloned repo
from meldataset import get_mel_spectrogram

RAW, OUT = sys.argv[1], sys.argv[2]
model = bigvgan.BigVGAN.from_pretrained("nvidia/bigvgan_v2_24khz_100band_256x", use_cuda_kernel=False)
model.remove_weight_norm()
model = model.eval()
SR = model.h.sampling_rate  # 24000, Kokoro's rate

for voice in ("girl", "boy"):
    for stage in ("A3-source-int8-slower", "D-generated-shipped", "X-D2-pitch-model+even-filter"):
        out = os.path.join(OUT, voice, f"{stage}-bigvgan")
        os.makedirs(out, exist_ok=True)
        for p in sorted(glob.glob(os.path.join(RAW, voice, stage, "*.f32"))):
            x = torch.from_numpy(np.fromfile(p, np.float32))[None]
            with torch.inference_mode():
                y = model(get_mel_spectrogram(x, model.h)).squeeze().numpy()
            sf.write(os.path.join(out, os.path.basename(p)[:-4] + ".wav"), y, SR)
        print("done", voice, stage)
