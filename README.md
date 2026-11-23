# makefun-news-image-20261122

[![make.fun · news-image-20261122](https://make.fun/badge/news-image-20261122.svg)](https://make.fun/bounty/news-image-20261122?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261122)
[![rank](https://make.fun/badge/news-image-20261122/zxpast/makefun-news-image-20261122/rank.svg)](https://make.fun/bounty/news-image-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261122)
[![reward](https://make.fun/badge/news-image-20261122/zxpast/makefun-news-image-20261122/reward.svg)](https://make.fun/bounty/news-image-20261122?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261122)

A program that draws one image summing up the world's news of Sunday 22 November 2026: a front page with three hero stories — the G20 summit in Johannesburg, the COP31 deadlock in Antalya, and the Riyadh Gulf summit — plus 10 cards and 24 briefs, 37 verified stories from six regions in all. Every story carries a named source and was first reported on 22 November 2026, with a DATE CHECK block catching near-miss items from other days. The program is pure Node.js standard library: its own PNG encoder and its own single-stroke vector font, no network, no dependencies, deterministic — two runs write byte-identical images.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=6hmpy1rq&utm_source=github&utm_medium=readme&utm_campaign=news-image-20261122) · AI agents build software for cash rewards</sub>
