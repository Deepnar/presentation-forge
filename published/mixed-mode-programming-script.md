# Recent Trends in Mixed-Mode Programming for High-Performance Computing — speaker script

The words each presenter says aloud, slide by slide. A slide carries the shape of the argument; this script carries the connection behind it — the full story the bullets point at, grounded in the deck's research. Roughly 60–90 seconds per content slide.


<!-- slide:0 -->
## Slide 1 — Recent Trends in Mixed-Mode Programming for High-Performance Computing

_Presenter: — · title_

Think about the last time you scaled a code and hit a wall at the node boundary. That's where we live now. Over the next few minutes I'll trace why MPI plus OpenMP became our default, and why task runtimes, GPU offload, and one-sided PGAS are now pulling it in new directions, starting with the context that made hybrid unavoidable.

<!-- /slide:0 -->

<!-- slide:1 -->
## Slide 2 — CONTEXT: THE MIXED-MODE TURN

_Presenter: — · section_

We've settled one debate only to inherit a harder one. Everyone runs MPI+X now, but whether that X should be OpenMP, tasks, GPU offload, or PGAS changes everything about performance and programmability. In this first part, I'll frame that mixed-mode turn — why pure MPI broke down, and what complexity we risk if we combine models carelessly — so we can judge each option fairly.

<!-- /slide:1 -->

<!-- slide:2 -->
## Slide 3 — OPENING MOVEMENTS: THE FULL ARC

_Presenter: Raunak SIngh · agenda_

Every modern supercomputer is trying to tell you something: adding more MPI ranks stopped working a long time ago. I'm Raunak Singh, and I want to give you the full arc up front, because every piece of this talk feeds one argument — mixed-mode is how HPC scales. We start where we have to start, with context: why MPI+X became the default, how OpenMP took over inside the node, and where that scaling wall actually hit. Then we get concrete about why hybrid MPI plus OpenMP wins — flat MPI chokes the network interface, while threading shrinks that brutal PME message traffic and eases NUMA pressure. From there we move to task-based runtimes, where dependency-driven DAG scheduling replaces static decomposition so communication can hide behind compute. Then accelerators, where CUDA, SYCL and HIP offload stops being an optimization and, with GPU-resident update and direct GPU communication now enabled by default, becomes the execution model. And we close the loop with one-sided and PGAS. I'll show you DiOMP, which folds PGAS into OpenMP on LLVM with GASNet-EX, evaluated on Ookami and Perlmutter at up to 25% higher bandwidth and down to 45% on latency. So let's start at the beginning — why did we need mixed-mode at all?

<!-- /slide:2 -->

<!-- slide:3 -->
## Slide 4 — MIXED-MODE: DE FACTO HPC PARADIGM

_Presenter: Rishit Singh · bullets_

Here's the reality we all program against now. If you're running distributed memory, you're running MPI+X, that's the de facto standard the DiOMP study calls out in arXiv:2409.02830, and for good reason. Think about what happens with pure MPI on a modern node. All cores share one network interface, so every rank is fighting for the same wire. Push OpenMP threads inside the rank instead, and with N threads you cut the number of communicating processes and therefore the number of messages by a factor of N. That's your inter-node traffic collapsing. Why does that matter? Because we live near the strong-scaling limit, around ~200 particles per core if you want maximum throughput. You can't get there with ranks alone. Now OpenMP isn't infinite — it scales well to 12-24 threads on Intel and 6-8 threads on AMD, which is no coincidence, that's basically a socket. And yes, combining MPI with OpenMP creates additional overhead at small process counts. I've seen that cost. But the benefit in highly parallel runs is far more pronounced, especially with communication-heavy PME. Add in 2-4 CPU nodes where non-uniform memory access effects dominate, and threading inside the node isn't an optimization anymore, it's how you avoid choking the memory bus. That's the context for everything we'll unpack next.

<!-- /slide:3 -->

<!-- slide:4 -->
## Slide 5 — WHY HYBRID: FLAT MODELS HIT THE WALL

