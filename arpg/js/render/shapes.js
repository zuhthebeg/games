// Shared shape painter: offset and facing match shapeHitsCircle, no hit-size shrink.
export function shapePath(graphic, shape, scale = 1) {
  if (shape.type === 'circle')
    graphic.circle(shape.offset || 0, 0, shape.radius * scale);
  else if (shape.type === 'rect')
    graphic.rect(shape.offset || 0, -shape.width * scale / 2, shape.length * scale, shape.width * scale);
  else if (shape.type === 'cone') {
    const halfAngle = shape.arc * Math.PI / 360;
    graphic.moveTo(0, 0).lineTo(Math.cos(halfAngle) * shape.range * scale, -Math.sin(halfAngle) * shape.range * scale)
      .arc(0, 0, shape.range * scale, -halfAngle, halfAngle).closePath();
  }
  return graphic;
}
// Outline ticks are deliberately on the full-size boundary even while fill grows.
export function pattern(graphic, shape, color, locked) {
  const length = shape.type === 'rect' ? shape.length : shape.type === 'cone' ? shape.range : shape.radius;
  if (shape.type === 'rect') {
    for (let x = 0; x <= length; x += 24)
      graphic.moveTo((shape.offset || 0) + x, -shape.width / 2)
        .lineTo((shape.offset || 0) + x, Math.min(shape.width / 2, -shape.width / 2 + 8));
    if (locked)
      for (let x = 0; x < length; x += 24)
        graphic.moveTo((shape.offset || 0) + x, shape.width / 2)
          .lineTo((shape.offset || 0) + Math.min(length, x + 8), shape.width / 2 - 8);
  }
  else {
    const halfAngle = shape.type === 'cone' ? shape.arc * Math.PI / 360 : Math.PI;
    for (let a = -halfAngle; a <= halfAngle; a += .24)
      graphic
        .moveTo((shape.offset || 0) + Math.cos(a) * length, Math.sin(a) * length)
        .lineTo((shape.offset || 0) + Math.cos(a) * (length - 7), Math.sin(a) * (length - 7));
  }
  graphic.stroke({ color, width: locked ? 2 : 1, alpha: .95 });
}
