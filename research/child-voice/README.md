# Child voice R&D (prototype, not production)

Makes young-sounding voices from Kokoro's adult voices by generating them
inside the model, instead of transforming finished audio.

- `make_pitch_model.py`: adds three inputs to Kokoro's ONNX graph
  (`f0_scale`, `f0_range`, `f0_ref`) that edit the predicted pitch curve
  before the neural decoder uses it. Works on the fp32 and int8 models.
- `childvoice.py`: the control system. A `Profile` (age, girl or boy, timbre
  source, prosody source, brightness, pitch range, speed) is calibrated by
  measurement and exported as a style table plus three pitch numbers.
- `vt_dir_flat.npy`, `bright_dir.npy`: the learned style-space directions
  (vocal-tract size with brightness held; brightness alone), learned from
  Kokoro's 54 voices (`vt_dir_1.npy` is the raw vocal-tract direction).
- `transforms.py`: the comparison methods (PSOLA via Praat, WORLD, the
  Childrenize method reimplemented from its paper, the envelope filter).
- `render_experiments.py`, `render_neural.py`: render experiments 1-6.
- `measure_experiments.py`: measurements; `make_kit.py`: the listening kit.
- `listening-test.html`: the blind test (open in Chrome, pick the kit folder).
- `vc/run_knn_vc.py`: experiment 4 (neural VC), for a machine with internet.

Needs: the Kokoro v1.0 ONNX model and voices-v1.0.bin (paths in kv.py),
`pip install onnx onnxruntime pyworld praat-parselmouth librosa soundfile`.
No child recordings are used anywhere.