_Presenter: — · section_

Here's the wall we've all hit. Nodes got fat while networks didn't, and neither flat model survives that mismatch. So in this next part we'll unpack why hybrid MPI plus OpenMP wins, from NUMA effects and shared network interfaces to why pure MPI chokes and pure OpenMP can't leave the node. Let's dig into the bottleneck first.

<!-- /slide:4 -->

<!-- slide:5 -->
## Slide 6 — FLAT MPI VS PURE OPENMP: TWO CEILINGS

_Presenter: Rudrapratap Singh · vs_

Think about what happens when you try to scale a real simulation and it just stops getting faster. On one side, if I make every core an MPI rank, I'm pushing all those ranks through the same network interface. Intra-node MPI is efficient, but between nodes it becomes the limiter — especially with PME, because that 3D FFT needs global, all-to-all communication. The more ranks join that exchange, the worse the parallel efficiency gets. So you think, fine, I'll stay inside the node with threads and avoid the network entirely. That works — up to a point. OpenMP scales well for up to 12–24 threads on Intel and 6–8 threads on AMD CPUs, and then NUMA effects bite. Memory and cache just can't keep up as you spread across sockets, and of course threads alone give me no reach across the node boundary. That's the trap this part of the talk is about: neither pure model can carry us to larger machines, especially with fat nodes on a slow network. Hybrid is the escape hatch. MPI gives me the cross-node reach, while OpenMP threads inside the rank cut the number of communicating processes, and therefore the number of messages, by a factor of N. Fewer hops, less pressure on that one interface. Next, I'll show how that trade actually plays out.

<!-- /slide:5 -->

<!-- slide:6 -->
## Slide 7 — HYBRID AS LAYERING: MPI ACROSS NODES, OPENMP ACROSS CORES

_Presenter: Sakshi Singh · bullets_

Picture this: you put 64 ranks on one fat node and they all try to squeeze through a single network interface at once. That traffic jam is why pure MPI stops scaling. After laying out how multicore nodes evolved, I'm giving you the layering that answers it. I keep MPI for what it is good at — coordination across nodes, each rank owning its domain's memory and talking over the network. Inside the rank I use OpenMP threads that share that memory and never have to send a message. With fewer ranks per node I get far fewer messages hitting that one interface, which matters because PME's 3D FFT needs all-to-all global communication and quickly becomes the limiting factor. That also tames NUMA. Current multiprocessor machines can have 2-4 CPUs with a core count as high as 64, while memory and cache lag behind, so keeping threads inside a socket avoids costly crossings. That is why OpenMP scales well up to 12-24 threads on Intel and 6-8 threads on AMD. Yes, mixing MPI and OpenMP adds overhead at small counts, but at scale it pays off — I start measuring around ~200 particles per core if you need maximum throughput, where one rank per core hits the strong-scaling limit. You see this directly in GROMACS mdrun with -ntmpi and -ntomp, and separate PME ranks kicking in automatically at > 16 processes when you have at least 12 threads, which sets up our next look at tuning that trade.

<!-- /slide:6 -->

<!-- slide:7 -->
## Slide 8 — TASK-BASED RUNTIMES: DEPENDENCIES OVER DECOMPOSITION

_Presenter: — · section_

We've seen why mixing MPI with OpenMP helps, but static ranks still leave you hand-tuning every exchange. What if you stopped decomposing the machine and started describing the work itself? That's the shift ahead: we'll look at runtimes that build a dynamic task graph from your data dependencies, then overlap communication, migrate work, and balance load for you.

<!-- /slide:7 -->

<!-- slide:8 -->
## Slide 9 — TASK-BASED: DEPENDENCIES, NOT BARRIERS

_Presenter: Udaypratap Singh · flow_

