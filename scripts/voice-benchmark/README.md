# Voice benchmark

Tools for comparing child-voice options by listening. These scripts are for the
investigation only; none of this code ships in the app.

Every voice reads the same script (`script.json`): the 14 short, conversational
and expressive items, a 116-word narration, and three assembled sentences, each
rendered as joined single words and as a whole sentence.

## 1. Kokoro variants (raw and processed)

```
npx esbuild scripts/voice-benchmark/kokoro.ts --bundle --platform=node --format=esm --outfile=scripts/voice-benchmark/.kokoro.mjs
node scripts/voice-benchmark/.kokoro.mjs <out-folder> <variants.json> <voices-folder>
```

## 2. Cloud voices (run on your own machine)

Create `scripts/voice-benchmark/.env`. It is git-ignored, so never commit it.
Add only the keys you have; any engine without a key is skipped.

```
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=...
OPENAI_API_KEY=...
CARTESIA_API_KEY=...
```

Then run the script (Node 20.6 or later):

```
node --env-file=scripts/voice-benchmark/.env scripts/voice-benchmark/cloud.mjs voice-samples
```

Only the benchmark script is sent to these services. Never send student text or
recordings of students.

For Acapela, add the WAVs by hand to `voice-samples/acapela-ella-girl/` (and so on). Name each
file after its item, for example `1-short-1.wav`.

## 3. Level-match, measure, listen

```
python scripts/voice-benchmark/package.py voice-samples voice-listen
python scripts/voice-benchmark/measure.py voice-samples > measures.json
```

- `package.py` applies gain only, to −20 LUFS with true peak at or below −1 dBTP.
  Dynamics are left alone.
- Open `listening-test.html` in Chrome and pick the `voice-listen` folder. The
  test is blind: voices are shuffled and shown as letters. Export the CSV at the
  end. Nothing is uploaded.

The measurements tell you where to listen. They are not the verdict: choose the
voices by listening.
