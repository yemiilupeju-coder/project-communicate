"""Experiment 4: neural voice conversion with kNN-VC (MIT licence).

NOT RUN IN THE R&D WORKSPACE: its model weights are downloaded from GitHub
releases, which that workspace cannot reach. Run it on a machine with normal
internet access. A GPU is not needed: it runs on a CPU in about real time.

What it tests: convert the untouched adult voice (E1) into a child identity.
Voice conversion always needs a target voice. We have no child recordings and
will not use any without rights and consent, so the target here is our own
synthetic child: the E5 renders. That answers the useful question: can VC
carry a synthetic child identity onto a different source voice, with better
quality than generating it directly?

    pip install torch torchaudio numpy soundfile
    python run_knn_vc.py <exp-dir> <out-dir>

Writes <out-dir>/girl-e4-knnvc/ and <out-dir>/boy-e4-knnvc/, with the same
file names as the other experiments, at 16 kHz (kNN-VC's output rate).
"""
import glob
import os
import sys

import torch

exp, out = sys.argv[1], sys.argv[2]
knn_vc = torch.hub.load("bshall/knn-vc", "knn_vc", prematched=True, trust_repo=True, pretrained=True, device="cpu")

for prof in ("girl", "boy"):
    target = sorted(glob.glob(os.path.join(exp, f"{prof}-e5-neural", "*.wav")))
    # Matching set: the narration and conversational items, about a minute of
    # speech. Words and assembled items are held out from the reference.
    ref = [f for f in target if os.path.basename(f)[0] in "234"]
    matching_set = knn_vc.get_matching_set(ref)
    d = os.path.join(out, f"{prof}-e4-knnvc")
    os.makedirs(d, exist_ok=True)
    for src in sorted(glob.glob(os.path.join(exp, f"{prof}-e1-original", "*.wav"))):
        query = knn_vc.get_features(src)
        wav = knn_vc.match(query, matching_set, topk=4)
        import torchaudio

        torchaudio.save(os.path.join(d, os.path.basename(src)), wav[None], 16000)
    print("done", prof)