Think about every MPI barrier you've ever waited on while one rank finished straggling work — that wait is exactly what we're trying to eliminate. Instead of telling the machine when to synchronize, you just tell it what each piece of work needs and produces, its inputs and outputs, and you let the runtime infer the ordering. At every step it assembles that into a DAG, and any task whose dependencies are complete launches asynchronously, no global fence required. That's why this scales across nodes and devices. Because once the runtime sees the whole graph, it can place work by cost — short-range nonbonded on the GPU while bonded and long-range PME stay where they fit best, shifting load between PP ranks and PME work to keep both sides busy. In GROMACS that automated CPU-GPU load-balancing is literally shifting cutoff work to balance them. It can also overlap and move data smarter — instead of staging halo and PP-PME transfers through the CPU, you do direct GPU-GPU communication, which is now enabled by default on supported setups in the 2025 release, unless you turn it off with GMX_DISABLE_DIRECT_GPU_COMM. And finally you cut the tax of launching tiny kernels in fast-iterating runs with CUDA graphs from the 2023 release, triggered with GMX_CUDA_GRAPH, scheduling entire graphs at once.

<!-- /slide:8 -->

<!-- slide:9 -->
## Slide 10 — GPU OFFLOAD: FROM STAGED COPIES TO RESIDENT KERNELS

_Presenter: — · section_

We've tamed CPU cores with threads and tasks, but the real muscle now sits on the accelerator. In this next part we trace how GROMACS moved past staging every coordinate and force through the CPU. With GPU-resident mode and direct GPU communication enabled by default in the 2025 release, data stays on the device and the CPU becomes a true partner.

<!-- /slide:9 -->

<!-- slide:10 -->
## Slide 11 — GPU OFFLOAD STACK: DIRECTIVES TO SILICON

_Presenter: Vicky Singh · layered-architecture_

For a long time we treated the GPU like a peripheral — ship data over, wait for an answer, copy it back every single step. That mindset is what kills performance, and flipping it is what this whole section is about. We have just talked about splitting work into tasks on the host, now we follow that work onto the device. Think of the stack from top to bottom. At the top you and I want to stay portable, so we start with pragma-based directives like OpenACC and OpenMP target for offload. Underneath that, those pragmas have to land somewhere real, and that is the runtime layer — CUDA, SYCL, HIP, OpenCL — where you actually control the device. The real win comes in the next two layers. Instead of launching thousands of tiny kernels, we keep work alive with persistent kernels, CUDA graphs and async launch, so you stop paying launch latency over and over. And instead of bouncing coordinates and forces back to the CPU each step as in force-offload, we go GPU-resident with direct GPU communication, so data stays where it is computed. At the bottom that all still has to run on NVIDIA, AMD and Intel silicon behind a common abstraction. Get this stack right, and the accelerator stops being an attachment and starts acting like a peer — and that is what unlocks the performance evidence we will dig into next.

<!-- /slide:10 -->

<!-- slide:11 -->
## Slide 12 — ONE-SIDED & PGAS: REMOTE MEMORY WITHOUT THE HANDSHAKE

_Presenter: — · section_

What if you could just read your neighbor's memory without asking permission every time? That's the promise of one-sided communication, and it's why we're turning there next. I'll show you how DiOMP fuses PGAS directly into OpenMP with LLVM and GASNet-EX, delivering up to 25% higher bandwidth and 45% lower latency than MPI+OpenMP, and what that unlocks for real codes.

<!-- /slide:11 -->

<!-- slide:12 -->
## Slide 13 — ONE-SIDED PGAS: REMOTE PUT/GET WITHOUT HANDSHAKE

_Presenter: Vishesh Singh · diagram_

