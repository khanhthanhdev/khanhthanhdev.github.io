// Loads the series' CIFAR-10 subset: one PNG atlas, decoded through a canvas into the photos CV.photosFrom builds.
// CV.loadPhotos() returns the same promise every time, so several figures on a page share one download.
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
})();
