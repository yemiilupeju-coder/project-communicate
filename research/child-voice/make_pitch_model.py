"""Add native pitch control to Kokoro-82M.

Kokoro predicts a pitch (F0) curve from text and style, then its neural decoder
(iSTFTNet with a harmonic source) generates the waveform from that curve. Here
the curve is edited inside the graph before the decoder sees it, so the decoder
generates the new pitch itself. There is no DSP pitch shifting afterwards.

New inputs (float32, shape [1]):
  f0_scale  multiply the whole curve (1.0 = unchanged)
  f0_range  expand (>1) or flatten (<1) movement around f0_ref, in log terms
  f0_ref    the centre for f0_range, in Hz (use the voice's median)
New output:
  f0_curve  the curve the decoder actually used (for measurement)

f0' = f0_scale * f0 * (f0 / f0_ref) ** (f0_range - 1), unvoiced (f0 <= 0) kept 0.
"""
import sys

import onnx
from onnx import TensorProto, helper

src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src)
g = m.graph

F0 = "/encoder/Reshape_output_0"  # predicted F0 curve, Hz, one value per frame
users = [n for n in g.node if F0 in n.input and n.name.startswith("/decoder/")]
assert users, "F0 consumer not found"

for name in ("f0_scale", "f0_range", "f0_ref"):
    g.input.append(helper.make_tensor_value_info(name, TensorProto.FLOAT, [1]))

c = lambda name, v: helper.make_node("Constant", [], [name], value=helper.make_tensor(name + "_t", TensorProto.FLOAT, [1], [v]))
nodes = [
    c("cv_one", 1.0),
    c("cv_eps", 1e-3),
    helper.make_node("Relu", [F0], ["cv_pos"]),
    helper.make_node("Div", ["cv_pos", "f0_ref"], ["cv_rel"]),
    helper.make_node("Add", ["cv_rel", "cv_eps"], ["cv_rel_e"]),
    helper.make_node("Sub", ["f0_range", "cv_one"], ["cv_exp"]),
    helper.make_node("Pow", ["cv_rel_e", "cv_exp"], ["cv_gain"]),
    helper.make_node("Mul", ["cv_pos", "cv_gain"], ["cv_ranged"]),
    helper.make_node("Mul", ["cv_ranged", "f0_scale"], ["f0_curve"]),
]
for n in users:
    for i, name in enumerate(n.input):
        if name == F0:
            n.input[i] = "f0_curve"

# insert right after the node that produces F0, keeping topological order
idx = next(i for i, n in enumerate(g.node) if F0 in n.output)
for k, n in enumerate(nodes):
    g.node.insert(idx + 1 + k, n)
g.output.append(helper.make_tensor_value_info("f0_curve", TensorProto.FLOAT, ["b", "frames"]))

# rank of f0_curve matches the Reshape output; checker needs a full shape, ORT does not
onnx.save(m, dst)
print("wrote", dst, "rewired", [n.name for n in users])
