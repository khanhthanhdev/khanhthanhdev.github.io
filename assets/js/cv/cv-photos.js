// Loads the series' CIFAR-10 subset: one PNG atlas, decoded through a canvas into the photos CV.photosFrom builds,
// and part 2's linear classifiers, trained offline on it. Each loader returns the same promise every time, so several
// figures on a page share one download.
(function () {
  "use strict";

  const CV = window.CV;
  const ATLAS = "/assets/img/cv/cifar-subset.png";
  let loading = null;

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
    const bytes = (b64) => Int8Array.from(atob(b64), (c) => (c.charCodeAt(0) << 24) >> 24);
    linear = Promise.all([CV.loadPhotos(), fetch("/assets/json/cv/linear-photos.json").then((r) => r.json())]).then(([photos, json]) => {
      const mean = CV.meanVec(photos.train);
      return { models: CV.linearModels(json, bytes), mean, input: (p) => CV.centred(p, mean) };
    });
    return linear;
  };
})();
