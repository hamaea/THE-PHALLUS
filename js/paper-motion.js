// Arc-length integration keeps a flexible leaf attached to x=0 at its spine.
// At endpoints the exact flat geometry is recovered. No rigid mesh rotation.
export function turnProfile(progress, width, segments = 48) {
  const p = Math.max(0, Math.min(1, progress)), points = [[0, 0]];
  let x = 0, z = 0;
  for (let i = 1; i <= segments; i++) {
    const u = (i - .5) / segments;
    const angle = Math.PI * p + Math.sin(Math.PI * p) * .65 * Math.sin(Math.PI * u);
    x += Math.cos(angle) * width / segments;
    z += Math.sin(angle) * width / segments;
    points.push([x, z]);
  }
  return points;
}
export function curlRegion(width, amount) {
  const progress = Math.max(0, Math.min(1, amount));
  const eased = progress * progress * (3 - 2 * progress);
  const horizontal = width * (.16 + .72 * eased);
  // Physical lengths, not normalized page UVs: long leg / short leg = sqrt(3).
  return { horizontal, vertical: horizontal / Math.sqrt(3), angle: 2.88 * progress };
}
export const CURL_SETTINGS = Object.freeze({ maxFoldDistance: 1.2 });
export function curlPoint(u, v, width, height, amount, settings = CURL_SETTINGS) {
  const x = u * width, y = (v - .5) * height;
  if (amount <= 0) return [x, y, 0];
  const region = curlRegion(width, amount);
  const norm = Math.hypot(1 / region.horizontal, 1 / region.vertical);
  const nx = 1 / region.horizontal / norm, ny = -1 / region.vertical / norm;
  const distance = Math.max(0, (1 - (width - x) / region.horizontal - (y + height / 2) / region.vertical) / norm);
  if (!distance) return [x, y, 0];
  // Integrate a cylindrical bend by arc length, followed by its tangent.
  // This rounds the crease and retains the existing wide bend profile;
  // capping the angle without the tangent would shrink the triangular flap.
  const bendLength = Math.min(width * .16, region.horizontal * .375);
  const radius = bendLength / region.angle;
  const bent = Math.min(distance, bendLength), theta = bent / radius;
  const remainder = distance - bent;
  const along = radius * Math.sin(theta) + remainder * Math.cos(theta);
  const lift = radius * (1 - Math.cos(theta)) + remainder * Math.sin(theta);
  const displacement = (along - distance) * settings.maxFoldDistance;
  return [x + nx * displacement, y + ny * displacement, lift * settings.maxFoldDistance];
}
export function gestureKind(dx, dy, corner) {
  if (Math.hypot(dx, dy) < 7) return null;
  return corner && dy < -7 && -dy > Math.abs(dx) * 1.2 ? 'curl' : Math.abs(dx) > Math.abs(dy) * 1.1 ? 'turn' : null;
}
export function spring(value, velocity, target, dt) {
  const step = Math.min(dt, .032);
  velocity += ((target - value) * 190 - velocity * 25) * step;
  value += velocity * step;
  if (Math.abs(target - value) < .0004 && Math.abs(velocity) < .003) return [target, 0];
  return [value, velocity];
}

// Progress and recent velocity are normalized to ONE rendered page width.
export const TURN_SETTINGS = Object.freeze({
  completeProgress: .14, returnProgress: .06, flickProgress: .045, flickVelocity: .8,
  moderateFlickProgress: .08, moderateFlickVelocity: .5,
  oppositeVelocity: -.8, reversalProgress: .2, reversalLimit: .35, velocityWindowMs: 120, edgeStart: .5,
  dragOmega: 60, buttonOmega: 21, slowOmega: 15, flickOmega: 30,
});
export function turnRelease(progress, velocity, settings = TURN_SETTINGS, reversalDistance = 0) {
  // Retain a completed drag through small release movements. To undo it,
  // return near the starting edge or make a substantial flick back.
  const peakProgress = progress + reversalDistance;
  const committed = peakProgress >= settings.completeProgress && progress > settings.returnProgress;
  const opposite = velocity <= settings.oppositeVelocity && reversalDistance >= settings.reversalProgress
    && progress <= settings.reversalLimit;
  const flick = progress >= settings.flickProgress && velocity >= settings.flickVelocity;
  const moderate = progress >= settings.moderateFlickProgress && velocity >= settings.moderateFlickVelocity;
  const target = !opposite && (committed || flick || moderate) ? 1 : 0;
  const omega = Math.abs(velocity) >= settings.flickVelocity ? settings.flickOmega
    : Math.abs(velocity) < .3 ? settings.slowOmega : settings.buttonOmega;
  return { target, omega };
}
export function releaseVelocity(samples, now, windowMs = TURN_SETTINGS.velocityWindowMs) {
  const recent = samples.filter(sample => now - sample.time <= windowMs);
  if (recent.length < 2) return 0;
  const first = recent[0], last = recent.at(-1), dt = (last.time - first.time) / 1000;
  return dt >= .008 ? Math.max(-8, Math.min(8, (last.progress - first.progress) / dt)) : 0;
}
export function advanceTurn(value, velocity, target, dt, omega = TURN_SETTINGS.buttonOmega) {
  // Keep aligned momentum, bounded by the critical spring's no-overshoot
  // limit. Reversal/cancellation must not kick farther away before returning.
  const distance = target - value;
  velocity = distance > 0 ? Math.max(0, Math.min(velocity, omega * distance))
    : distance < 0 ? Math.min(0, Math.max(velocity, omega * distance)) : 0;
  const time = Math.min(Math.max(dt, 0), .05), displacement = value - target;
  const c = velocity + omega * displacement, decay = Math.exp(-omega * time);
  const next = target + (displacement + c * time) * decay;
  const speed = (velocity - omega * c * time) * decay;
  if (Math.abs(next - target) < .0003 && Math.abs(speed) < .01) return [target, 0];
  if (next < 0 || next > 1) return [Math.max(0, Math.min(1, next)), 0];
  return [next, speed];
}
export const PAGE_LAYERS = Object.freeze({ coverBaseZ: .002, restingZ: .002 + 16 * .24 / 210,
  thickness: .12 / 210, foldedThickness: .24 / 210 });
// A fixed spine hinge supports the closed cover at the paper stack's top.
// The open cover curves down onto its base near the spine; its outer edges
// then stay at the same height for every interior reading state.
export function coverSupport(u, open) {
  if (!u || !open) return 0;
  const p = Math.max(0, Math.min(1, u / .1)), ease = p * p * (3 - 2 * p);
  return -(PAGE_LAYERS.restingZ - PAGE_LAYERS.coverBaseZ) * ease * open;
}
export function turnLayers(progress) {
  const p = Math.max(0, Math.min(1, progress)), ease = p * p * (3 - 2 * p);
  const gap = PAGE_LAYERS.foldedThickness;
  return { activeZ: PAGE_LAYERS.restingZ + gap * .5 * Math.sin(Math.PI * p),
    destinationZ: PAGE_LAYERS.restingZ - gap * ease,
    revealedZ: PAGE_LAYERS.restingZ - gap * (1 - ease) };
}
export function bookCenter(index, progress = 0, direction = 1, width = 1) {
  const center = state => state === 0 ? width / 2 : state === 18 ? -width / 2 : 0;
  const p = Math.max(0, Math.min(1, progress)), ease = p * p * (3 - 2 * p);
  return center(index) + (center(index + direction) - center(index)) * ease;
}
