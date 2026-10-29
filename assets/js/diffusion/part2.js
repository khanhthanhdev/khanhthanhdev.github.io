// Part 2 of the diffusion series: the forward process in closed form. One scene: two steps compose into one, any
// step can be reached in one jump, one point's possible futures, the signal-to-noise ratio, and the linear and
// cosine schedules compared on the toy and on a small picture. Every number comes from DM.
(function () {
  "use strict";

  const DM = window.DM;
  const { fmt } = window.TF.view;
  const { plot, chart, picture, at, sub } = DM.view;
  DM.scenes = DM.scenes || {};

  const N = 800;
  const T = 200; // the toy chain, as in part 1
  const BIG = 1000; // the schedules of the papers
  const narrow = window.matchMedia("(max-width: 991.98px)");
  const beside = (x, y, opts) => (narrow.matches ? [0, 450, opts] : [x, y, opts]);
  const pt = (p, d = 2) => `(${fmt(p[0], d)}, ${fmt(p[1], d)})`;

  // A 32 × 32 test picture: sky getting lighter towards the horizon, a sun, hills, and a house. Values in [−1, 1].
  function scene32() {
    const n = 32;
    const v = new Float64Array(n * n);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        let g = -0.1 + 0.9 * (j / n); // sky
        if ((i - 24) ** 2 + (j - 7) ** 2 < 14) g = 0.95; // sun
        if (j > 20 + 2.5 * Math.sin(i / 4)) g = -0.55; // hills
        if (i >= 6 && i <= 15 && j >= 17 && j <= 26) g = 0.7; // house wall
        if (j >= 11 && j < 17 && Math.abs(i - 10.5) <= j - 11) g = -0.95; // roof
        if (i >= 9 && i <= 11 && j >= 21 && j <= 26) g = -0.8; // door
        if (i >= 13 && i <= 14 && j >= 19 && j <= 20) g = -0.3; // window
        v[j * n + i] = g;
      }
    return v;
  }

  DM.scenes.part2 = function (stage) {
    const { svg, strip } = stage;
    const data = DM.DATASETS.swissroll;
    const toy = DM.schedule("linear", T);
    const lin = DM.schedule("linear", BIG);
    const cos = DM.schedule("cosine", BIG);
    const x0 = DM.sample(data, N, 1).xs;
    const chain = DM.forwardChain(x0, toy, 11);
    const one = at(x0, 17);
    const img = scene32();
    const imgNoise = DM.gaussian(img.length / 2, 5); // fixed noise, so scrubbing t changes only the mix

    const main = plot(svg, { range: 3 });
    const right = plot(svg, { range: 3 });
    const curve = chart(svg, { width: 250, height: 140, xTitle: "step t" });
    const picL = picture(svg, { width: 220 });
    const picR = picture(svg, { width: 220 });
    const layout = DM.layout(svg, () => ({ main, right, curve, picL, picR }));

    stage.note(`${N} points · toy chain of ${T} steps · schedules of the papers: ${BIG} steps`);

    const curveOf = (sch, f, every = 2) => {
      const v = [];
      for (let t = 0; t <= sch.T; t += every) v.push([t, f(sch, t)]);
      return v;
    };
    const signal = (sch, t) => Math.sqrt(sch.alphaBar[t]);
    const noisyPicture = (sch, t) => {
      const a = Math.sqrt(sch.alphaBar[t]);
      const b = Math.sqrt(1 - sch.alphaBar[t]);
      return img.map((v, k) => a * v + b * imgNoise[k]);
    };

    function reset() {
      [main, right].forEach((p) => p.view(3).shade(null).rings([]).arrows([]).marks([]).paths([]).corner("").cloud("b", null));
    }

    function render(step, t) {
      reset();

      if (step === "two") {
        // two steps of the chain against one jump with the combined numbers
        const direct = DM.qSample(x0, toy, 2, 5).xt;
        const again = DM.qSample(x0, toy, 2, 6).xt;
        main.title("x₂ two ways: two steps (blue), one jump (orange)").cloud("pts", chain[2], "dm-data");
        main.cloud("b", t > 0.25 ? direct : null, "dm-x0");
        const a = toy.alpha[1] * toy.alpha[2];
        strip(
          `α₁α₂ = ${fmt(toy.alpha[1], 4)} × ${fmt(toy.alpha[2], 4)} = ${fmt(a, 4)} → x₂ = ${fmt(Math.sqrt(a), 4)}·x₀ + ${fmt(Math.sqrt(1 - a), 4)}·ε · ` +
            `distance between the clouds ${fmt(DM.sliced(chain[2], direct), 3)} (two jumps with different noise: ${fmt(DM.sliced(direct, again), 3)})`
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "closed") {
        const k = Math.round(t * T);
        const { xt, eps } = DM.qSample(x0, toy, k, 5);
        main.title(`x${sub(k)} in one jump`).cloud("pts", xt, "dm-data");
        curve.title("ᾱₜ: the share of x₀'s variance left").set({
          series: [{ values: curveOf(toy, (s, u) => s.alphaBar[u]), cls: "dm-data", label: "ᾱₜ" }],
          x: [0, T],
          y: [0, 1],
          cursor: k,
          marks: [{ at: [k, toy.alphaBar[k]], cls: "dm-data" }],
        });
        const a = Math.sqrt(toy.alphaBar[k]);
        const b = Math.sqrt(1 - toy.alphaBar[k]);
        const p = at(x0, 17);
        const e = at(eps, 17);
        strip(`t = ${k} · ᾱ_t = ${fmt(toy.alphaBar[k], 4)} · one point: ${fmt(a, 3)}·${pt(p)} + ${fmt(b, 3)}·${pt(e)} = ${pt(at(xt, 17))}`);
        layout({ main: [0, 0], curve: beside(470, 120) });
        return;
      }

      if (step === "one") {
        const k = Math.max(1, Math.round(t * T));
        const a = Math.sqrt(toy.alphaBar[k]);
        const b = Math.sqrt(1 - toy.alphaBar[k]);
        // 200 possible x_t for this one x_0
        const many = new Float64Array(400);
        for (let i = 0; i < 200; i++) {
          many[2 * i] = one[0];
          many[2 * i + 1] = one[1];
        }
        const { xt } = DM.qSample(many, toy, k, 41);
        const centre = [a * one[0], a * one[1]];
        const track = [];
        for (let u = 0; u <= T; u += 2) track.push([Math.sqrt(toy.alphaBar[u]) * one[0], Math.sqrt(toy.alphaBar[u]) * one[1]]);
        main.title(`where one x₀ can be at step ${k}`).cloud("pts", x0, "dm-data is-faint").cloud("b", xt, "dm-x0 is-strong");
        main
          .paths([{ pts: track, cls: "dm-ink is-faint" }])
          .rings([
            { c: centre, r: b, cls: "dm-ink" },
            { c: centre, r: 2 * b, cls: "dm-ink is-dashed" },
          ])
          .marks([
            { c: one, label: "x₀", cls: "dm-data" },
            { c: centre, label: "√ᾱₜ·x₀", cls: "dm-ink", r: 4 },
          ]);
        strip(
          `q(x_t | x₀) = N(√ᾱ_t·x₀, (1 − ᾱ_t)·I) · centre ${pt(centre)} · spread √(1 − ᾱ_t) = ${fmt(b, 3)} · rings at 1 and 2 spreads · 200 draws in orange`
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "snr") {
        const k = Math.max(1, Math.round(t * T));
        main.title(`x${sub(k)}`).cloud("pts", DM.qSample(x0, toy, k, 5).xt, "dm-data");
        const snr = toy.snr(k);
        curve.title("signal-to-noise ratio ᾱₜ / (1 − ᾱₜ)").set({
          series: [{ values: curveOf(toy, (s, u) => (u === 0 ? null : s.snr(u))).filter((p) => p[1] != null), cls: "dm-data" }],
          x: [0, T],
          y: [1e-5, 1e4],
          yLog: true,
          yTicks: [1e-4, 1, 1e4],
          cursor: k,
          marks: [{ at: [k, snr], cls: "dm-data" }],
        });
        strip(
          `t = ${k} · SNR = ${snr >= 1 ? fmt(snr, snr >= 100 ? 0 : 2) : snr.toExponential(2)} · log₁₀ SNR = ${fmt(Math.log10(snr), 2)} · signal and noise are equal (SNR = 1) after step 51`
        );
        layout({ main: [0, 0], curve: beside(470, 120) });
        return;
      }

      if (step === "schedules") {
        const k = Math.max(1, Math.round(t * BIG));
        main.title(`linear schedule, t = ${k} of ${BIG}`).cloud("pts", DM.qSample(x0, lin, k, 5).xt, "dm-data");
        right.title(`cosine schedule, t = ${k} of ${BIG}`).cloud("pts", DM.qSample(x0, cos, k, 5).xt, "dm-model");
        curve.title("√ᾱₜ: linear (blue), cosine (red)").set({
          series: [
            { values: curveOf(lin, signal, 10), cls: "dm-data" },
            { values: curveOf(cos, signal, 10), cls: "dm-model" },
          ],
          x: [0, BIG],
          y: [0, 1],
          cursor: k,
        });
        strip(`t = ${k} · signal left: linear ${fmt(Math.sqrt(lin.alphaBar[k]), 3)}, cosine ${fmt(Math.sqrt(cos.alphaBar[k]), 3)}`);
        if (narrow.matches) layout({ main: [0, 0, { scale: 0.75 }], right: [320, 0, { scale: 0.75 }], curve: [40, 360] });
        else layout({ main: [0, 0, { scale: 0.75 }], right: [320, 0, { scale: 0.75 }], curve: [660, 90] });
        return;
      }

      if (step === "picture") {
        const k = Math.round(t * BIG);
        picL.title(`linear, t = ${k}`).set(noisyPicture(lin, k));
        picR.title(`cosine, t = ${k}`).set(noisyPicture(cos, k));
        strip(
          `the same picture and the same noise · signal left: linear ${fmt(Math.sqrt(lin.alphaBar[k]), 3)}, cosine ${fmt(Math.sqrt(cos.alphaBar[k]), 3)} · pixels scaled to [−1, 1]`
        );
        layout({ picL: [0, 0], picR: [260, 0] });
        return;
      }

      if (step === "wasted") {
        const low = (sch) => {
          let c = 0;
          for (let u = 1; u <= BIG; u++) if (Math.sqrt(sch.alphaBar[u]) < 0.05) c++;
          return c;
        };
        curve.title("√ᾱₜ: linear (blue), cosine (red), 5% dashed").set({
          series: [
            { values: curveOf(lin, signal, 5), cls: "dm-data" },
            { values: curveOf(cos, signal, 5), cls: "dm-model" },
            {
              values: [
                [0, 0.05],
                [BIG, 0.05],
              ],
              cls: "dm-ink is-dashed",
            },
          ],
          x: [0, BIG],
          y: [0, 1],
          yTicks: [0.05, 1],
        });
        const k = Math.round(t * BIG);
        picL.title(`linear, t = ${k}`).set(noisyPicture(lin, k));
        picR.title(`cosine, t = ${k}`).set(noisyPicture(cos, k));
        strip(`steps with less than 5% of the signal left: linear ${low(lin)} of ${BIG}, cosine ${low(cos)} of ${BIG}`);
        if (narrow.matches) layout({ curve: [40, 0], picL: [0, 240], picR: [260, 240] });
        else layout({ curve: [40, 30], picL: [420, 0, { scale: 0.8 }], picR: [620, 0, { scale: 0.8 }] });
      }
    }

    return { render };
  };
})();