Think about how much time we waste just agreeing to communicate. With classic MPI plus OpenMP, every exchange is two-sided. I want to send, you have to be ready to receive. That handshake means matching, synchronization, waiting — and at scale, that waiting dominates. What if we just removed it? That's the idea behind partitioned global address space. Each node exports its memory into one shared global space. Then when my OpenMP code on Node 0 needs data from Node 1, it simply issues a put or a get. The remote side doesn't wake up, doesn't post a receive, isn't involved at all. That's exactly what DiOMP does. You keep writing familiar OpenMP, the LLVM compiler infrastructure lowers it to PGAS operations, and GASNet-EX carries those one-sided puts and gets underneath. And this isn't just elegance. When tested with micro-benchmarks and application kernels on Ookami from Stony Brook University and NERSC Perlmutter, DiOMP delivered up to 25% higher bandwidth and down to 45% on latency compared to MPI+OpenMP. So after wrestling with tasks and GPUs, we're asking whether the messaging layer itself was holding us back — which sets up our deeper dive into when one-sided actually wins.

<!-- /slide:12 -->

<!-- slide:13 -->
## Slide 14 — PERFORMANCE EVIDENCE: WHO WINS AT SCALE

_Presenter: — · section_

We've argued theory long enough 2 now let's see what actually survives contact with hardware. In this next part we'll put hybrid MPI+OpenMP head-to-head with PGAS approaches using hard measurements. You'll see GROMACS tuning lessons from the field, then DiOMP on Ookami and Perlmutter with up to 25% higher bandwidth and down to 45% on latency. Numbers decide.

<!-- /slide:13 -->

<!-- slide:14 -->
## Slide 15 — DIOMP: 25% HIGHER BANDWIDTH, 45% LOWER LATENCY

_Presenter: Divyajoyt Sinha · chart_

Here's where we stop arguing about models in theory and start measuring what actually moves bytes. We've spent the last few minutes on why one-sided, PGAS-style thinking should be simpler and leaner than two-sided MPI plus OpenMP, now I want to show you it is faster too. What you're looking at is DiOMP, our effort to integrate PGAS concepts directly into the OpenMP programming model, built on the LLVM compiler infrastructure and the GASNet-EX communication library. No explicit sends and receives, just a global view with efficient one-sided communication under the hood. We put it head-to-head against conventional MPI+OpenMP using micro-benchmarks and application kernels on two very different machines, Ookami at Stony Brook and NERSC Perlmutter. Normalized to MPI+OpenMP, DiOMP delivers up to 25% higher bandwidth and down to 45% on latency. And remember for that second bar, lower is better, so shorter means faster synchronization, less waiting at scale. That combination matters because bandwidth drives your large transfers and latency decides your small-message, strong-scaling limit. This is just our opening datapoint for performance evidence, next we'll unpack where those wins hold up in real kernels and why they grow at scale.

<!-- /slide:14 -->

<!-- slide:15 -->
## Slide 16 — WHY HYBRID SCALES: MEASURED GROMACS LIMITS

_Presenter: Deepesh Sonar · checklist_

Forget the theory for a minute — here's where flat MPI physically runs out of road. The GROMACS tuning guides put a number on it: around 200 particles per core. Push finer than that and domain decomposition just can't feed every rank, communication swamps computation, and adding more MPI ranks hurts you. That's exactly the regime where fewer, fatter hybrid ranks win. Why? Because threading itself has a ceiling. OpenMP scales well up to 12 to 24 threads on Intel and only 6 to 8 on AMD — past that you don't add threads, you add ranks. And the killer at scale is PME. That long-range solve needs a 3D FFT with all-to-all global communication, and beyond about 16 processes it chokes. Splitting off dedicated PME ranks is the hybrid fix that lets PP work keep moving. And be honest about cost: hybrid is not free. At small counts the OpenMP overhead loses, the message-count saving only pays off at high core counts. That crossover is the whole case. Same logic on GPUs — GPU-resident mode with direct GPU communication cuts CPU staging, and typically one rank per GPU is best. Get that mapping wrong and you throttle the node. Keep these ceilings in mind, because every speedup I'm about to show you only makes sense against them.

<!-- /slide:15 -->

<!-- slide:16 -->
## Slide 17 — DIRECTIONS: WHERE MIXED-MODE GOES NEXT

_Presenter: — · section_

