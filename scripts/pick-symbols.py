"""Resolve topic words to OpenMoji symbols.

Usage: python3 scripts/pick-symbols.py <path-to-openmoji-package> <labels.json>

labels.json is a list of [cell id, label] pairs (export TOPICS from
src/features/communicator/topics.ts). Choices in scripts/symbol-choices.json
win (key = cell id or lower-case label; "-" means text only). Otherwise only an
exact annotation match is used, so no word gets a guessed picture. Prints words
without a symbol so a person can review them, and writes scripts/.symbols.json.
"""
import json
import sys

openmoji, labels_path = sys.argv[1], sys.argv[2]
by_annotation = {}
for item in json.load(open(f"{openmoji}/data/openmoji.json")):
    if item.get("skintone"):
        continue
    by_annotation.setdefault(item["annotation"].lower(), item["hexcode"])

choices = json.load(open("scripts/symbol-choices.json"))
resolved, missing = {}, []
for cell_id, label in json.load(open(labels_path)):
    choice = choices.get(cell_id, choices.get(label.lower()))
    if choice == "-":
        continue
    hexcode = by_annotation.get((choice or label).lower())
    if hexcode:
        resolved[cell_id] = hexcode
    else:
        missing.append(f"{cell_id}\t{label}\t{choice or ''}")

json.dump(resolved, open("scripts/.symbols.json", "w"), indent=1, sort_keys=True)
print(f"{len(resolved)} resolved")
print("\n".join(missing))
