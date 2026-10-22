# Iron Wall: Three.js vertical slice

Mission 6 of *Tzeva Adom: Seven Fronts* (13–14 April 2024), ported from the 2D canvas game into a standalone Three.js slice built to a 2020-era 3D RTS visual bar. The original game in `../index.html` is untouched.

```sh
cd slice && python3 -m http.server 8790
# open http://127.0.0.1:8790/    (Chrome; F8 performance overlay, F9 30-second frame-time capture)
```

| Path | Contents |
| --- | --- |
| `docs/BRIEF.md` | Architecture, event contract, rules |
| `docs/streams/` | The six workstreams and their rubrics |
| `docs/CRITIC.md` | Critic protocol |
| `../benchmark/TARGET.md` | The visual and feel benchmark |
| `status.html` | Live status of the builder/critic loop |
| `tools/` | Dev-only scripts: screenshots, captures, perf probe, regression (`cd tools && npm install` first) |
