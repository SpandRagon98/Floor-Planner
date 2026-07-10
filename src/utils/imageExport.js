export async function svgElementToPngDataUrl(svgEl, outputWidth = 1600) {
  if (!svgEl) return "";
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svgEl);
  const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
    // Prefer explicit width/height attributes — detached clones (used for
    // normalized exports) have no layout box, so getBoundingClientRect is 0×0.
    const attrWidth = parseFloat(svgEl.getAttribute("width"));
    const attrHeight = parseFloat(svgEl.getAttribute("height"));
    let aspectRatio = attrWidth > 0 && attrHeight > 0 ? attrHeight / attrWidth : 0;
    if (!aspectRatio) {
      const bbox = svgEl.getBoundingClientRect();
      aspectRatio = bbox.width && bbox.height ? bbox.height / bbox.width : 0.6;
    }
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = Math.round(outputWidth * aspectRatio);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}
