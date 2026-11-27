#!/bin/sh
# Downloads DNSMOS (Microsoft, CC BY 4.0: https://github.com/microsoft/DNS-Challenge),
# the neural speech-quality predictor used by analyze.py. About 1.4 MB.
set -e
cd "$(dirname "$0")"
mkdir -p models
base=https://raw.githubusercontent.com/microsoft/DNS-Challenge/master/DNSMOS/DNSMOS
for f in sig_bak_ovr.onnx model_v8.onnx; do
  [ -f "models/$f" ] || curl -sSfL -o "models/$f" "$base/$f"
done
echo "DNSMOS models ready in scripts/audio-qa/models"