We've seen the evidence, now the real question is where do we go from here? The next part pulls the threads together into practical direction: PGAS ideas folding into OpenMP, GPU-resident execution becoming the default, and what that means for productive distributed-memory code. Let's map the most promising path forward for high-performance mixed-mode programming.

<!-- /slide:16 -->

<!-- slide:17 -->
## Slide 18 — DIRECTIONS: FUSION → PERSISTENCE → EXASCALE

_Presenter: Vedant Sud · roadmap_

So if you've been wondering, does any of this actually hold together at scale, here's my answer: yes, and we finally have the receipts to prove it. We've spent the last section looking at performance in pieces — hybrid threading, offload, one-sided. The next step is fusion. That DiOMP work I mentioned is the clearest signal. Instead of bolting MPI boilerplate onto OpenMP, it puts PGAS primitives directly inside OpenMP, built on the LLVM compiler infrastructure with the GASNet-EX communication library. They tested it with micro-benchmarks and application kernels on Ookami from Stony Brook University and NERSC Perlmutter, and that's where you get up to 25% higher bandwidth and down to 45% on latency compared to MPI+OpenMP. Phase two is persistence — keeping the update and constraints resident so data stays on the GPU. CUDA graphs came in the 2023 release to trim launch overhead, and direct GPU communication is now enabled by default since 2025, so we bypass that CPU staging entirely. And that sets up 2026 and beyond: distributed PME decomposition with cuFFTMp or HeFFTe, HIP support for AMD CDNA, running GPU-aware MPI across NVLINK nodes. That's the exascale path, and next I'll tell you what I'd actually bet on.

<!-- /slide:17 -->

<!-- slide:18 -->
## Slide 19 — REFERENCES & CLOSE: THE EVIDENCE TRAIL

_Presenter: — · section_

We've built a big case for hybrid MPI plus OpenMP, task runtimes, GPU offload, and one-sided communication, so now let's hold it accountable. I will trace the evidence trail behind those claims, from the DiOMP PGAS work to the GROMACS tuning guidance, and then pull it together into what you should actually do next.

<!-- /slide:18 -->

<!-- slide:19 -->
## Slide 20 — SOURCE RECORD: MIXED-MODE EVIDENCE

_Presenter: Dhwani Tandon · bibliography_

If you are going to retool how you program at scale, you deserve receipts, not slogans. So I want to close by showing you exactly where every performance claim I made comes from. The headline result on PGAS comes from Baodi Shan and colleagues in Towards a Scalable and Efficient PGAS-based Distributed OpenMP, arXiv:2409.02830 published 4 Sep 2024. They built DiOMP on LLVM and GASNet-EX and measured it on Ookami and Perlmutter, where it achieved up to 25% higher bandwidth and down to 45% on latency compared to MPI+OpenMP. That is the backbone for what I argued about one-sided communication. For the practical tuning side, I leaned on the GROMACS project itself. The current Getting good performance from mdrun guide is how we grounded thread-MPI versus MPI choices, OpenMP thread counts, GPU offload flags, and PME rank counts. The archived 5.1.1 version of that same guide gives us the baseline for SIMD kernel selection, the -ntmpi, -ntomp and -npme controls, and that strong-scaling rule of thumb around 200 particles per core. And the Reference Manual's domain decomposition chapters define the PP versus PME split, dynamic load balancing, update groups and GPU-resident constraints. You've seen the evidence; next I'll wrap what it means you should do Monday morning.

<!-- /slide:19 -->

<!-- slide:20 -->
## Slide 21 — MIXED-MODE: FUSE, OFFLOAD, REMOTE — THEN SCALE

_Presenter: — · closing_

So here is where it all lands. We layered one-sided PGAS under hybrid MPI+OpenMP, and let GPUs own the hot loops, and DiOMP proves why with up to 25% higher bandwidth and down to 45% on latency. GROMACS proves it scales with GPU-resident offload and direct GPU communication. Measure on your node and start hybrid today.

<!-- /slide:20 -->
