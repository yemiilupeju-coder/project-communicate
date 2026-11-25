# Voice model files

The child voices are made with Kokoro-82M (Apache 2.0, hexgrad), int8 ONNX,
from the kokoro-onnx releases. The model is committed in `public/voice-model/`
as four parts under 25 MB (the host's file limit), with the two voice tables
(`af_bella.bin`, `am_michael.bin`) and misaki's US English dictionary
(`lexicon-us-<hash>.json`, Apache 2.0). Devices download these on request; the
build reads them from there too, so nothing needs to be downloaded here.

To render the built-in packs after vocabulary changes:

    npm run voices:texts
    npm run voices:render

Needs ffmpeg on PATH. Clips are cached in `scripts/voices/.cache/` by phrase,
so only new phrases are rendered.
