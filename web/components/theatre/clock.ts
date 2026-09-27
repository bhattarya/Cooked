// One requestAnimationFrame loop for every canvas in the theatre (orbs, dust, chips),
// so ten orbs cost one frame callback and stay in phase. It sleeps when nobody listens.
type Tick = (seconds: number) => void;

const subscribers = new Set<Tick>();
let raf = 0;

function loop(now: number) {
  raf = requestAnimationFrame(loop);
  subscribers.forEach((fn) => fn(now / 1000));
}

export function onFrame(fn: Tick): () => void {
  subscribers.add(fn);
  if (!raf) raf = requestAnimationFrame(loop);
  return () => {
    subscribers.delete(fn);
    if (!subscribers.size) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}
