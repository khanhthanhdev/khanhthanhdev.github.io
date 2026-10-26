// Loads the series' CIFAR-10 subset: one PNG atlas, decoded through a canvas into the photos CV.photosFrom builds,
// and the classifiers trained offline on it for parts 2, 5 and 6. Each loader returns the same promise every time, so several
// figures on a page share one download.
(function () {
  "use strict";

  const CV = window.CV;
  const ATLAS = "/assets/img/cv/cifar-subset.png";
  let loading = null;
  // base64 → signed bytes, for the trained weights
  const bytes = (b64) => Int8Array.from(atob(b64), (c) => (c.charCodeAt(0) << 24) >> 24);

  CV.loadPhotos = function () {
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        // the PNG carries no colour profile, so the canvas reads back exactly the bytes in the file
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        resolve(CV.photosFrom(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width));
      };
      img.onerror = reject;
      img.src = ATLAS;
    });
    return loading;
  };

  // { models, mean, input }: models one per λ (CV.linearModels), input(photo) the vec they read.
  let linear = null;
  CV.loadLinear = function () {
    if (linear) return linear;
    linear = Promise.all([CV.loadPhotos(), fetch("/assets/json/cv/linear-photos.json").then((r) => r.json())]).then(([photos, json]) => {
      const mean = CV.meanVec(photos.train);
      return { models: CV.linearModels(json, bytes), mean, input: (p) => CV.centred(p, mean) };
    });
    return linear;
  };

  // Part 5's convnet (CV.photoNet).
  let convnet = null;
  CV.loadConvNet = function () {
    if (convnet) return convnet;
    convnet = fetch("/assets/json/cv/convnet-photos.json")
      .then((r) => r.json())
      .then((json) => CV.photoNet(json, bytes));
    return convnet;
  };

  // Part 6's deeper convnet (CV.deepNet), and its occlusion results on the 100 test photos, worked out offline:
  // { patch, stride, pred, at(i, r, c) → the four class probabilities with the patch at row r, column c }.
  let deep = null;
  CV.loadDeepNet = function () {
    if (deep) return deep;
    deep = fetch("/assets/json/cv/deep-photos.json")
      .then((r) => r.json())
      .then((json) => CV.deepNet(json, bytes));
    return deep;
  };
  let occlusion = null;
  CV.loadOcclusion = function () {
    if (occlusion) return occlusion;
    occlusion = fetch("/assets/json/cv/occlusion.json")
      .then((r) => r.json())
      .then((json) => {
        const q = Uint8Array.from(atob(json.q), (c) => c.charCodeAt(0));
        const n = (32 - json.patch) / json.stride + 1;
        return {
          patch: json.patch,
          stride: json.stride,
          n,
          pred: json.pred,
          at: (i, r, c) => Array.from(q.subarray(((i * n + r) * n + c) * 4, ((i * n + r) * n + c) * 4 + 4), (v) => v / 255),
        };
      });
    return occlusion;
  };
})();
