
export function moveSlide(slides, index, dir) {
  const to = index + dir;
  if (to < 0 || to >= slides.length) return slides;
  const out = [...slides];
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}

export function duplicateSlide(slides, index) {
  const out = [...slides];
  out.splice(index + 1, 0, structuredClone(slides[index]));
  return out;
}

export function deleteSlide(slides, index) {
  if (slides.length <= 1) return slides;
  return slides.filter((_, i) => i !== index);
}

export function replaceSlide(slides, index, slide) {
  const out = [...slides];
  out[index] = structuredClone(slide);
  return out;
}

export function setPresenter(slides, index, presenter) {
  const out = [...slides];
  const slide = { ...out[index] };
  if (presenter) slide.presenter = presenter;
  else delete slide.presenter;
  out[index] = slide;
  return out;
}
