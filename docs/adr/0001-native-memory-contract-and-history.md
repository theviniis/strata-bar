# Native ownership of the memory contract and history

The memory widget and popup run in separate windows and must agree on current
values and the last 60 seconds of observations. Rust owns the memory contract and
bounded history, exposes a coherent state through the memory subscription, and
generates frontend types; the frontend also validates received values at runtime.
This avoids per-window histories that reset on popup closure and independent
payload definitions that drift, at the cost of native retention and contract
generation tooling. Collection still pauses when there are no memory consumers.
