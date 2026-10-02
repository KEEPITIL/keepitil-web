# KMOB: testing on a physical iPhone

None of the frame-rate numbers in this repo come from a real device. Headless software rendering (SwiftShader) runs at 1–20 fps whatever the content, so it can only show that the game renders correctly and measure triangles, draw calls and JavaScript time. Fill the table below in from a real iPhone.

## 1. Automatic benchmark (about 70 seconds)

1. On the iPhone, open **https://keepitil.com/games/kmob/?bench=1** in Safari. Plug the phone in, or note the battery level before you start.
2. Tap once so audio can start. The run makes you invulnerable and steps through four crowd sizes, holding each for 15 seconds:
   - **EARLY**: about 100 units
   - **MEDIUM**: about 400
   - **HEAVY**: about 900
   - **EXTREME**: about 1,600
3. The results panel lists, for each tier: average FPS, frame-time p50/p95/p99, the JS heap where Safari exposes it, and the pixel ratio actually used. Adaptive quality lowers the pixel ratio below 48 fps, and the panel shows the ratio each tier ran at.
4. Tap **COPY RESULTS** and paste the JSON into the PR or chat. It includes the device's user agent and GPU string.

For a fixed render scale (no adaptive quality), add `&fixed=1`: `?bench=1&fixed=1`.

## 2. CPU, GPU, memory, thermals (Mac + cable)

- **Safari Web Inspector:** on the iPhone go to Settings › Safari › Advanced › Web Inspector. On the Mac open Safari › Develop › *iPhone* › keepitil.com, then the Timelines tab. Record CPU, JavaScript & Events, Screen (layout and paint), and Memory during each bench tier. Note the peak memory.
- **Xcode Instruments:** use the *Game Performance* or *Activity Monitor* template and attach to the `com.apple.WebKit.WebContent` process. GPU utilisation shows under Metal System Trace.
- **Thermals:** play a normal run for 20 minutes or longer with `?debug=1` showing the fps readout. Note when the phone feels warm and whether the fps line drops over time, which is thermal throttling.
- **Battery:** note the percentage before and after 20 minutes of play. Settings › Battery shows Safari's share.
- **Touch latency:** with `?debug=1`, drag quickly left and right. The launcher should follow without visible lag. A slow-motion phone recording at 240 fps gives a frame-count measurement.

## 3. Interruptions to check

Check each of these:
- Lock or unlock the phone mid-run. The game should pause, and resuming should keep the run.
- Switch apps and come back.
- Take an incoming call or alarm. Game audio should stop and the run should stay paused.
- Rotate the phone. The layout should re-fit, and portrait is recommended.
- Add to Home Screen and launch from the icon.
- Lose the WebGL context: background the page for a long time while other heavy apps run. The game should pause and recover. The browser test simulates this, but it still needs checking on a device.

## Results table (fill in)

| Model | iOS | Early fps | Medium fps | Heavy fps | Extreme fps | p95 ms (heavy) | Peak memory | Thermal notes |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |
