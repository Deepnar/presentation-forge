# Running the gateway's own model locally

The TCET CoE gateway has been unreachable for generation across several
sessions — `/v1/models` answers in under a second while
`/v1/chat/completions` returns nothing in 90s — and every content-quality
question in `docs/ROADMAP.md` is answered on that model and nowhere else. This
is how to run **the same weights** on this machine so those questions stop
being blocked.

This is not the dev fallback. Read *Why not FORGE_DEV_LOCAL_FALLBACK* below
before reaching for that instead.

## What the gateway actually serves

`/v1/models` answers even while generation does not, and it names the model:

```bash
curl -s https://ai.tcetcercd.in/v1/models \
  -H "Authorization: Bearer $FORGE_AUTO_API_KEY" | python3 -m json.tool
```

```
/home/user1/models/Qwen3.6-35B-A3B-NVFP4-Fast
```

Per the CoE Student Developer Guide §3 the `model` field is required and its
value ignored, so that path was never something callers had to match — but it
does tell us exactly what to reproduce: **Qwen3.6-35B-A3B, NVFP4, served by
vLLM**.

## Why this machine can run it

| | |
|---|---|
| Gateway | NVIDIA DGX Spark (GB10 Grace Blackwell) |
| This box | RTX 5090 **Laptop** GPU, `sm_120`, 23.5 GiB usable, 62 GB system RAM |
| Weights | `nvidia/Qwen3.6-35B-A3B-NVFP4` on Hugging Face — the official NVFP4 quantisation, **22 GiB on disk** |

Two facts make it work. NVFP4 is a Blackwell format and this GPU is Blackwell,
so the *same quantisation* runs rather than a GGUF approximation of it. And
vLLM speaks OpenAI-compatible, which is a provider type `config/models.yaml`
already has, so wiring it in costs no code.

What does *not* make it work is the arithmetic everyone reaches for first.

**The weights are 22 GiB, not the 17.5 GiB a naive 4-bit count gives.** The
modelopt checkpoint keeps embeddings, router and lm_head above 4 bits and
stores the NVFP4 scales, so 35B at "4-bit" lands well above 35B/2. Against
23.5 GiB of usable VRAM that does not fit with any KV cache, which is why
`--cpu-offload-gb` is not optional here. Measured: with `--cpu-offload-gb 6`
the load reported 14.2 GiB on device and the card sat at ~18 GiB.

**The constraint is the card, and it is not the one the write-ups assume.**
Published NVFP4-on-5090 reports are the 32 GB desktop part. This is the 24 GB
laptop part. Deck generation sends large prompts — research notes, the type
catalog, the schema — so context length is what will bite, and it is bought
out of a budget that offload has already spent.

## Setup

Deliberately outside the repository, so it can never reach git or the Docker
build context:

```bash
uv venv --python 3.12 ~/.venvs/vllm-forge
uv pip install --python ~/.venvs/vllm-forge/bin/python vllm huggingface_hub
~/.venvs/vllm-forge/bin/hf download nvidia/Qwen3.6-35B-A3B-NVFP4
```

Installed and verified on 2026-09-03: **vLLM 0.28.0, torch 2.13.0+cu130**,
driver CUDA 13.3, `torch.cuda.get_device_properties(0)` reporting `sm_120` and
23.5 GiB. The system Python is 3.14, which is too new for vLLM's wheels — the
3.12 venv is required, not incidental.

Serving (starting point, expect to tune the last three flags):

```bash
~/.venvs/vllm-forge/bin/vllm serve nvidia/Qwen3.6-35B-A3B-NVFP4 \
  --served-model-name qwen3.6 \
  --port 8000 \
  --max-model-len 32768 \
  --kv-cache-dtype fp8 \
  --gpu-memory-utilization 0.92
```

`--served-model-name qwen3.6` matters: it makes the local endpoint answer to
the same label `config/models.yaml` and our own pickers and logs already use.

### Read this before the first start — it will take the machine down

**FlashInfer JIT-compiles its SM120 kernels from source on first use, and
unconstrained it will exhaust this machine.** There are no prebuilt
`sm_120f` mxfp4 group-GEMM kernels in the wheel, so the first `vllm serve`
spawns a matrix of `nvcc`/`cicc` compilations — e4m3 and e5m2 against f16 and
bf16 — many in parallel, each a CUTLASS template instantiation holding 2-3 GB.

Observed on this box: load average 28 on 24 cores and **memory down to 1 GiB
available from 62**, within three minutes of starting the server. The model
had already loaded fine; none of this was inference. Killing the server and
its compiler children returned the machine to 54 GiB available and the GPU to
71 MiB immediately.

So cap the build before starting, and start it when the machine is not needed:

```bash
MAX_JOBS=2 NVCC_THREADS=1 \
  ~/.venvs/vllm-forge/bin/vllm serve nvidia/Qwen3.6-35B-A3B-NVFP4 ...
```

The kernels cache under `~/.cache/flashinfer/`, so this is a one-time cost —
but it is a long one-time cost, and it is not what a "cold start takes ~5
minutes" note prepares you for. Watch `free -g` rather than CPU: the CPU is
the symptom, memory exhaustion is the failure.

## Wiring it into the app

**A provider, not a fallback.** `config/models.yaml` takes it with no code
change at all:

```yaml
  tcet-local:
    type: openai-compatible
    baseURL: http://localhost:8000/v1
    label: Qwen3.6-35B-A3B, local vLLM
    models: [qwen3.6]
    # Same weights as the gateway, so the same capabilities are declared.
    vision_models: [qwen3.6]
    supports_thinking: true
```

`supports_thinking` is the point of the exercise. The gateway runs with
reasoning OFF by default and takes it per request (`chat_template_kwargs.
enable_thinking` plus `reasoning_effort`), the author and critic roles opt in
at `medium`, and **none of that has ever been run** — it is verified
structurally against a recording server and never behaviourally. A local vLLM
serving the same chat template makes it runnable.

It also exercises `cloudSpec`, which builds its own spec instead of going
through `resolveRole` and has silently dropped per-role options before, on
exactly the path a hosted deck takes.

## Why not FORGE_DEV_LOCAL_FALLBACK

That switch exists for a gateway that becomes unreachable **mid-request**. It
warns at boot, warns per role, sets `devLocalFallback` on the response, and is
documented as telling you nothing about output quality — all of which is
correct, because it substitutes a *different, weaker* model (`qwen3-coder:30b`
and friends). Running the same weights is a different claim and needs a
different mechanism, or a genuine result gets recorded as a tainted one.

Use the provider. Leave the fallback off.

## What a result from this is, and is not

**Is:** the same weights at the same quantisation, so "does the deck argue
anything", "is the research any good", "does the report read well" and the
whole thinking-mode experiment are answerable here.

**Is not:** a claim about the gateway's speed, throughput or concurrency. A
24 GB laptop GPU with a capped context is not a DGX Spark shared by fifteen
students, and the serving stack differs. Record which backend produced a
result — `roleAudit()` and Admin → System both report it.

## The experiment this unblocks

```bash
# same brief, thinking off then on, and compare
npm run forge -- new "<topic>" --max-slides 16 --density dense
npm run forge -- generate <slug>
npm run deckscore <slug>
```

Toggle `thinking:` on `roles.author` between runs. `deckscore` catches a
mechanical regression; the prose difference still needs reading. The guide
recommends `xhigh` for "very hard problems, long reasoning chains" and
planning a 16-slide deck may be one — `medium` is currently a guess.
