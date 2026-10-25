// Part 4 of the computer vision series: backpropagation on computational graphs, then a two-layer network trained
// on the spiral. Graph numbers come from CV.forward/CV.backward, network numbers from CV.trainNet.
(function () {
  "use strict";

  const CV = window.CV;
  const { fmt, narrow } = window.TF.view;
  const { scatter, chart } = window.CL.view;
  const { regions, graph } = CV.view;
  const { select } = CV.controls;
  CV.scenes = CV.scenes || {};

  const SYMBOL = { add: "+", mul: "×", max: "max", neg: "×−1", exp: "exp", addc: "+1", inv: "1/x", double: "×2" };
  const SNAPS = [0, 1, 2, 5, 10, 20, 50, 100, 200, 400, 600];
  const WIDTHS = [2, 5, 10, 40];

  // A graph spec: [id, op | value, inputs, [x, y], label?]. Inputs are the nodes with a number instead of an op.
  function build(spec) {
    return spec.map(([id, op, inputs, at, label]) =>
      typeof op === "number" ? { id, op: "input", value: op, inputs: [], at, label: label ?? id } : { id, op, inputs, at, label: label ?? SYMBOL[op] }
    );
  }

  // (x + y) · z, the first example in the CS231n backprop notes
  const G1 = build([
    ["x", -2, [], [0, 0]],
    ["y", 5, [], [0, 90]],
    ["z", -4, [], [0, 180]],
    ["q", "add", ["x", "y"], [170, 45]],
    ["f", "mul", ["q", "z"], [340, 112]],
  ]);
  // a sigmoid neuron, 1 / (1 + exp(−(w0·x0 + w1·x1 + w2))), cut into its smallest pieces
  const G2 = build([
    ["w0", 2, [], [0, 0], "w₀"],
    ["x0", -1, [], [0, 60], "x₀"],
    ["w1", -3, [], [0, 130], "w₁"],
    ["x1", -2, [], [0, 190], "x₁"],
    ["w2", -3, [], [0, 260], "w₂"],
    ["m0", "mul", ["w0", "x0"], [120, 30]],
    ["m1", "mul", ["w1", "x1"], [120, 160]],
    ["s", "add", ["m0", "m1"], [240, 95]],
    ["d", "add", ["s", "w2"], [340, 180]],
    ["n", "neg", ["d"], [435, 180]],
    ["e", "exp", ["n"], [530, 180]],
    ["p", "addc", ["e"], [625, 180]],
    ["f", "inv", ["p"], [720, 180]],
  ]);
  // the same neuron in two rows, for phones
  const G2_NARROW = {
    w2: [0, 250],
    m0: [110, 30],
    m1: [110, 160],
    s: [210, 95],
    d: [310, 200],
    n: [80, 330],
    e: [170, 330],
    p: [260, 330],
    f: [350, 330],
  };
  // 2 · (x·y + max(z, w)): one gate of each kind
  const G3 = build([
    ["x", 3, [], [0, 0]],
    ["y", -4, [], [0, 70]],
    ["z", 2, [], [0, 160]],
    ["w", -1, [], [0, 230]],
    ["m", "mul", ["x", "y"], [150, 35]],
    ["mx", "max", ["z", "w"], [150, 195]],
    ["a", "add", ["m", "mx"], [290, 115]],
    ["f", "double", ["a"], [420, 115]],
  ]);

  CV.scenes.part4 = function (stage) {
    const { svg, controls, strip, note } = stage;

    /* -------------------------------------------- graphs: values and the order of the backward pass */

    const G2n = G2.map((n) => ({ ...n, at: G2_NARROW[n.id] ?? n.at }));
    const graphs = [G1, G2, G3, G2n].map((nodes) => {
      CV.forward(nodes);
      const visits = CV.backward(nodes);
      const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
      return { nodes, visits, byId };
    });
    const views = graphs.map((G, i) => {
      const v = graph(svg, G.nodes, {
        title: ["f = (x + y) · z", "a sigmoid neuron, gate by gate", "f = 2 · (x·y + max(z, w))", "a sigmoid neuron, gate by gate"][i],
        digits: i % 2 ? 3 : 2,
      });
      const xs = G.nodes.map((n) => n.at[0]);
      const ys = G.nodes.map((n) => n.at[1]);
      v.box = { x: -40, y: Math.min(...ys) - 44, width: Math.max(...xs) + 120, height: Math.max(...ys) - Math.min(...ys) + 80 };
      return v;
    });
    const valuesOf = (G, upTo = Infinity) => Object.fromEntries(G.nodes.filter((_, k) => k < upTo).map((n) => [n.id, n.value]));
    // gradients revealed in backward order: the output first, then each visited node's inputs
    function gradsOf(G, count) {
      const out = G.nodes[G.nodes.length - 1];
      const grads = { [out.id]: out.grad };
      G.visits.slice(0, count).forEach((v) => G.byId[v.id].inputs.forEach((id) => (grads[id] = G.byId[id].grad)));
      return grads;
    }

    /* -------------------------------------------- the spiral and its models */

    const spiral = CV.spiral(1, 60, 3);
    const X = spiral.points.map(CV.input);
    const linear = CV.trainLinear(X, spiral.labels, 3, { steps: 300, lr: 1, reg: 1e-3 }).model;
    const nets = {};
    function net(width) {
      if (!nets[width]) nets[width] = CV.trainNet(X, spiral.labels, 3, { hidden: width, steps: 600, lr: 0.02, snapshots: SNAPS.slice(1) });
      return nets[width];
    }
    const acc = (predict) => CV.accuracy(predict, X, spiral.labels);

    const state = { width: 1 };
    const widthIn = select(
      "hidden units",
      WIDTHS.map((w, i) => [i, String(w)]),
      state.width,
      (v) => {
        state.width = Number(v);
        stage.refresh();
      }
    );
    controls.append(widthIn.wrap);

    const plot = scatter(svg);
    plot.points(spiral.points).colour(spiral.labels);
    const tint = regions(plot);
    plot.box = { x: -4, y: -30, width: 448, height: 474 };
    const lossChart = chart(svg, { title: "loss", width: 240, height: 150, xTitle: "training step" });
    lossChart.box = { x: -40, y: -30, width: 310, height: 216 };
    const layout = CV.layout(svg, () => ({ g1: views[0], g2: views[1], g3: views[2], g2n: views[3], plot, lossChart }));
    const SIDE = [500, 120];

    // The line where hidden unit k switches on, W1[k]·input(p) + b1[k] = 0, clipped to the plot's square.
    function unitLines(model) {
      return model.W1.map((w, k) => {
        // input(p) = (p − 5) / 5, so the line in plot units is w·p = 5(w·1) − 5b
        const c = 5 * (w[0] + w[1]) - 5 * model.b1[k];
        const pts = [];
        [0, CV.BOX].forEach((x) => Math.abs(w[1]) > 1e-9 && pts.push([x, (c - w[0] * x) / w[1]]));
        [0, CV.BOX].forEach((y) => Math.abs(w[0]) > 1e-9 && pts.push([(c - w[1] * y) / w[0], y]));
        const inside = pts.filter(([x, y]) => x >= -1e-9 && x <= CV.BOX + 1e-9 && y >= -1e-9 && y <= CV.BOX + 1e-9);
        return inside.length >= 2 ? [inside[0], inside[inside.length - 1], "is-best"] : null;
      }).filter(Boolean);
    }

    /* -------------------------------------------- render */

    const steps = {
      graph(t) {
        const G = graphs[0];
        const k = Math.min(G.nodes.length, 3 + Math.floor(t * 1.3 * (G.nodes.length - 2)));
        views[0].show(valuesOf(G, k), {}, G.nodes[k - 1].op === "input" ? null : G.nodes[k - 1].id);
        layout({ g1: [0, 0] });
        const q = G.byId.q.value;
        strip(
          k < 4
            ? "inputs x = −2, y = 5, z = −4"
            : k < 5
              ? `q = x + y = ${fmt(q, 0)}`
              : `f = q · z = ${fmt(q, 0)} × (${fmt(G.byId.z.value, 0)}) = ${fmt(G.byId.f.value, 0)}`
        );
      },

      backward(t) {
        const G = graphs[0];
        const count = Math.min(G.visits.length, Math.floor(t * 1.3 * (G.visits.length + 1)));
        views[0].show(valuesOf(G), gradsOf(G, count), count ? G.visits[count - 1].id : "f");
        layout({ g1: [0, 0] });
        const say = [
          "start at the output: ∂f/∂f = 1",
          "f = q·z: ∂f/∂q = z = −4 and ∂f/∂z = q = 3",
          "q = x + y: ∂q/∂x = ∂q/∂y = 1, so ∂f/∂x = ∂f/∂y = 1 × (−4) = −4",
        ];
        strip(say[count]);
      },

      chain() {
        const G = graphs[0];
        views[0].show(valuesOf(G), gradsOf(G, G.visits.length), "q");
        layout({ g1: [0, 0] });
        strip("at the + gate: local gradient ∂q/∂x = 1, times the gradient arriving from above, ∂f/∂q = −4, gives ∂f/∂x = −4");
      },

      neuron(t) {
        const k2 = narrow.matches ? 3 : 1;
        const G = graphs[k2];
        const n = G.nodes.length;
        const fwd = Math.min(n, 5 + Math.floor((t / 0.45) * (n - 5)));
        const back = t < 0.5 ? 0 : Math.min(G.visits.length, Math.floor(((t - 0.5) / 0.4) * (G.visits.length + 1)));
        const grads = t < 0.5 ? {} : gradsOf(G, back);
        const focus = t < 0.5 ? (G.nodes[fwd - 1].op === "input" ? null : G.nodes[fwd - 1].id) : back ? G.visits[back - 1].id : "f";
        views[k2].show(valuesOf(G, fwd), grads, focus);
        layout({ [k2 === 3 ? "g2n" : "g2"]: [0, 0] });
        const b = G.byId;
        strip(
          t < 0.5
            ? `forward: w·x + w₂ = ${fmt(b.d.value)}, and 1 / (1 + e^−${fmt(b.d.value)}) = ${fmt(b.f.value)}`
            : back < G.visits.length
              ? `backward, gate by gate: local gradient × upstream gradient`
              : `∂f/∂w = (${fmt(b.w0.grad)}, ${fmt(b.w1.grad)}, ${fmt(b.w2.grad)}) · ∂f/∂x = (${fmt(b.x0.grad)}, ${fmt(b.x1.grad)})`
        );
      },

      patterns(t) {
        const G = graphs[2];
        const order = ["a", "mx", "m"];
        const k = Math.min(2, Math.floor(t * 3.3));
        views[2].show(valuesOf(G), gradsOf(G, G.visits.length), order[k]);
        layout({ g3: [0, 0] });
        strip(
          [
            "add gate: passes the gradient (2) unchanged to both inputs",
            "max gate: routes the whole gradient (2) to the larger input, z; w gets 0",
            "multiply gate: each input gets the other input's value × the gradient: x gets −4 × 2 = −8, y gets 3 × 2 = 6",
          ][k]
        );
      },

      network(t) {
        const showNet = t > 0.35;
        const model = net(40).net;
        tint.set(showNet ? CV.netPredict(model) : (x) => CV.argmax(CV.linearScores(linear, x)));
        plot.title(showNet ? "two layers, 40 hidden units" : "linear classifier (part 2)");
        plot.links([]);
        layout({ plot: [0, 0] });
        strip(
          showNet
            ? `scores = W₂ · max(0, W₁x + b₁) + b₂ · ${fmt(100 * acc(CV.netPredict(model)), 1)}% of points right`
            : `scores = Wx + b · ${fmt(100 * acc((x) => CV.argmax(CV.linearScores(linear, x))), 0)}% of points right`
        );
      },

      training(t) {
        const run = net(40);
        const k = Math.min(SNAPS.length - 1, Math.floor(t * 1.2 * SNAPS.length));
        const step = SNAPS[k];
        const model = run.shots[step];
        tint.set(CV.netPredict(model));
        plot.title(`after ${step} step${step === 1 ? "" : "s"} of Adam`);
        plot.links([]);
        const every = run.history.filter((_, i) => i % 20 === 0);
        lossChart.set(
          [{ values: every.map((v, i) => (i * 20 <= step ? v : null)) }],
          null,
          every.map((_, i) => (i % 5 === 0 ? String(i * 20) : "")),
          1.6
        );
        layout({ plot: [0, 0], lossChart: SIDE });
        strip(`step ${step}: loss ${fmt(run.history[step], 3)} · ${fmt(100 * acc(CV.netPredict(model)), 0)}% of points right`);
      },

      width() {
        const w = WIDTHS[state.width];
        const run = net(w);
        tint.set(CV.netPredict(run.net));
        plot.title(`${w} hidden units`);
        plot.links([]);
        layout({ plot: [0, 0] });
        strip(
          `${w} hidden units: ${6 * w + 3} parameters · ${fmt(100 * acc(CV.netPredict(run.net)), 1)}% of points right · loss ${fmt(run.history[run.history.length - 1], 3)}`
        );
      },

      units() {
        const run = net(5);
        tint.set(CV.netPredict(run.net));
        plot.title("5 hidden units, and where each one switches on");
        plot.links(unitLines(run.net));
        layout({ plot: [0, 0] });
        strip(
          `each line is where one hidden unit's W₁x + b₁ crosses 0. Off on one side, growing on the other: ${fmt(100 * acc(CV.netPredict(run.net)), 1)}% right`
        );
      },
    };

    function render(step, t) {
      widthIn.wrap.hidden = step !== "width";
      const slow = !nets[40] && ["network", "training"].includes(step);
      note(slow ? "training the network in your browser…" : "");
      if (step !== "units") plot.links([]);
      steps[step](t);
      if (slow) note("");
    }

    return { render };
  };
})();
